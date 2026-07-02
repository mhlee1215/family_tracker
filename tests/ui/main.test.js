import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';
import { readFileSync } from 'node:fs';

const REMOTE_SYNC_TEST_INTERVAL_MS = 60_000;


function dispatchTouch(type, clientY, options = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', {
    configurable: true,
    value: options.ended ? [] : [{ clientY }],
  });
  (options.target || document).dispatchEvent(event);
}

function mockFetch() {
  return vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;

    if (url.endsWith('/app/build.json')) {
      return new Response(JSON.stringify({ build: 1 }), { status: 200 });
    }
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify({ user: null }), { status: 200 });
    }
    if (url.endsWith('/api/ask') && init.method === 'POST') {
      return new Response(JSON.stringify({ answer: '8 hours' }), { status: 200 });
    }

    return new Response(JSON.stringify({ events: [], summary: null, tasks: [], overview: [] }), { status: 200 });
  });
}

function relativeDayHeading(label, offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${label}\n${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)}`;
}

function dayHeadingAtOffset(offsetDays = 0) {
  if (offsetDays === 0) return relativeDayHeading('Today');
  if (offsetDays === 1) return relativeDayHeading('Tomorrow', 1);
  if (offsetDays === -1) return relativeDayHeading('Yesterday', -1);
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
  return `${weekday}\n${shortDate}`;
}

function mockPushNotifications({ permission = 'granted', requestPermission, serviceWorker = {} } = {}) {
  const permissionRequest = requestPermission || vi.fn().mockResolvedValue(permission);
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission, requestPermission: permissionRequest },
  });
  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(undefined),
      ...serviceWorker,
    },
  });
  return permissionRequest;
}

function mockAuthenticatedFetchForNotifications() {
  global.fetch = vi.fn(async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
    if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
    if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
    if (url.endsWith('/api/notification-settings')) {
      return new Response(JSON.stringify({
        settings: { milkReminderEnabled: false, milkReminderOffsetMinutes: 30 },
        pushConfigured: true,
        subscribed: false,
      }), { status: 200 });
    }
    if (url.endsWith('/api/push/vapid-public-key')) {
      return new Response(JSON.stringify({ publicKey: 'BDGyZARdiH7cZTORfuMIczdSl3-uf6yzehdkIckM_7YyYTzJPfm_Mj81ywryJEYQVm5VLPKU6DJuIKL9jimTLFA' }), { status: 200 });
    }
    if (url.endsWith('/api/push/subscribe') && init.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.startsWith('/api/logs/today')) {
      return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
    }
    if (url.startsWith('/api/sync/state')) return new Response(JSON.stringify({ modules: {} }), { status: 200 });
    return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, overview: [] }), { status: 200 });
  });
}

describe('app/main', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = mockFetch();
    delete window.Swiped;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  it('renders login panel for unauthenticated user', async () => {
    await import('../../app/main.js?case=auth');

    const authPanel = document.querySelector('#auth-panel');

    expect(authPanel.classList.contains('hidden')).toBe(false);
    expect(authPanel.querySelector('#google-login')).toBeNull();
    expect(authPanel.querySelector('#dev-login')).toBeNull();
    expect(document.querySelector('#auth-actions-panel').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#google-login').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#dev-login').classList.contains('hidden')).toBe(false);
  });

  it('shows a sign-in loading mark while admin dev auth is pending', async () => {
    let resolveDevLogin;
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: null }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/auth/dev') && init.method === 'POST') {
        return new Promise((resolve) => {
          resolveDevLogin = () => resolve(new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 }));
        });
      }
      return new Response(JSON.stringify({ events: [], tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=dev-auth-loading');

    const devLogin = document.querySelector('#dev-login');
    const authStatus = document.querySelector('#auth-login-status');
    fireEvent.click(devLogin);

    await vi.waitFor(() => expect(resolveDevLogin).toBeTypeOf('function'));
    expect(devLogin.disabled).toBe(true);
    expect(devLogin.getAttribute('aria-busy')).toBe('true');
    expect(devLogin.textContent).toBe('Signing in...');
    expect(authStatus.classList.contains('hidden')).toBe(false);
    expect(authStatus.textContent).toContain('Signing in...');

    resolveDevLogin();

    await vi.waitFor(() => expect(document.querySelector('#account-label').textContent).toContain('Parent account'));
    expect(devLogin.disabled).toBe(false);
    expect(authStatus.classList.contains('hidden')).toBe(true);
  });

  it('does not keep the whole app loading while authentication is slow', async () => {
    let resolveAuth;
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/auth/me')) {
        return new Promise((resolve) => {
          resolveAuth = () => resolve(new Response(JSON.stringify({ user: null }), { status: 200 }));
        });
      }
      return new Response(JSON.stringify({ events: [], tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    const importPromise = import('../../app/main.js?case=initial-loading');
    await vi.waitFor(() => expect(resolveAuth).toBeTypeOf('function'));

    expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#app').getAttribute('aria-busy')).toBe('false');

    resolveAuth();
    await importPromise;

    expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#app').getAttribute('aria-busy')).toBe('false');
  });

  it('does not wait for app config before releasing startup loading', async () => {
    let configRequested = false;
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: null }), { status: 200 });
      if (url.endsWith('/api/config')) {
        configRequested = true;
        return new Promise(() => {});
      }
      return new Response(JSON.stringify({ events: [], tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=config-slow-initial-loading');

    expect(configRequested).toBe(true);
    expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#app').getAttribute('aria-busy')).toBe('false');
  });

  it('boots when a stored quick milk amount exists', async () => {
    localStorage.setItem('familyTracker.quickMilkAmountMl', '150');

    await import('../../app/main.js?case=stored-quick-milk-amount');

    expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#app').getAttribute('aria-busy')).toBe('false');
  });

  it('shows home component loading states while visible family data is loading', async () => {
    localStorage.setItem('familyTracker.activeTab', 'home');
    localStorage.setItem('familyTracker.babyStatusRange', 'today');
    let resolveToday;
    let resolveTasks;
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Promise((resolve) => {
          resolveToday = () => resolve(new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 }));
        });
      }
      if (url.startsWith('/api/tasks/today')) {
        return new Promise((resolve) => {
          resolveTasks = () => resolve(new Response(JSON.stringify({ tasks: [] }), { status: 200 }));
        });
      }
      if (url.startsWith('/api/sync/state')) return new Response(JSON.stringify({ modules: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    const importPromise = import('../../app/main.js?case=home-component-loading');
    await vi.waitFor(() => expect(resolveToday).toBeTypeOf('function'));
    await vi.waitFor(() => expect(resolveTasks).toBeTypeOf('function'));

    expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#app').getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('.home-card-baby').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('.home-card-task').getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('.home-card-baby').textContent).toContain('Loading baby today...');
    expect(document.querySelector('.home-card-task').textContent).toContain('Loading tasks today...');

    resolveToday();
    resolveTasks();
    await importPromise;

    await vi.waitFor(() => expect(document.querySelector('.home-card-baby').getAttribute('aria-busy')).toBe('false'));
    expect(document.querySelector('.home-card-task').getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('.home-card-baby').textContent).not.toContain('Loading baby today...');
    expect(document.querySelector('.home-card-task').textContent).not.toContain('Loading tasks today...');
  });

  it('does not keep the whole app loading while baby tab data is slow', async () => {
    localStorage.setItem('familyTracker.activeTab', 'baby');
    localStorage.setItem('familyTracker.babyStatusRange', 'today');
    let resolveToday;
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Promise((resolve) => {
          resolveToday = () => resolve(new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 }));
        });
      }
      if (url.startsWith('/api/sync/state')) return new Response(JSON.stringify({ modules: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    const importPromise = import('../../app/main.js?case=baby-slow-initial-data');
    await vi.waitFor(() => expect(resolveToday).toBeTypeOf('function'));

    expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#app').getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('#baby-view').classList.contains('active')).toBe(true);

    resolveToday();
    await importPromise;
  });

  it('starts task assignee and today task requests in parallel on home load', async () => {
    localStorage.setItem('familyTracker.activeTab', 'home');
    localStorage.setItem('familyTracker.babyStatusRange', 'today');
    let resolveAssignees;
    const requestedUrls = [];
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      requestedUrls.push(url);
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      if (url.startsWith('/api/tasks/today')) return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) {
        return new Promise((resolve) => {
          resolveAssignees = () => resolve(new Response(JSON.stringify({ assignees: [] }), { status: 200 }));
        });
      }
      if (url.startsWith('/api/sync/state')) return new Response(JSON.stringify({ modules: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    const importPromise = import('../../app/main.js?case=home-task-parallel-load');
    await vi.waitFor(() => expect(resolveAssignees).toBeTypeOf('function'));

    expect(requestedUrls.some((url) => url.startsWith('/api/tasks/today'))).toBe(true);

    resolveAssignees();
    await importPromise;
  });

  it('loads only visible baby-tab data during initial access', async () => {
    localStorage.setItem('familyTracker.activeTab', 'baby');
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      if (url.startsWith('/api/sync/state')) return new Response(JSON.stringify({ modules: { baby: { version: 'b1' }, task: { version: 't1' }, profile: { version: 'p1' } } }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    await import('../../app/main.js?case=visible-baby-initial-load');
    await vi.waitFor(() => expect(document.querySelector('#app-loading').classList.contains('hidden')).toBe(true));

    const requestedUrls = global.fetch.mock.calls.map(([input]) => String(input));
    expect(requestedUrls.some((url) => url.startsWith('/api/logs/today'))).toBe(true);
    expect(requestedUrls.some((url) => url.startsWith('/api/tasks/'))).toBe(false);
    expect(requestedUrls.some((url) => url.startsWith('/api/events/summary'))).toBe(false);
    expect(requestedUrls.some((url) => url.startsWith('/api/action-logs'))).toBe(false);
    expect(requestedUrls.some((url) => url.endsWith('/api/task-assignees'))).toBe(false);
  });


  it('opens dashboard item tooltips and sends the brand back home', async () => {
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [{
            id: 'event-1',
            type: 'feeding_milk',
            rawText: 'formula',
            occurredAt: { value: '2026-05-28T10:00:00.000Z' },
            amountMl: { value: 120 },
          }],
          summary: {},
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=home-tooltip-brand');

    const marker = document.querySelector('#home-summary-grid .home-marker');
    expect(marker).toBeTruthy();
    expect(marker.getAttribute('title')).toBeNull();
    expect(marker.querySelector('.home-tooltip').hidden).toBe(true);

    fireEvent.click(marker);

    expect(marker.getAttribute('aria-expanded')).toBe('true');
    expect(marker.querySelector('.home-tooltip').hidden).toBe(false);
    expect(marker.querySelector('.home-tooltip').textContent).toContain('Formula');

    fireEvent.click(document.querySelector('#baby-tab'));
    expect(document.querySelector('#baby-view').classList.contains('active')).toBe(true);

    fireEvent.click(document.querySelector('#brand-home'));
    expect(document.querySelector('#home-view').classList.contains('active')).toBe(true);
  });

  it('refreshes visible home baby data immediately after saving a baby log', async () => {
    localStorage.setItem('familyTracker.activeTab', 'home');
    let saved = false;
    const savedEvent = {
      id: 'event-home-save',
      type: 'feeding_milk',
      rawText: 'formula from home',
      occurredAt: { value: new Date().toISOString() },
      amountMl: { value: 90 },
    };
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
      if (url.startsWith('/api/tasks/today')) return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({ events: saved ? [savedEvent] : [], summary: {}, context: {} }), { status: 200 });
      }
      if (url === '/api/logs' && init.method === 'POST') {
        saved = true;
        return new Response(JSON.stringify({ events: [savedEvent] }), { status: 200 });
      }
      if (url.startsWith('/api/sync/state')) {
        return new Response(JSON.stringify({ modules: { baby: { version: 'b1' }, task: { version: 't1' }, profile: { version: 'p1' } } }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    await import('../../app/main.js?case=home-baby-save-refresh');
    await vi.waitFor(() => expect(document.querySelector('.home-card-baby h3').textContent).toBe('0 logs'));

    fireEvent.input(document.querySelector('#log-input'), { target: { value: 'formula from home' } });
    fireEvent.submit(document.querySelector('#log-form'));

    await vi.waitFor(() => expect(document.querySelector('#answer').textContent).toBe('1 log saved'));
    expect(document.querySelector('.home-card-baby h3').textContent).toBe('1 logs');
    expect(document.querySelector('.home-card-baby').textContent).toContain('Formula');
  });



  it('changes the shared day from the home dashboard controls', async () => {
    const baseFetch = mockFetch();
    global.fetch = vi.fn((input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/api/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 }));
      }
      return baseFetch(input, init);
    });

    await import('../../app/main.js?case=home-date-controls');

    expect(document.querySelector('#home-day-label').textContent).toBe(relativeDayHeading('Today'));

    fireEvent.click(document.querySelector('#next-home-day'));

    await vi.waitFor(() => expect(document.querySelector('#home-day-label').textContent).toBe(relativeDayHeading('Tomorrow', 1)));

    fireEvent.click(document.querySelector('#next-home-day'));

    await vi.waitFor(() => expect(document.querySelector('#home-day-label').textContent).toBe(dayHeadingAtOffset(2)));

    fireEvent.click(document.querySelector('#baby-tab'));

    expect(document.querySelector('#day-label').textContent).toBe(dayHeadingAtOffset(2));
  });


  it('clusters crowded baby timeline logs on the home dashboard', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [
            {
              id: 'milk-1',
              type: 'feeding_milk',
              rawText: 'formula',
              occurredAt: { value: '2026-05-28T10:00:00.000Z' },
              amountMl: { value: 120 },
            },
            {
              id: 'diaper-1',
              type: 'diaper',
              rawText: 'pee',
              occurredAt: { value: '2026-05-28T10:12:00.000Z' },
              diaperKind: { value: 'wet' },
            },
            {
              id: 'sleep-1',
              type: 'sleep',
              rawText: 'nap',
              startAt: { value: '2026-05-28T10:31:00.000Z' },
              endAt: { value: '2026-05-28T10:42:00.000Z' },
              durationMinutes: { value: 11 },
            },
            {
              id: 'milk-2',
              type: 'feeding_milk',
              rawText: 'formula',
              occurredAt: { value: '2026-05-28T13:00:00.000Z' },
              amountMl: { value: 90 },
            },
          ],
          summary: {},
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=home-baby-clusters');

    const babyCard = document.querySelector('.home-card-baby');
    const cluster = babyCard.querySelector('.baby-cluster-marker');
    expect(cluster).toBeTruthy();
    expect(babyCard.querySelectorAll('.home-marker')).toHaveLength(2);
    expect(cluster.querySelectorAll('.home-cluster-icon')).toHaveLength(3);

    fireEvent.click(cluster);

    expect(cluster.getAttribute('aria-expanded')).toBe('true');
    expect(cluster.querySelector('.home-tooltip').textContent).toContain('3 logs near');
    expect(cluster.querySelector('.home-tooltip').textContent).toContain('Formula');
    expect(cluster.querySelector('.home-tooltip').textContent).toContain('Diaper');
    expect(cluster.querySelector('.home-tooltip').textContent).toContain('Sleep');
  });


  it('opens meal log as overlay without collapsing meal columns', async () => {
    await import('../../app/main.js?case=meal-log');

    const button = document.querySelector('#toggle-meal-log');
    const panel = document.querySelector('#meal-log-panel');

    expect(panel.classList.contains('hidden')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);

    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);

    expect(panel.classList.contains('hidden')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });


  it('keeps meal columns equal and renders planned-meal thumbs up as an SVG button', async () => {
    const baseFetch = mockFetch();
    global.fetch = vi.fn((input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/api/auth/me')) {
        return Promise.resolve(new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 }));
      }
      return baseFetch(input, init);
    });

    await import('../../app/main.js?case=meal-like-button');

    fireEvent.click(document.querySelector('#meal-tab'));

    const styles = readFileSync(`${process.cwd()}/app/styles.css`, 'utf8');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain('.meal-board {\n  max-width: none;\n  margin: 0;\n  padding-inline: 16px;');

    const likeButton = document.querySelector('#meal-breakfast .meal-like-button');
    expect(likeButton).toBeTruthy();
    expect(likeButton.getAttribute('aria-label')).toBe('Thumbs up Egg toast');
    expect(likeButton.querySelector('svg')).toBeTruthy();
    expect(likeButton.querySelector('span').textContent).toBe('0');
    expect([...document.querySelectorAll('#meal-breakfast .swipe-action span')].map((node) => node.textContent)).not.toContain('0');
    expect([...document.querySelectorAll('#meal-breakfast .swipe-action span')].map((node) => node.textContent)).toContain('Save');

    fireEvent.click(likeButton);

    expect(document.querySelector('#meal-breakfast .meal-like-button span').textContent).toBe('1');
  });


  it('opens baby history as a main Baby Tracker tab', async () => {
    await import('../../app/main.js?case=baby-action-log-panel');

    const button = document.querySelector('#open-baby-action-log');
    const panel = document.querySelector('#baby-action-log-panel');

    expect(panel.parentElement.id).toBe('baby-view');
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);

    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    expect(document.querySelector('#workspace').classList.contains('hidden')).toBe(true);

    fireEvent.click(document.querySelector('#open-baby-log'));

    expect(panel.classList.contains('hidden')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#workspace').classList.contains('hidden')).toBe(false);
  });


  it('opens the Fund tab with the embedded Trader Agent dashboard', async () => {
    await import('../../app/main.js?case=fund-tab');

    const fundTab = document.querySelector('#fund-tab');
    const fundView = document.querySelector('#fund-view');
    const frame = document.querySelector('#fund-dashboard-frame');
    const link = document.querySelector('.fund-open-link');

    expect(fundTab).toBeTruthy();
    expect(fundView.classList.contains('active')).toBe(false);
    expect(frame.hasAttribute('src')).toBe(false);
    expect(frame.dataset.src).toBe('https://trader-agent.pages.dev/live_dashboard');
    frame.dataset.src = 'about:blank';

    fireEvent.click(fundTab);

    expect(fundTab.classList.contains('active')).toBe(true);
    expect(fundView.classList.contains('active')).toBe(true);
    expect(frame.getAttribute('src')).toBe('about:blank');
    expect(link.getAttribute('href')).toBe('https://trader-agent.pages.dev/live_dashboard');
    expect(window.location.pathname).toBe('/fund');
  });


  it('searches travel results and saves a deal watch', async () => {
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      if (url.endsWith('/api/travel/search') && init.method === 'POST') {
        return new Response(JSON.stringify({
          sources: [{ id: 'amadeus', name: 'Amadeus', status: 'ready', coverage: 'Flight fares' }],
          results: [{ id: 'r1', source: 'Amadeus', kind: 'fare', title: 'SFO to ICN', price: 721, currency: 'USD', airline: 'United', departureAt: '2026-10-10T11:00:00', arrivalAt: '2026-10-11T16:00:00', detail: '1 segment', bookingUrl: 'https://www.google.com/travel/flights/search?q=SFO%20ICN' }],
        }), { status: 200 });
      }
      if (url.startsWith('/api/sync/state')) return new Response(JSON.stringify({ modules: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=travel-tab');

    fireEvent.click(document.querySelector('#travel-tab'));
    fireEvent.input(document.querySelector('#travel-origin'), { target: { value: 'S' } });
    expect(document.querySelector('#travel-recommendations').textContent).toContain('SFO to ICN');
    fireEvent.click([...document.querySelectorAll('#travel-recommendations button')].find((button) => button.textContent === 'SFO to ICN'));
    document.querySelector('#travel-departure-date').value = '2026-10-10';
    document.querySelector('#travel-max-price').value = '800';
    fireEvent.submit(document.querySelector('#travel-form'));

    await vi.waitFor(() => expect(document.querySelector('#travel-results').textContent).toContain('SFO to ICN'));
    expect(document.querySelector('#travel-result-count').textContent).toBe('1 results');
    expect(document.querySelector('#travel-results a').href).toContain('google.com/travel/flights/search');
    expect(document.querySelector('#travel-history').textContent).toContain('SFO to ICN');

    fireEvent.click(document.querySelector('#travel-save-watch'));

    expect(document.querySelector('#travel-watch-list').textContent).toContain('SFO to ICN');
    expect(localStorage.getItem('familyTracker.travelWatches')).toContain('"origin":"SFO"');
    document.querySelector('#travel-origin').value = '';
    document.querySelector('#travel-destination').value = '';
    fireEvent.click(document.querySelector('#travel-history button'));
    expect(document.querySelector('#travel-origin').value).toBe('SFO');
  });


  it('renders task swipe actions for open and completed tasks', async () => {
    const swipedInit = vi.fn(() => ({ open: vi.fn(), close: vi.fn() }));
    window.Swiped = { init: swipedInit };

    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) return new Response(JSON.stringify({ assignees: [{ id: 'a1', name: 'Mom', color: '#0066cc' }] }), { status: 200 });
      if (url.startsWith('/api/tasks/today')) {
        return new Response(JSON.stringify({ tasks: [
          { id: 't1', title: 'Wash bottles', status: 'open', assigneeId: 'a1', assigneeName: 'Mom', assigneeColor: '#0066cc', dueMode: 'on_date', dueDate: '2026-05-28' },
          { id: 't2', title: 'Fold laundry', status: 'done', assigneeId: 'a1', assigneeName: 'Mom', assigneeColor: '#0066cc', dueMode: 'on_date', dueDate: '2026-05-28', completedAt: '2026-05-28T12:00:00.000Z' },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], summary: null, logs: [] }), { status: 200 });
    });

    await import('../../app/main.js?case=task-swipe-actions');
    fireEvent.click(document.querySelector('#task-tab'));

    await vi.waitFor(() => expect(document.querySelectorAll('#task-list .task-swipe').length).toBe(2));
    expect([...document.querySelectorAll('#task-list .swipe-action span')].map((node) => node.textContent)).toEqual(expect.arrayContaining(['Complete', 'Reopen']));
    const completedCheckbox = screen.getByRole('checkbox', { name: 'Reopen Fold laundry' });
    expect(completedCheckbox.disabled).toBe(false);
    const completedRow = completedCheckbox.closest('.task-swipe');
    const reopenAction = [...completedRow.querySelectorAll('.swipe-action')].find((button) => button.textContent.includes('Reopen'));
    expect(reopenAction.disabled).toBe(false);
    expect(reopenAction.getAttribute('aria-disabled')).not.toBe('true');
    expect(swipedInit).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('data-swipe-id'),
      right: expect.any(Number),
    }));
  });

  it('lets task checkboxes complete tasks inside swipe cards', async () => {
    const patchBodies = [];
    let completed = false;
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) return new Response(JSON.stringify({ assignees: [{ id: 'a1', name: 'Mom', color: '#0066cc' }] }), { status: 200 });
      if (url === '/api/tasks/t1' && init.method === 'PATCH') {
        patchBodies.push(JSON.parse(init.body));
        completed = true;
        return new Response(JSON.stringify({ task: { id: 't1', status: 'done' } }), { status: 200 });
      }
      if (url.startsWith('/api/tasks/today')) {
        return new Response(JSON.stringify({ tasks: [
          { id: 't1', title: 'Wash bottles', status: completed ? 'done' : 'open', assigneeId: 'a1', assigneeName: 'Mom', assigneeColor: '#0066cc', dueMode: 'on_date', dueDate: '2026-05-28' },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    await import('../../app/main.js?case=task-checkbox-complete');
    fireEvent.click(document.querySelector('#task-tab'));

    const checkbox = await screen.findByRole('checkbox', { name: 'Complete Wash bottles' });
    const swipeCard = checkbox.closest('.task-item');
    const swipePointerDown = vi.fn();
    swipeCard.addEventListener('pointerdown', swipePointerDown);

    fireEvent.pointerDown(checkbox);
    expect(swipePointerDown).not.toHaveBeenCalled();

    fireEvent.click(checkbox);

    await vi.waitFor(() => expect(patchBodies).toEqual([{ status: 'done' }]));
    await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: 'Reopen Wash bottles' }).checked).toBe(true));
  });


  it('closes floating meal log and summary when clicking outside', async () => {
    await import('../../app/main.js?case=meal-panels');

    const logButton = document.querySelector('#toggle-meal-log');
    const logPanel = document.querySelector('#meal-log-panel');
    const summaryButton = document.querySelector('#open-meal-summary');
    const summaryPanel = document.querySelector('#meal-summary-panel');

    fireEvent.click(logButton);
    expect(logPanel.classList.contains('hidden')).toBe(false);

    fireEvent.pointerDown(document.body);
    expect(logPanel.classList.contains('hidden')).toBe(true);

    fireEvent.click(summaryButton);
    expect(summaryPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.querySelector('.meal-summary-chart')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(summaryPanel.classList.contains('hidden')).toBe(true);
  });

  it('keeps one selected date across baby, task, and meal date controls', async () => {
    await import('../../app/main.js?case=shared-day');

    const previousButton = document.querySelector('#previous-meal-day');
    const nextButton = document.querySelector('#next-meal-day');
    const homePicker = document.querySelector('#home-day-picker');
    const babyPicker = document.querySelector('#day-picker');
    const taskPicker = document.querySelector('#task-day-picker');
    const mealPicker = document.querySelector('#meal-day-picker');
    const mealTabButton = document.querySelector('#meal-tab');

    fireEvent.click(mealTabButton);

    fireEvent.click(previousButton);
    const previousDayValue = mealPicker.value;
    expect(previousDayValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(babyPicker.value).toBe(previousDayValue);
    expect(taskPicker.value).toBe(previousDayValue);

    fireEvent.click(nextButton);
    const nextDayValue = mealPicker.value;
    expect(nextDayValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nextDayValue > previousDayValue).toBe(true);
    expect(babyPicker.value).toBe(nextDayValue);
    expect(taskPicker.value).toBe(nextDayValue);
    expect(window.location.search).not.toContain('taskDay=');
    expect(window.location.search).not.toContain('mealDay=');
  });

  it('shows implemented LLM providers and activates one after saving an API key', async () => {
    const requests = [];
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      requests.push({ url, init });
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) {
        return new Response(JSON.stringify({
          provider: 'mock',
          model: 'mock-local',
          configured: true,
          providers: [
            { id: 'mock', label: 'Mock', defaultModel: 'mock-local', models: ['mock-local'], requiresApiKey: false, configured: true, active: true },
            { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-5.4-mini', models: ['gpt-5.4-mini', 'gpt-5.4'], requiresApiKey: true, configured: false, active: false },
            { id: 'mistral', label: 'Mistral', defaultModel: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-medium-latest'], requiresApiKey: true, configured: false, active: false },
          ],
        }), { status: 200 });
      }
      if (url.endsWith('/api/llm-config') && init.method === 'POST') {
        return new Response(JSON.stringify({
          provider: 'openai',
          model: 'gpt-5.4-mini',
          configured: true,
          providers: [
            { id: 'mock', label: 'Mock', defaultModel: 'mock-local', models: ['mock-local'], requiresApiKey: false, configured: true, active: false },
            { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-5.4-mini', models: ['gpt-5.4-mini', 'gpt-5.4'], requiresApiKey: true, configured: true, active: true },
            { id: 'mistral', label: 'Mistral', defaultModel: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-medium-latest'], requiresApiKey: true, configured: false, active: false },
          ],
        }), { status: 200 });
      }
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      return new Response(JSON.stringify({ events: [], summary: null, tasks: [], overview: [], assignees: [] }), { status: 200 });
    });

    await import('../../app/main.js?case=llm-provider-settings');

    fireEvent.click(document.querySelector('#menu-toggle'));

    const providerSelect = document.querySelector('#llm-provider-select');
    const openAiOption = [...providerSelect.options].find((option) => option.value === 'openai');
    expect(openAiOption.disabled).toBe(true);
    expect(screen.getByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Mistral')).toBeTruthy();
    expect(screen.getAllByText('Needs API key').length).toBeGreaterThan(0);

    const openAiCard = [...document.querySelectorAll('.llm-provider-card')]
      .find((card) => card.textContent.includes('OpenAI'));
    openAiCard.querySelector('[data-llm-key]').value = 'sk-test';
    fireEvent.click(openAiCard.querySelector('[data-llm-provider="openai"]'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const configRequest = requests.find((request) => request.url.endsWith('/api/llm-config'));
    expect(JSON.parse(configRequest.init.body)).toMatchObject({ provider: 'openai', apiKey: 'sk-test' });
    expect(document.querySelector('#llm-provider-status').textContent).toContain('OpenAI is ready');
    expect(document.querySelector('#llm-provider-select').value).toBe('openai');
  });

  it('keeps baby settings in the baby section tabs', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) {
        return new Response(JSON.stringify({
          profile: { babyName: 'Baby' },
          growthRecords: [
            { recordedFor: 'birth', occurredDate: '2026-01-01', heightCm: 50, headCm: 34, weightG: 3200 },
            { recordedFor: 'now', occurredDate: '2026-02-01', heightCm: 55, headCm: 36, weightG: 4100 },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ events: [], summary: null, tasks: [], overview: [] }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-section-menu');

    fireEvent.click(document.querySelector('#menu-toggle'));
    expect(document.querySelector('#menu-panel #baby-settings-form')).toBeNull();

    const settingsPanel = document.querySelector('#baby-settings-panel');
    const summaryPanel = document.querySelector('#baby-summary-panel');
    const growthSummary = document.querySelector('#growth-summary');

    expect(settingsPanel.classList.contains('hidden')).toBe(true);
    fireEvent.click(document.querySelector('#open-baby-settings'));
    expect(settingsPanel.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#baby-settings-panel #baby-settings-form')).toBeTruthy();
    expect(document.querySelector('#baby-head')).toBeNull();
    expect(document.querySelector('#baby-apgar')).toBeNull();

    fireEvent.click(document.querySelector('#open-baby-summary'));
    expect(settingsPanel.classList.contains('hidden')).toBe(true);
    expect(settingsPanel.getAttribute('aria-hidden')).toBe('true');
    expect(summaryPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.getAttribute('aria-hidden')).toBe('false');
    expect(document.querySelector('#workspace').classList.contains('hidden')).toBe(true);
    expect(growthSummary.querySelector('#growth-trend-chart')).toBeTruthy();
    expect(summaryPanel.textContent).toContain('X-axis shows record dates');
    expect(growthSummary.querySelector('[data-growth-chart-metric="weightG"]').checked).toBe(true);
    expect(growthSummary.querySelector('[data-growth-chart-metric="heightCm"]').checked).toBe(false);
    expect(growthSummary.textContent).toContain('Y-axis shows grams for weight');
    expect(growthSummary.textContent).not.toContain('centimeters for height');
    fireEvent.click(growthSummary.querySelector('[data-growth-chart-metric="heightCm"]'));
    expect(document.querySelector('#growth-summary').querySelector('[data-growth-chart-metric="heightCm"]').checked).toBe(true);
    expect(document.querySelector('#growth-summary').textContent).toContain('centimeters for height');
    expect(growthSummary.textContent).toContain('Weight');
    expect(growthSummary.textContent).toContain('Height');
    expect(growthSummary.textContent).not.toContain('Head');
    expect(growthSummary.textContent).not.toContain('Apgar');

    fireEvent.pointerDown(document.body);
    expect(summaryPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.getAttribute('aria-hidden')).toBe('false');

    fireEvent.click(document.querySelector('#open-baby-log'));
    expect(document.querySelector('#workspace').classList.contains('hidden')).toBe(false);
    expect(summaryPanel.classList.contains('hidden')).toBe(true);
  });

  it('asks notification permission before waiting for the service worker', async () => {
    localStorage.setItem('familyTracker.activeTab', 'baby');
    mockAuthenticatedFetchForNotifications();
    const requestPermission = mockPushNotifications({
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied'),
      serviceWorker: {
        ready: new Promise(() => {}),
      },
    });

    await import('../../app/main.js?case=push-permission-before-service-worker');
    fireEvent.click(document.querySelector('#open-baby-settings'));

    const enableButton = document.querySelector('#enable-push-notifications');
    fireEvent.click(enableButton);

    await vi.waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(document.querySelector('#push-notification-status').textContent).toContain('Notifications are blocked.'));
    expect(window.navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    expect(enableButton.disabled).toBe(false);
  });

  it('recovers when notification service worker readiness hangs', async () => {
    vi.useFakeTimers();
    localStorage.setItem('familyTracker.activeTab', 'baby');
    mockAuthenticatedFetchForNotifications();
    mockPushNotifications({
      permission: 'granted',
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue(null),
        ready: new Promise(() => {}),
      },
    });

    try {
      await import('../../app/main.js?case=push-service-worker-timeout');
      fireEvent.click(document.querySelector('#open-baby-settings'));

      const enableButton = document.querySelector('#enable-push-notifications');
      fireEvent.click(enableButton);

      await vi.waitFor(() => expect(document.querySelector('#push-notification-status').textContent).toContain('Preparing notification service...'));
      await vi.advanceTimersByTimeAsync(15_000);

      await vi.waitFor(() => expect(document.querySelector('#push-notification-status').textContent).toContain('Notification service is not ready.'));
      expect(enableButton.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens task actions as floating panels that dismiss outside', async () => {
    await import('../../app/main.js?case=task-floating-actions');

    fireEvent.click(document.querySelector('#task-tab'));

    const todayPanel = document.querySelector('#task-today-panel');
    const summaryButton = document.querySelector('#open-task-summary');
    const summaryPanel = document.querySelector('#task-summary-panel');
    const composerButton = document.querySelector('#open-task-composer');
    const composerPanel = document.querySelector('#task-form');

    fireEvent.click(summaryButton);
    expect(todayPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.getAttribute('aria-hidden')).toBe('false');
    expect(summaryButton.getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerDown(document.body);
    expect(summaryPanel.classList.contains('hidden')).toBe(true);
    expect(summaryPanel.getAttribute('aria-hidden')).toBe('true');
    expect(summaryButton.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(composerButton);
    expect(composerPanel.classList.contains('hidden')).toBe(false);
    expect(composerPanel.getAttribute('aria-hidden')).toBe('false');
    expect(composerButton.getAttribute('aria-expanded')).toBe('true');

    fireEvent.pointerDown(document.body);
    expect(composerPanel.classList.contains('hidden')).toBe(true);
    expect(composerPanel.getAttribute('aria-hidden')).toBe('true');
    expect(composerButton.getAttribute('aria-expanded')).toBe('false');
  });


  it('toggles sleep shortcut buttons to Wake and posts button logs through heuristic parsing', async () => {
    const requests = [];
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      requests.push({ url, init });
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/config')) return new Response(JSON.stringify({ provider: 'mock', model: 'mock-local', providers: [] }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) return new Response(JSON.stringify({ assignees: [] }), { status: 200 });
      if (url.startsWith('/api/tasks/today')) return new Response(JSON.stringify({ tasks: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [{
            id: 'sleep-start',
            rawLogId: 'rawlog-sleep',
            type: 'sleep',
            rawText: 'nap',
            action: { value: 'start' },
            startAt: { value: new Date(Date.now() - 10 * 60000).toISOString() },
            status: 'ongoing_or_predicted',
          }],
          summary: {},
        }), { status: 200 });
      }
      if (url === '/api/logs' && init.method === 'POST') return new Response(JSON.stringify({ events: [] }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-sleep-buttons');

    await vi.waitFor(() => expect(document.querySelector('#sleep-status')?.classList.contains('hidden')).toBe(false));
    const quickActions = Array.from(document.querySelectorAll('#quick-actions .quick-activity-options button'));
    expect(quickActions.every((button) => button.querySelector('svg'))).toBe(true);
    expect(quickActions.find((button) => button.textContent.includes('Feed formula')).style.getPropertyValue('--tracker-accent')).toBe('#0ea5e9');
    expect(quickActions.find((button) => button.textContent.includes('Wake')).style.getPropertyValue('--tracker-accent')).toBe('#6366f1');
    expect(quickActions.find((button) => button.textContent.includes('Diaper - poop')).style.getPropertyValue('--tracker-accent')).toBe('#22c55e');
    expect(quickActions.find((button) => button.textContent.includes('Baby food')).style.getPropertyValue('--tracker-accent')).toBe('#f59e0b');
    expect(document.querySelector('#quick-actions').textContent).toContain('Wake');
    expect(document.querySelector('#quick-actions').textContent).toContain('Diaper - poop');
    expect(document.querySelector('#quick-actions').textContent).toContain('Diaper - pee');
    expect(document.querySelector('#quick-actions').textContent).toContain('Baby food');
    expect(document.querySelector('#quick-actions').textContent).not.toContain('Sleep');
    expect(document.querySelector('#quick-actions').textContent).not.toContain('Dirty');
    expect(document.querySelector('#quick-actions').textContent).not.toContain('Wet');
    expect(document.querySelector('#quick-actions').textContent).not.toContain('Solids');
    expect(document.querySelector('#tablet-actions')).toBeNull();
    expect(screen.queryByText('Tablet board')).toBeNull();
    expect(document.querySelector('#sleep-status button')?.querySelector('svg')).toBeTruthy();

    fireEvent.click([...document.querySelectorAll('#quick-actions .quick-action-button')].find((button) => button.textContent.includes('Wake')));
    fireEvent.submit(document.querySelector('#log-form'));

    await vi.waitFor(() => {
      const post = requests.find((request) => request.url === '/api/logs' && request.init.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(post.init.body)).toMatchObject({ parserMode: 'heuristic', inputSource: 'button' });
      expect(JSON.parse(post.init.body).text).toMatch(/^woke up at .+ today$/);
    });
  });

  it('does not render the baby question panel while keeping record save feedback', async () => {
    await import('../../app/main.js?case=no-ask-panel');

    expect(document.querySelector('#ask-form')).toBeNull();
    expect(screen.queryByPlaceholderText('How much sleep today?')).toBeNull();
    expect(document.querySelector('#answer')).toBeTruthy();
  });

  it('builds heuristic baby logs from activity, scroll volume, and scroll time pickers', async () => {
    const requests = [];
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      requests.push({ url, init });
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [],
          summary: {},
          context: { lastMilk: { label: '20m ago', amountMl: 90 }, lastDiaper: null, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 },
        }), { status: 200 });
      }
      if (url === '/api/logs' && init.method === 'POST') return new Response(JSON.stringify({ events: [] }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-heuristic-picker');

    await vi.waitFor(() => expect(document.querySelector('#quick-actions').textContent).toContain('Feed formula'));
    expect(document.querySelector('.record-form-actions')).toBeTruthy();
    expect(document.querySelector('.record-form-actions .record-save-button').textContent).toBe('Save');

    fireEvent.input(document.querySelector('#log-input'), { target: { value: 'manual note' } });
    expect(document.querySelector('#quick-actions').getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('#log-form').classList.contains('quick-log-active')).toBe(false);
    expect(document.querySelector('#log-input').disabled).toBe(false);
    expect([...document.querySelectorAll('#quick-actions button')].every((button) => button.disabled)).toBe(true);

    fireEvent.click(document.querySelector('#reset-log-form'));
    expect(document.querySelector('#quick-actions').getAttribute('aria-disabled')).toBe('false');
    expect(document.querySelector('#log-input').disabled).toBe(false);
    expect([...document.querySelectorAll('.quick-picker-activity .quick-action-button')].every((button) => button.disabled)).toBe(false);

    fireEvent.click([...document.querySelectorAll('#quick-actions .quick-action-button')].find((button) => button.textContent.includes('Feed formula')));
    expect(document.querySelector('#log-form').classList.contains('quick-log-active')).toBe(true);
    expect(document.querySelector('#log-input').disabled).toBe(true);
    expect(document.querySelector('#log-input').value).toBe('');
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].find((button) => button.textContent === '90 ml').disabled).toBe(false);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].some((button) => button.textContent === '10 ml')).toBe(true);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].some((button) => button.textContent === '95 ml')).toBe(true);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].some((button) => button.textContent === '105 ml')).toBe(false);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].some((button) => button.textContent === '250 ml')).toBe(true);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].some((button) => button.textContent === '5 ml')).toBe(false);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].some((button) => button.textContent === '260 ml')).toBe(false);

    fireEvent.click(document.querySelector('#reset-log-form'));
    expect(document.querySelector('#log-input').disabled).toBe(false);
    fireEvent.input(document.querySelector('#log-input'), { target: { value: 'manual after reset' } });
    expect(document.querySelector('#quick-actions').getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('#log-form').classList.contains('quick-log-active')).toBe(false);

    fireEvent.click(document.querySelector('#reset-log-form'));
    fireEvent.click([...document.querySelectorAll('#quick-actions .quick-action-button')].find((button) => button.textContent.includes('Feed formula')));
    const timeColumn = document.querySelector('.quick-picker-time');
    const timeOptions = [...document.querySelectorAll('.quick-picker-time .quick-value-option')];
    const recentTimeLabels = timeOptions.slice(-5).map((button) => button.textContent);
    expect(recentTimeLabels.at(-1)).toBe('Now');
    expect(recentTimeLabels.slice(0, -1).every((label) => !/min ago|Now/.test(label))).toBe(true);
    expect(recentTimeLabels.slice(0, -1).map((label) => Number(label.match(/:(\d{2})/)?.[1]) % 5)).toEqual([0, 0, 0, 0]);
    fireEvent.click(timeOptions[timeOptions.length - 2]);
    expect(document.querySelector('#log-input').value).toBe('');

    fireEvent.click([...document.querySelectorAll('#quick-actions .quick-action-button')].find((button) => button.textContent.includes('Diaper - pee')));
    expect(document.querySelector('#log-input').value).toBe('');
    expect(document.querySelector('.quick-picker-time')).toBe(timeColumn);
    expect([...document.querySelectorAll('.quick-picker-amount .quick-value-option')].every((button) => button.disabled)).toBe(true);

    fireEvent.click(document.querySelector('#reset-log-form'));
    expect(document.querySelector('#log-input').value).toBe('');
    expect(document.querySelector('#log-input').dataset.parserMode).toBeUndefined();

    fireEvent.click([...document.querySelectorAll('#quick-actions .quick-action-button')].find((button) => button.textContent.includes('Diaper - pee')));
    fireEvent.submit(document.querySelector('#log-form'));

    await vi.waitFor(() => {
      const post = requests.find((request) => request.url === '/api/logs' && request.init.method === 'POST');
      expect(post).toBeTruthy();
      const body = JSON.parse(post.init.body);
      expect(body).toMatchObject({ parserMode: 'heuristic', inputSource: 'button' });
      expect(body.text).toMatch(/^pee diaper at .+ today$/);
    });
  });

  it('saves default baby record button values without showing kind as estimated', async () => {
    const requests = [];
    let todayEvents = [];
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      requests.push({ url, init });
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({ events: todayEvents, summary: {}, context: {} }), { status: 200 });
      }
      if (url === '/api/logs' && init.method === 'POST') {
        todayEvents = [{
          id: 'button-milk-1',
          type: 'feeding_milk',
          rawText: 'breast milk 120 ml',
          occurredAt: { value: '2026-05-30T08:00:00.000Z' },
          amountMl: { value: 120, source: 'explicit' },
          feedingKind: { value: 'breast', source: 'inferred', basis: 'button_selected_kind', confidence: 1 },
          parserInfo: { kind: 'heuristic', provider: 'local', model: 'rule-based-mvp' },
          inputSource: 'button',
          createdAt: '2026-05-30T08:00:00.000Z',
        }];
        return new Response(JSON.stringify({ events: todayEvents }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-default-button-save');

    await vi.waitFor(() => expect(document.querySelector('#quick-actions').textContent).toContain('Feed breastmilk'));
    fireEvent.submit(document.querySelector('#log-form'));

    await vi.waitFor(() => {
      const post = requests.find((request) => request.url === '/api/logs' && request.init.method === 'POST');
      expect(post).toBeTruthy();
      expect(JSON.parse(post.init.body)).toMatchObject({
        parserMode: 'heuristic',
        inputSource: 'button',
      });
      expect(JSON.parse(post.init.body).text).toMatch(/^breast milk 120 ml at .+ today$/);
    });
    await vi.waitFor(() => expect(document.querySelector('#timeline').textContent).toContain('Breast milk'));
    expect(document.querySelector('#timeline').textContent).not.toContain('Kind estimated');
  });

  it('jumps every date control back to today with compact icon controls', async () => {
    await import('../../app/main.js?case=today-jump');

    const homePicker = document.querySelector('#home-day-picker');
    const babyPicker = document.querySelector('#day-picker');
    const taskPicker = document.querySelector('#task-day-picker');
    const mealPicker = document.querySelector('#meal-day-picker');
    const todayButtons = Array.from(document.querySelectorAll('.today-jump'));
    const calendarButtons = Array.from(document.querySelectorAll('.calendar-toggle'));

    expect(todayButtons).toHaveLength(4);
    expect(calendarButtons).toHaveLength(4);
    todayButtons.forEach((button) => {
      expect(button.textContent.trim()).toBe('');
      expect(button.querySelector('svg')).toBeTruthy();
      expect(button.getAttribute('aria-label')).toBe('Jump to today');
    });
    calendarButtons.forEach((button) => {
      expect(button.textContent.trim()).toBe('');
      expect(button.querySelector('svg')).toBeTruthy();
      expect(button.getAttribute('aria-label')).toMatch(/^Open .+ calendar$/);
    });

    fireEvent.change(babyPicker, { target: { value: '2026-05-01' } });
    expect(taskPicker.value).toBe('2026-05-01');

    fireEvent.click(document.querySelector('#home-today'));

    const today = new Date().toLocaleDateString('en-CA');
    expect(homePicker.value).toBe(today);
    expect(babyPicker.value).toBe(today);
    expect(taskPicker.value).toBe(today);
    expect(mealPicker.value).toBe(today);
  });

  it('uses the same meal slot colors in labels and calendar dots', async () => {
    await import('../../app/main.js?case=meal-calendar-colors');

    fireEvent.click(document.querySelector('#meal-tab'));
    fireEvent.click(document.querySelector('#meal-calendar-toggle'));

    const slotLabels = Array.from(document.querySelectorAll('.meal-slot-label'));
    expect(slotLabels.map((label) => label.textContent)).toEqual(['Breakfast', 'Lunch', 'Dinner']);
    expect(document.querySelector('.meal-slot-breakfast')).toBeTruthy();
    expect(document.querySelector('.meal-slot-lunch')).toBeTruthy();
    expect(document.querySelector('.meal-slot-dinner')).toBeTruthy();
    const styles = readFileSync(`${process.cwd()}/app/styles.css`, 'utf8');
    expect(styles).toContain('.meal-slot .meal-card { border-left: 4px solid var(--hairline); }');

    const dotStyles = Array.from(document.querySelectorAll('#meal-calendar-grid .calendar-dot'))
      .map((dot) => dot.getAttribute('style'));
    expect(dotStyles).toEqual(expect.arrayContaining([
      'background:#f59e0b',
      'background:#22c55e',
      'background:#8b5cf6',
    ]));
  });

  it('renders weekly baby patterns and interval insights from recent logs', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        const day = new URL(url, 'https://example.test').searchParams.get('day') || '2026-05-30';
        const eventsByDay = {
          '2026-05-28': [
            { id: 'milk-1', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-05-28T08:00:00.000Z' }, amountMl: { value: 120 }, feedingKind: { value: 'formula' }, createdAt: '2026-05-28T08:01:00.000Z' },
            { id: 'sleep-1', type: 'sleep', rawText: 'nap', startAt: { value: '2026-05-28T10:00:00.000Z' }, endAt: { value: '2026-05-28T11:00:00.000Z' }, durationMinutes: { value: 60 }, createdAt: '2026-05-28T10:00:00.000Z' },
          ],
          '2026-05-29': [
            { id: 'milk-2', type: 'feeding_milk', rawText: 'breast milk', occurredAt: { value: '2026-05-29T08:30:00.000Z' }, amountMl: { value: 130, source: 'inferred' }, feedingKind: { value: 'breast' }, createdAt: '2026-05-29T08:31:00.000Z' },
            { id: 'poop-1', type: 'diaper', rawText: 'poop diaper', occurredAt: { value: '2026-05-29T12:00:00.000Z' }, diaperKind: { value: 'dirty' }, createdAt: '2026-05-29T12:00:00.000Z' },
          ],
          '2026-05-30': [
            { id: 'milk-3', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-05-30T09:00:00.000Z' }, amountMl: { value: 140 }, createdAt: '2026-05-30T09:01:00.000Z' },
          ],
        };
        return new Response(JSON.stringify({ events: eventsByDay[day] || [], summary: {}, context: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    window.history.replaceState({}, '', '/?day=2026-05-30');
    await import('../../app/main.js?case=baby-patterns');

    expect(document.querySelector('#baby-patterns').classList.contains('hidden')).toBe(true);
    fireEvent.click(screen.getByText('Patterns', { selector: '#open-baby-patterns span' }));
    await vi.waitFor(() => expect(document.querySelector('#baby-patterns').textContent).toContain('5 visible logs'));
    expect(document.querySelector('#baby-patterns').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#baby-patterns').textContent).toContain('7-day rhythm');
    expect(document.querySelectorAll('#baby-patterns .pattern-marker')).toHaveLength(5);
    expect(document.querySelector('#baby-patterns').textContent).toContain('Milk interval');
    expect(document.querySelector('#baby-patterns').textContent).toContain('Sleep rhythm');
    expect(document.querySelector('#baby-patterns').textContent).toContain('Statistics');
    expect(document.querySelector('#baby-patterns').textContent).toContain('Week comparison');
    expect(document.querySelector('#baby-patterns').textContent).toContain('line charts');
    expect(document.querySelector('#baby-patterns').textContent).toContain('Y-axis: Logs count');
    expect(document.querySelector('#baby-patterns').textContent).toContain('Y-axis: Milk ml + Feeds count');
    expect(document.querySelector('#baby-patterns .pattern-stat-chart-card.pattern-stat-milk')?.textContent).toContain('Feeds');
    expect(document.querySelector('#baby-patterns .pattern-stat-chart-card.pattern-stat-milk')?.textContent).toContain('Formula');
    expect(document.querySelector('#baby-patterns .pattern-stat-chart-card.pattern-stat-milk')?.textContent).toContain('Breast milk');
    expect(document.querySelector('#baby-patterns .pattern-stat-detail-table')?.textContent).toContain('Date');
    expect(document.querySelector('#baby-patterns .pattern-stat-detail-table')?.textContent).toContain('Formula');
    expect(document.querySelector('#baby-patterns .pattern-stat-detail-table')?.textContent).toContain('Breast milk');
    expect(document.querySelector('#baby-patterns .pattern-stat-detail article')).toBeNull();
    expect(document.querySelectorAll('#baby-patterns .pattern-stat-line-chart').length).toBeGreaterThan(1);
    expect(document.querySelectorAll('#baby-patterns .pattern-stat-series').length).toBeGreaterThan(0);
    expect(document.querySelector('#baby-patterns .pattern-legend')?.textContent).toContain('Assumed by app');
    expect(document.querySelector('#baby-patterns').textContent).toContain('auto-filled fields marked with dashed outlines');
    expect(document.querySelector('#baby-patterns .pattern-poop')?.textContent).toBe('💩');

    fireEvent.click(screen.getByText('Milk', { selector: '#baby-patterns .pattern-toggle' }));
    expect(document.querySelector('#baby-patterns').textContent).toContain('2 visible logs');
    expect(document.querySelectorAll('#baby-patterns .pattern-marker.pattern-feeding_milk')).toHaveLength(0);

    fireEvent.change(document.querySelector('#pattern-period-days'), { target: { value: '30' } });
    await vi.waitFor(() => expect(document.querySelector('#baby-patterns').textContent).toContain('Monthly rhythm'));
    fireEvent.change(document.querySelector('#pattern-stat-unit'), { target: { value: 'day' } });
    expect(document.querySelector('#baby-patterns').textContent).toContain('Day comparison');
    localStorage.removeItem('familyTracker.patternTypes');
    localStorage.removeItem('familyTracker.patternPeriodDays');
    localStorage.removeItem('familyTracker.patternStatUnit');
  });


  it('lets parents choose visible baby trackers for the current stage', async () => {
    localStorage.removeItem('familyTracker.activeBabyTrackers');
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile') && (!init.method || init.method === 'GET')) {
        return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      }
      if (url.endsWith('/api/profile') && init.method === 'POST') {
        return new Response(JSON.stringify({ profile: JSON.parse(init.body).profile, growthRecords: [] }), { status: 200 });
      }
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [],
          summary: { sleepMinutes: 40, milkCount: 2, milkAmountMl: 180, solidCount: 1, diaperCount: 3 },
          context: { lastMilk: null, lastDiaper: null, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-tracker-preferences');

    await vi.waitFor(() => expect([...document.querySelectorAll('#summary .summary-item span')].map((node) => node.textContent)).toEqual(['Sleep', 'Milk', 'Baby food', 'Diaper']));
    expect(document.querySelector('#summary .summary-item:last-child').getAttribute('style')).toContain('--tracker-accent: #22c55e');

    fireEvent.click(document.querySelector('#open-baby-settings'));
    expect(document.querySelector('#baby-settings-panel').classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#workspace').classList.contains('hidden')).toBe(true);
    document.querySelector('[name="babyTrackerTypes"][value="feeding_milk"]').checked = false;
    document.querySelector('[name="babyTrackerTypes"][value="feeding_solid"]').checked = false;
    fireEvent.submit(document.querySelector('#baby-settings-form'));

    await vi.waitFor(() => expect(localStorage.getItem('familyTracker.activeBabyTrackers')).toBe('sleep,diaper'));
    await vi.waitFor(() => expect([...document.querySelectorAll('#summary .summary-item span')].map((node) => node.textContent)).toEqual(['Sleep', 'Diaper']));
    expect([...document.querySelectorAll('#quick-actions .quick-action-button span')].map((node) => node.textContent)).toEqual(['Diaper - pee', 'Diaper - poop', 'Sleep']);
    expect(document.querySelector('#today-context').textContent).toContain('Last diaper');
    expect(document.querySelector('#today-context').textContent).not.toContain('Last milk');
    expect(document.querySelector('#timeline-filter option[value="feeding_milk"]').disabled).toBe(true);
    expect(document.querySelector('#feeding-guidance').classList.contains('hidden')).toBe(true);

    localStorage.removeItem('familyTracker.activeBabyTrackers');
  });


  it('hides all baby tracker status cards when every tracker is disabled', async () => {
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile') && (!init.method || init.method === 'GET')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/profile') && init.method === 'POST') return new Response(JSON.stringify({ profile: JSON.parse(init.body).profile, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [],
          summary: { sleepMinutes: 40, milkCount: 2, milkAmountMl: 180, solidCount: 1, diaperCount: 3 },
          context: { lastMilk: null, lastDiaper: null, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=all-baby-trackers-disabled');

    fireEvent.click(document.querySelector('#open-baby-settings'));
    document.querySelectorAll('[name="babyTrackerTypes"]').forEach((input) => { input.checked = false; });
    fireEvent.submit(document.querySelector('#baby-settings-form'));

    await vi.waitFor(() => expect(localStorage.getItem('familyTracker.activeBabyTrackers')).toBe(''));
    await vi.waitFor(() => expect(document.querySelector('#summary').classList.contains('hidden')).toBe(true));
    expect(document.querySelector('#today-context').classList.contains('hidden')).toBe(true);
    expect(document.querySelector('#quick-actions').children).toHaveLength(0);

    localStorage.removeItem('familyTracker.activeBabyTrackers');
  });

  it('sorts the baby timeline by event time and filters by log type', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [
            { id: 'event-2', type: 'diaper', rawText: 'wet diaper', occurredAt: { value: '2026-05-28T10:00:00.000Z' }, createdAt: '2026-05-28T10:01:00.000Z' },
            { id: 'event-1', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-05-28T08:00:00.000Z' }, amountMl: { value: 120 }, createdAt: '2026-05-28T08:01:00.000Z' },
            { id: 'event-3', type: 'sleep', rawText: 'nap', startAt: { value: '2026-05-28T09:00:00.000Z' }, endAt: { value: '2026-05-28T09:45:00.000Z' }, durationMinutes: { value: 45 }, createdAt: '2026-05-28T09:01:00.000Z' },
          ],
          summary: {},
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=timeline-sort-filter');

    await vi.waitFor(() => expect(document.querySelectorAll('#timeline .timeline-item')).toHaveLength(3));
    const timelineTexts = () => [...document.querySelectorAll('#timeline .raw-text')].map((node) => node.textContent);

    expect(document.querySelector('#timeline-sort').value).toBe('desc');
    expect(timelineTexts()).toEqual(['wet diaper', 'nap', 'formula']);
    expect([...document.querySelectorAll('#timeline .timeline-title')].map((node) => node.textContent)).toEqual(['Diaper (pee)', 'Sleep', 'Formula']);
    expect([...document.querySelectorAll('#summary .summary-item span')].map((node) => node.textContent)).toEqual(['Sleep', 'Milk', 'Baby food', 'Diaper']);
    expect(document.querySelector('#timeline-filter option[value=\"feeding_solid\"]').textContent).toBe('Baby food');
    expect(document.querySelector('#timeline-filter option[value=\"diaper\"]').textContent).toBe('Diaper');
    expect(document.querySelector('#event-count').textContent).toBe('3 of 3 items');

    fireEvent.change(document.querySelector('#timeline-sort'), { target: { value: 'asc' } });
    expect(timelineTexts()).toEqual(['formula', 'nap', 'wet diaper']);
    expect([...document.querySelectorAll('#timeline .timeline-title')].map((node) => node.textContent)).toEqual(['Formula', 'Sleep', 'Diaper (pee)']);

    fireEvent.change(document.querySelector('#timeline-filter'), { target: { value: 'sleep' } });
    expect(timelineTexts()).toEqual(['nap']);
    expect(document.querySelector('#event-count').textContent).toBe('1 of 3 items');

    fireEvent.change(document.querySelector('#timeline-filter'), { target: { value: 'feeding_solid' } });
    expect(document.querySelector('#timeline').textContent).toContain('No records match this filter.');
    expect(document.querySelector('#event-count').textContent).toBe('0 of 3 items');
  });

  it('shows LLM-first baby context, save feedback, and recent suggestions', async () => {
    let todayEvents = [
      {
        id: 'event-1',
        type: 'feeding_milk',
        rawText: 'formula',
        occurredAt: { value: '2026-05-30T08:00:00.000Z' },
        amountMl: { value: 120, source: 'inferred', basis: 'profile_or_age_default', confidence: 0.62 },
        inputSource: 'alexa',
        parserInfo: { kind: 'llm', provider: 'openai', model: 'gpt-5.4-mini', label: 'openai · gpt-5.4-mini' },
        createdAt: '2026-05-30T08:01:00.000Z',
      },
      {
        id: 'event-2',
        type: 'diaper',
        rawText: 'poop diaper',
        occurredAt: { value: '2026-05-30T09:00:00.000Z' },
        diaperKind: { value: 'dirty', source: 'explicit' },
        parserInfo: { kind: 'heuristic', provider: 'local', model: 'rule-based-mvp' },
        createdAt: '2026-05-30T09:01:00.000Z',
      },
    ];
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url === '/api/logs' && init.method === 'POST') {
        todayEvents = [
          ...todayEvents,
          { id: 'event-3', type: 'feeding_milk', rawText: '분유 120 먹고 응가했어', occurredAt: { value: '2026-05-30T10:00:00.000Z' }, amountMl: { value: 120, source: 'explicit' }, createdAt: '2026-05-30T10:00:00.000Z' },
          { id: 'event-4', type: 'diaper', rawText: '분유 120 먹고 응가했어', occurredAt: { value: '2026-05-30T10:00:00.000Z' }, diaperKind: { value: 'dirty', source: 'explicit' }, createdAt: '2026-05-30T10:00:00.000Z' },
        ];
        return new Response(JSON.stringify({ events: todayEvents.slice(-2) }), { status: 200 });
      }
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: todayEvents,
          summary: { sleepMinutes: 0, milkCount: 1, milkAmountMl: 120, solidCount: 0, diaperCount: 1 },
          context: {
            lastMilk: { label: '2h ago', amountMl: 120 },
            lastDiaper: { label: '1h ago', diaperKind: 'dirty' },
            sleep: null,
            inferredFieldCount: 1,
            correctedFieldCount: 0,
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-llm-context');

    await vi.waitFor(() => expect(document.querySelector('#today-context').textContent).toContain('2h ago · 120ml'));
    expect(document.querySelector('#today-context').textContent).toContain('1h ago · poop');
    expect(document.querySelector('#timeline').textContent).toContain('LLM · gpt-5.4-mini');
    expect(document.querySelector('#timeline').textContent).toContain('Amount estimated');
    expect(document.querySelector('#timeline').textContent).toContain('Added by Alexa');

    fireEvent.input(document.querySelector('#log-input'), { target: { value: '분유 120 먹고 응가했어' } });
    fireEvent.submit(document.querySelector('#log-form'));

    await vi.waitFor(() => expect(document.querySelector('#answer').textContent).toBe('2 logs saved'));
    expect([...document.querySelectorAll('#recent-actions .suggested-action span')].map((node) => node.textContent)).toContain('분유 120 먹고 응가했어');
  });

  it('shows a component-level saving mark while a baby log is being saved', async () => {
    let resolveLogSave;
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      if (url === '/api/logs' && init.method === 'POST') {
        return new Promise((resolve) => {
          resolveLogSave = () => resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
        });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-log-saving-mark');

    const form = document.querySelector('#log-form');
    const status = document.querySelector('#log-save-status');

    fireEvent.input(document.querySelector('#log-input'), { target: { value: '분유 120' } });
    fireEvent.submit(form);

    await vi.waitFor(() => expect(resolveLogSave).toBeTypeOf('function'));
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(form.classList.contains('saving')).toBe(true);
    expect(status.classList.contains('hidden')).toBe(false);
    expect(status.textContent).toContain('Saving...');
    const postRequest = global.fetch.mock.calls.find(([url, init = {}]) => url === '/api/logs' && init.method === 'POST');
    expect(JSON.parse(postRequest[1].body).day).toBe(document.querySelector('#day-picker').value);

    resolveLogSave();

    await vi.waitFor(() => expect(form.getAttribute('aria-busy')).toBe('false'));
    expect(form.classList.contains('saving')).toBe(false);
    expect(status.classList.contains('hidden')).toBe(true);
  });

  it('does not keep the baby record input saving after save succeeds while today refresh is pending', async () => {
    let resolveLogSave;
    let saveResolved = false;
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        if (saveResolved) return new Promise(() => {});
        return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      }
      if (url === '/api/logs' && init.method === 'POST') {
        return new Promise((resolve) => {
          resolveLogSave = () => {
            saveResolved = true;
            resolve(new Response(JSON.stringify({
              events: [{
                id: 'event-1',
                rawLogId: 'rawlog-1',
                rawText: 'fed 80 ml breastmilk at 4:00 am',
                type: 'feeding_milk',
                occurredAt: { value: '2026-06-09T11:00:00.000Z' },
                amountMl: { value: 80 },
                feedingKind: { value: 'breast' },
              }],
            }), { status: 200 }));
          };
        });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-log-save-refresh-pending');

    const form = document.querySelector('#log-form');
    const status = document.querySelector('#log-save-status');

    fireEvent.input(document.querySelector('#log-input'), { target: { value: 'fed 80 ml breastmilk at 4:00 am' } });
    fireEvent.submit(form);

    await vi.waitFor(() => expect(resolveLogSave).toBeTypeOf('function'));
    expect(form.getAttribute('aria-busy')).toBe('true');

    resolveLogSave();

    await vi.waitFor(() => expect(document.querySelector('#answer').textContent).toBe('1 log saved'));
    expect(document.querySelector('#timeline').textContent).toContain('Breast milk');
    expect(form.getAttribute('aria-busy')).toBe('false');
    expect(form.classList.contains('saving')).toBe(false);
    expect(status.classList.contains('hidden')).toBe(true);
  });


  it('warns and keeps baby log text when a record needs clarification', async () => {
    window.alert = vi.fn();
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      if (url === '/api/logs' && init.method === 'POST') {
        return new Response(JSON.stringify({
          status: 'needs_clarification',
          code: 'needs_clarification',
          error: '입력 내용을 정확히 기록하려면 추가 정보가 필요해요.',
          message: '5mins could mean diaper timing or feeding duration.',
          questions: ['Did the poop diaper happen 5 minutes before formula feeding?'],
          suggestedInputs: ['formula now, poop diaper 5 minutes before'],
        }), { status: 422 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-clarification');

    fireEvent.input(document.querySelector('#log-input'), { target: { value: 'poop diaper before feeding formula 5mins' } });
    fireEvent.submit(document.querySelector('#log-form'));

    await vi.waitFor(() => expect(document.querySelector('#answer').textContent).toContain('추가 정보가 필요'));
    expect(document.querySelector('#answer').textContent).toContain('5 minutes before');
    expect(document.querySelector('#log-input').value).toBe('poop diaper before feeding formula 5mins');
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('formula now, poop diaper 5 minutes before'));
  });

  it('sends edit and delete requests for baby timeline logs', async () => {
    global.prompt = vi.fn(() => 'updated formula');
    global.confirm = vi.fn(() => true);
    const swipedInit = vi.fn(() => ({ open: vi.fn(), close: vi.fn() }));
    window.Swiped = { init: swipedInit };
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [{
            id: 'event-1',
            rawLogId: 'rawlog-1',
            type: 'feeding_milk',
            rawText: 'formula',
            parserInfo: { kind: 'heuristic' },
            occurredAt: { value: '2026-05-28T10:00:00.000Z' },
            amountMl: { value: 120 },
          }],
          summary: {},
        }), { status: 200 });
      }
      if (url === '/api/logs/rawlog-1' && init.method === 'PATCH') {
        return new Response(JSON.stringify({ events: [] }), { status: 200 });
      }
      if (url === '/api/logs/rawlog-1' && init.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-log-actions');

    await vi.waitFor(() => expect(document.querySelector('#timeline .raw-text')?.textContent).toBe('formula'));
    const timeline = document.querySelector('#timeline');
    expect(timeline.querySelector('.timeline-swipe .swipe-hint')).toBeNull();
    expect(timeline.querySelector('.swipe-affordance')).toBeNull();
    fireEvent.click(timeline.querySelector('.timeline-detail-button'));
    expect(timeline.querySelector('.timeline-detail-popover')?.hidden).toBe(false);
    expect(timeline.querySelector('.timeline-detail-popover')?.textContent).toContain('Original text');
    expect(timeline.querySelectorAll('.swipe-action svg').length).toBeGreaterThanOrEqual(2);
    expect(swipedInit).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('data-swipe-id'),
      right: expect.any(Number),
      onOpen: expect.any(Function),
      onClose: expect.any(Function),
    }));

    fireEvent.click(screen.getByText('Edit', { selector: '#timeline .swipe-action span' }));
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Edit baby record' })).toBeTruthy());
    const editQuickActions = document.querySelector('#action-dialog-quick-actions');
    expect(editQuickActions.classList.contains('hidden')).toBe(false);
    expect(editQuickActions.textContent).toContain('Feed formula');
    expect(editQuickActions.textContent).toContain('80 ml');
    const editInput = document.querySelector('#action-dialog-input');
    fireEvent.click([...editQuickActions.querySelectorAll('.quick-value-option')].find((button) => button.textContent === '80 ml'));
    expect(editInput.value).toContain('formula 80 ml');
    fireEvent.submit(document.querySelector('#action-dialog-form'));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/logs/rawlog-1', expect.objectContaining({
      method: 'PATCH',
      body: expect.stringContaining('formula 80 ml'),
    })));
    const patchRequest = global.fetch.mock.calls.find(([url, init = {}]) => url === '/api/logs/rawlog-1' && init.method === 'PATCH');
    expect(JSON.parse(patchRequest[1].body)).toMatchObject({
      day: document.querySelector('#day-picker').value,
      parserMode: 'heuristic',
    });

    fireEvent.click(screen.getByText('Delete', { selector: '#timeline .swipe-action span' }));
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Delete baby record?' })).toBeTruthy());
    expect(document.querySelector('#action-dialog-quick-actions').classList.contains('hidden')).toBe(true);
    fireEvent.submit(document.querySelector('#action-dialog-form'));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/logs/rawlog-1', expect.objectContaining({ method: 'DELETE' })));
  });

  it('shows the baby log saving mark while edit and delete requests are pending', async () => {
    let resolvePatch;
    let resolveDelete;
    const swipedInit = vi.fn(() => ({ open: vi.fn(), close: vi.fn() }));
    window.Swiped = { init: swipedInit };
    global.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) {
        return new Response(JSON.stringify({
          events: [{
            id: 'event-1',
            rawLogId: 'rawlog-1',
            type: 'feeding_milk',
            rawText: 'formula',
            parserInfo: { kind: 'heuristic' },
            occurredAt: { value: '2026-05-28T10:00:00.000Z' },
            amountMl: { value: 120 },
          }],
          summary: {},
        }), { status: 200 });
      }
      if (url === '/api/logs/rawlog-1' && init.method === 'PATCH') {
        return new Promise((resolve) => {
          resolvePatch = () => resolve(new Response(JSON.stringify({ events: [] }), { status: 200 }));
        });
      }
      if (url === '/api/logs/rawlog-1' && init.method === 'DELETE') {
        return new Promise((resolve) => {
          resolveDelete = () => resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
        });
      }
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=baby-log-edit-delete-saving-mark');

    await vi.waitFor(() => expect(document.querySelector('#timeline .raw-text')?.textContent).toBe('formula'));

    fireEvent.click(screen.getByText('Edit', { selector: '#timeline .swipe-action span' }));
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Edit baby record' })).toBeTruthy());
    const dialogForm = document.querySelector('#action-dialog-form');
    const dialogStatus = document.querySelector('#action-dialog-status');
    fireEvent.submit(document.querySelector('#action-dialog-form'));
    await vi.waitFor(() => expect(resolvePatch).toBeTypeOf('function'));
    expect(dialogForm.getAttribute('aria-busy')).toBe('true');
    expect(dialogStatus.classList.contains('hidden')).toBe(false);
    expect(dialogStatus.textContent).toContain('Saving...');
    expect(document.querySelector('#action-dialog-confirm').disabled).toBe(true);
    const patchRequest = global.fetch.mock.calls.find(([url, init = {}]) => url === '/api/logs/rawlog-1' && init.method === 'PATCH');
    expect(JSON.parse(patchRequest[1].body).parserMode).toBe('heuristic');

    resolvePatch();
    await vi.waitFor(() => expect(document.querySelector('#action-dialog').open).toBe(false));
    expect(dialogForm.getAttribute('aria-busy')).toBe('false');

    fireEvent.click(screen.getByText('Delete', { selector: '#timeline .swipe-action span' }));
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Delete baby record?' })).toBeTruthy());
    fireEvent.submit(document.querySelector('#action-dialog-form'));
    await vi.waitFor(() => expect(resolveDelete).toBeTypeOf('function'));
    expect(dialogForm.getAttribute('aria-busy')).toBe('true');
    expect(dialogStatus.classList.contains('hidden')).toBe(false);
    expect(dialogStatus.textContent).toContain('Deleting...');
    expect(document.querySelector('#action-dialog-confirm').disabled).toBe(true);

    resolveDelete();
    await vi.waitFor(() => expect(document.querySelector('#action-dialog').open).toBe(false));
    expect(dialogForm.getAttribute('aria-busy')).toBe('false');
  });

  it('keeps completed tasks in a separate bottom section', async () => {
    const swipedInit = vi.fn(() => ({ open: vi.fn(), close: vi.fn() }));
    window.Swiped = { init: swipedInit };

    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: {}, growthRecords: [] }), { status: 200 });
      if (url.endsWith('/api/task-assignees')) return new Response(JSON.stringify({ assignees: [{ id: 'a1', name: 'Mom', color: '#0066cc' }] }), { status: 200 });
      if (url.startsWith('/api/tasks/today')) {
        return new Response(JSON.stringify({ tasks: [
          { id: 't1', title: 'Wash bottles', status: 'open', assigneeId: 'a1', assigneeName: 'Mom', assigneeColor: '#0066cc', dueMode: 'on_date', dueDate: '2026-05-28' },
          { id: 't2', title: 'Fold laundry', status: 'done', assigneeId: 'a1', assigneeName: 'Mom', assigneeColor: '#0066cc', dueMode: 'on_date', dueDate: '2026-05-28', completedAt: '2026-05-28T12:00:00.000Z' },
        ] }), { status: 200 });
      }
      return new Response(JSON.stringify({ tasks: [], summary: null }), { status: 200 });
    });

    await import('../../app/main.js?case=completed-tasks');
    fireEvent.click(document.querySelector('#task-tab'));

    await vi.waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
    const completedSection = document.querySelector('.completed-task-section');
    expect(completedSection.textContent).toContain('Fold laundry');
    expect(document.querySelector('.task-board').textContent).toContain('Wash bottles');
  });


  it('renders feeding guidance from current records, newborn guideline, and yesterday comparison', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T12:00:00'));
    try {
      global.fetch = vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
        if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
        if (url.endsWith('/api/profile')) {
          return new Response(JSON.stringify({
            profile: { babyName: 'Ari', birthDate: '2026-05-16', milkAmountMlOverride: 30 },
            growthRecords: [],
          }), { status: 200 });
        }
        if (url.startsWith('/api/logs/today')) {
          const requestUrl = new URL(url, 'http://localhost');
          const day = requestUrl.searchParams.get('day');
          const count = day === '2026-05-29' ? 6 : 5;
          const amount = day === '2026-05-29' ? 25 : 20;
          return new Response(JSON.stringify({
            events: Array.from({ length: count }, (_, index) => ({
              id: `${day}-${index}`,
              type: 'feeding_milk',
              rawText: `formula ${amount}`,
              occurredAt: { value: `${day}T0${Math.min(index + 1, 9)}:00:00.000Z` },
              amountMl: { value: amount },
            })),
            summary: { milkCount: count, milkAmountMl: count * amount },
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
      });

      await import('../../app/main.js?case=feeding-guidance');

      await vi.waitFor(() => expect(screen.getByText('Feeding progress')).toBeTruthy());
      const guidance = document.querySelector('#feeding-guidance');
      expect(guidance.textContent).toContain('Week 3 newborn');
      expect(guidance.textContent).toContain('Progress at a glance');
      expect([...guidance.querySelectorAll('.feeding-progress-row summary span')].map((node) => node.textContent)).toEqual(['Day elapsed', 'Milk pace']);
      expect(guidance.textContent).toContain('5x · 100ml');
      expect(guidance.textContent).toContain('4–6x · 120–180ml');
      expect(guidance.textContent).toContain('50ml less');
      expect(guidance.querySelectorAll('a').length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });


  it('refreshes milk pace when baby profile loads after milk logs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-30T12:00:00'));
    let resolveProfile;
    const profileReady = new Promise((resolve) => { resolveProfile = resolve; });
    try {
      global.fetch = vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
        if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
        if (url.endsWith('/api/profile')) {
          await profileReady;
          return new Response(JSON.stringify({
            profile: { babyName: 'Ari', birthDate: '2026-05-16', milkAmountMlOverride: 30 },
            growthRecords: [],
          }), { status: 200 });
        }
        if (url.startsWith('/api/logs/today')) {
          const requestUrl = new URL(url, 'http://localhost');
          const day = requestUrl.searchParams.get('day') || '2026-05-30';
          const count = day === '2026-05-29' ? 6 : 5;
          const amount = day === '2026-05-29' ? 25 : 20;
          return new Response(JSON.stringify({
            events: Array.from({ length: count }, (_, index) => ({
              id: `${day}-${index}`,
              type: 'feeding_milk',
              rawText: `formula ${amount}`,
              occurredAt: { value: `${day}T0${Math.min(index + 1, 9)}:00:00.000Z` },
              amountMl: { value: amount },
            })),
            summary: { milkCount: count, milkAmountMl: count * amount },
          }), { status: 200 });
        }
        return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null }), { status: 200 });
      });

      const importPromise = import('../../app/main.js?case=feeding-guidance-profile-race');
      await vi.waitFor(() => expect(document.querySelector('#feeding-guidance')?.textContent).toContain('Add a birth date'));

      resolveProfile();
      await importPromise;

      const guidance = document.querySelector('#feeding-guidance');
      expect(guidance.textContent).toContain('Week 3 newborn');
      expect(guidance.textContent).toContain('Milk pace');
      expect(guidance.textContent).toContain('4–6x · 120–180ml');
    } finally {
      vi.useRealTimers();
    }
  });


  it('checks lightweight sync state and reloads only after a module version changes', async () => {
    vi.useFakeTimers();
    let babyVersion = 'baby-v1';
    try {
      global.fetch = vi.fn(async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
        if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
        if (url.startsWith('/api/sync/state')) {
          return new Response(JSON.stringify({ modules: { baby: { version: babyVersion }, task: { version: 'task-v1' }, profile: { version: 'profile-v1' } } }), { status: 200 });
        }
        if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: { babyName: 'Ari' }, growthRecords: [] }), { status: 200 });
        if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
        return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
      });

      await import('../../app/main.js?case=sync-refresh');
      const initialTodayCalls = global.fetch.mock.calls.filter(([input]) => String(input).startsWith('/api/logs/today')).length;

      await vi.advanceTimersByTimeAsync(REMOTE_SYNC_TEST_INTERVAL_MS);
      const unchangedTodayCalls = global.fetch.mock.calls.filter(([input]) => String(input).startsWith('/api/logs/today')).length;
      expect(unchangedTodayCalls).toBe(initialTodayCalls);

      babyVersion = 'baby-v2';
      await vi.advanceTimersByTimeAsync(REMOTE_SYNC_TEST_INTERVAL_MS);
      await vi.waitFor(() => {
        const changedTodayCalls = global.fetch.mock.calls.filter(([input]) => String(input).startsWith('/api/logs/today')).length;
        expect(changedTodayCalls).toBeGreaterThan(initialTodayCalls);
      });
    } finally {
      vi.useRealTimers();
    }
  });


  it('supports pull-to-refresh as an explicit user refresh gesture', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.startsWith('/api/sync/state')) {
        return new Response(JSON.stringify({ modules: { baby: { version: 'b1' }, task: { version: 't1' }, profile: { version: 'p1' } } }), { status: 200 });
      }
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: { babyName: 'Ari' }, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    localStorage.setItem('familyTracker.activeTab', 'baby');
    await import('../../app/main.js?case=pull-refresh');
    const initialProfileCalls = global.fetch.mock.calls.filter(([input]) => String(input).endsWith('/api/profile')).length;

    const babySurface = document.querySelector('#baby-view');
    dispatchTouch('touchstart', 0, { target: babySurface });
    dispatchTouch('touchmove', 180);
    expect(document.querySelector('#pull-refresh-label').textContent).toBe('Release to refresh');
    dispatchTouch('touchend', 180, { ended: true });

    await vi.waitFor(() => {
      const profileCalls = global.fetch.mock.calls.filter(([input]) => String(input).endsWith('/api/profile')).length;
      expect(profileCalls).toBeGreaterThan(initialProfileCalls);
    });
    expect(['Refreshing...', 'Updated']).toContain(document.querySelector('#pull-refresh-label').textContent);
  });

  it('ignores pull-to-refresh gestures that start in floating overlay layers', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.startsWith('/api/sync/state')) {
        return new Response(JSON.stringify({ modules: { baby: { version: 'b1' }, task: { version: 't1' }, profile: { version: 'p1' } } }), { status: 200 });
      }
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: { babyName: 'Ari' }, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    localStorage.setItem('familyTracker.activeTab', 'baby');
    await import('../../app/main.js?case=pull-refresh-floating-layer');
    const floatingPanel = document.querySelector('#menu-panel');
    floatingPanel.classList.remove('hidden');

    dispatchTouch('touchstart', 0, { target: floatingPanel });
    dispatchTouch('touchmove', 180);

    expect(document.querySelector('#pull-refresh').classList.contains('visible')).toBe(false);
    expect(document.querySelector('#pull-refresh-label').textContent).toBe('Pull to refresh');
  });

  it('requires the bottom document scroll layer to be at the top before pull-to-refresh starts', async () => {
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.endsWith('/app/build.json') || url.startsWith('/app/build.json?')) return new Response(JSON.stringify({ build: 1 }), { status: 200 });
      if (url.endsWith('/api/auth/me')) return new Response(JSON.stringify({ user: { id: 'u1', name: 'Parent' } }), { status: 200 });
      if (url.startsWith('/api/sync/state')) {
        return new Response(JSON.stringify({ modules: { baby: { version: 'b1' }, task: { version: 't1' }, profile: { version: 'p1' } } }), { status: 200 });
      }
      if (url.endsWith('/api/profile')) return new Response(JSON.stringify({ profile: { babyName: 'Ari' }, growthRecords: [] }), { status: 200 });
      if (url.startsWith('/api/logs/today')) return new Response(JSON.stringify({ events: [], summary: {}, context: {} }), { status: 200 });
      return new Response(JSON.stringify({ tasks: [], assignees: [], summary: null, logs: [] }), { status: 200 });
    });

    localStorage.setItem('familyTracker.activeTab', 'baby');
    await import('../../app/main.js?case=pull-refresh-scroll-gate');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 16 });

    dispatchTouch('touchstart', 0, { target: document.querySelector('#baby-view') });
    dispatchTouch('touchmove', 180);

    expect(document.querySelector('#pull-refresh').classList.contains('visible')).toBe(false);
    expect(document.querySelector('#pull-refresh-label').textContent).toBe('Pull to refresh');
  });

});
