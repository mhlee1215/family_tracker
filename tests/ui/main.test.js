import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/dom';

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

  it('changes meal date when clicking previous/next meal day arrows', async () => {
    await import('../../app/main.js?case=meal-day-arrows');

    const previousButton = document.querySelector('#previous-meal-day');
    const nextButton = document.querySelector('#next-meal-day');
    const picker = document.querySelector('#meal-day-picker');
    const mealTabButton = document.querySelector('#meal-tab');

    fireEvent.click(mealTabButton);

    fireEvent.click(previousButton);
    const previousDayValue = picker.value;
    expect(previousDayValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    fireEvent.click(nextButton);
    const nextDayValue = picker.value;
    expect(nextDayValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(nextDayValue > previousDayValue).toBe(true);
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
    expect(summaryPanel.classList.contains('hidden')).toBe(false);
    expect(summaryPanel.querySelector('.growth-chart')).toBeTruthy();
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
});
