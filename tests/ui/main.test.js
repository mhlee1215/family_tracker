import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';
import { readFileSync } from 'node:fs';

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

describe('app/main', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = mockFetch();
    delete window.Swiped;
  });

  it('renders login panel for unauthenticated user', async () => {
    await import('../../app/main.js?case=auth');

    const authPanel = document.querySelector('#auth-panel');

    expect(authPanel.classList.contains('hidden')).toBe(false);
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

    const likeButton = document.querySelector('#meal-breakfast .meal-like-button');
    expect(likeButton).toBeTruthy();
    expect(likeButton.getAttribute('aria-label')).toBe('Thumbs up Egg toast');
    expect(likeButton.querySelector('svg')).toBeTruthy();
    expect(likeButton.querySelector('span').textContent).toBe('0');

    fireEvent.click(likeButton);

    expect(document.querySelector('#meal-breakfast .meal-like-button span').textContent).toBe('1');
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

  it('keeps baby settings inside Baby Tracker and toggles growth summary chart', async () => {
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
    const summaryPanel = document.querySelector('#growth-summary');

    expect(settingsPanel.classList.contains('hidden')).toBe(true);
    fireEvent.click(document.querySelector('#open-baby-settings'));
    expect(settingsPanel.classList.contains('hidden')).toBe(false);
    expect(document.querySelector('#baby-settings-panel #baby-settings-form')).toBeTruthy();

    fireEvent.click(document.querySelector('#open-baby-summary'));
    expect(settingsPanel.classList.contains('hidden')).toBe(true);
    expect(settingsPanel.getAttribute('aria-hidden')).toBe('true');
    expect(summaryPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.getAttribute('aria-hidden')).toBe('false');
    expect(summaryPanel.querySelector('.growth-chart')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(summaryPanel.classList.contains('hidden')).toBe(true);
    expect(summaryPanel.getAttribute('aria-hidden')).toBe('true');
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

  it('submits question form and renders response', async () => {
    await import('../../app/main.js?case=ask');

    const input = screen.getByPlaceholderText('How much sleep today?');
    const form = document.querySelector('#ask-form');

    input.value = 'How much sleep?';
    fireEvent.submit(form);

    await vi.waitFor(() => {
      expect(screen.getByText('8 hours')).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/ask', expect.objectContaining({ method: 'POST' }));
  });

  it('jumps every date control back to today with compact icon controls', async () => {
    await import('../../app/main.js?case=today-jump');

    const babyPicker = document.querySelector('#day-picker');
    const taskPicker = document.querySelector('#task-day-picker');
    const mealPicker = document.querySelector('#meal-day-picker');
    const todayButtons = Array.from(document.querySelectorAll('.today-jump'));
    const calendarButtons = Array.from(document.querySelectorAll('.calendar-toggle'));

    expect(todayButtons).toHaveLength(3);
    expect(calendarButtons).toHaveLength(3);
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

    fireEvent.click(document.querySelector('#meal-today'));

    const today = new Date().toLocaleDateString('en-CA');
    expect(babyPicker.value).toBe(today);
    expect(taskPicker.value).toBe(today);
    expect(mealPicker.value).toBe(today);
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

    expect(timelineTexts()).toEqual(['formula', 'nap', 'wet diaper']);
    expect(document.querySelector('#event-count').textContent).toBe('3 of 3 items');

    fireEvent.change(document.querySelector('#timeline-sort'), { target: { value: 'desc' } });
    expect(timelineTexts()).toEqual(['wet diaper', 'nap', 'formula']);

    fireEvent.change(document.querySelector('#timeline-filter'), { target: { value: 'sleep' } });
    expect(timelineTexts()).toEqual(['nap']);
    expect(document.querySelector('#event-count').textContent).toBe('1 of 3 items');

    fireEvent.change(document.querySelector('#timeline-filter'), { target: { value: 'feeding_solid' } });
    expect(document.querySelector('#timeline').textContent).toContain('No logs match this filter.');
    expect(document.querySelector('#event-count').textContent).toBe('0 of 3 items');
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
    expect(timeline.querySelector('.timeline-swipe .swipe-hint')?.textContent).toBe('Swipe left for actions');
    expect(timeline.querySelectorAll('.swipe-action svg').length).toBeGreaterThanOrEqual(2);
    expect(swipedInit).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('data-swipe-id'),
      right: expect.any(Number),
      onOpen: expect.any(Function),
      onClose: expect.any(Function),
    }));

    fireEvent.click(screen.getByText('Edit', { selector: '#timeline .swipe-action span' }));
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Edit baby log' })).toBeTruthy());
    const editInput = document.querySelector('#action-dialog-input');
    fireEvent.input(editInput, { target: { value: 'updated formula' } });
    fireEvent.submit(document.querySelector('#action-dialog-form'));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/logs/rawlog-1', expect.objectContaining({ method: 'PATCH' })));

    fireEvent.click(screen.getByText('Delete', { selector: '#timeline .swipe-action span' }));
    await vi.waitFor(() => expect(screen.getByRole('heading', { name: 'Delete baby log?' })).toBeTruthy());
    fireEvent.submit(document.querySelector('#action-dialog-form'));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/logs/rawlog-1', expect.objectContaining({ method: 'DELETE' })));
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

});
