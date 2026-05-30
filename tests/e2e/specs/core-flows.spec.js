import { test, expect } from '@playwright/test';
import { AppHarness } from '../helpers/app-harness.js';

test.describe('Family Tracker core flows', () => {
  test('first screen renders and top-level navigation works', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await app.captureStep('Logged in to baby home', 'Dev admin login completed and baby module opened.');

    await expect(page.locator('#baby-view.active #day-label')).toHaveText('Today');
    await expect(page.locator('#timeline')).toBeVisible();

    await page.locator('#task-tab').click();
    await expect(page.locator('#task-view.active #task-day-label')).toHaveText('Today');
    await expect(page.locator('#task-list')).toBeVisible();
    await app.captureStep('Navigated to task tab', 'Task view rendered with today context and list.');

    await page.locator('#baby-tab').click();
    await expect(page.locator('#log-form')).toBeVisible();
    await app.captureStep('Returned to baby tab', 'Baby log form is visible again.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby feeding guidance compares current milk records with the newborn pace', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);

    await page.route('**/api/profile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ profile: { babyName: 'Ari', birthDate: '2026-05-16', milkAmountMlOverride: 30 }, growthRecords: [] }),
      });
    });
    await page.route('**/api/logs/today**', async (route) => {
      const url = new URL(route.request().url());
      const day = url.searchParams.get('day') || '2026-05-30';
      const isPrevious = day === '2026-05-29';
      const count = isPrevious ? 6 : 5;
      const amount = isPrevious ? 25 : 20;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: Array.from({ length: count }, (_, index) => ({
            id: `${day}-${index}`,
            type: 'feeding_milk',
            rawText: `formula ${amount}`,
            occurredAt: { value: `${day}T0${Math.min(index + 1, 9)}:00:00.000Z` },
            amountMl: { value: amount },
            createdAt: `${day}T0${Math.min(index + 1, 9)}:01:00.000Z`,
          })),
          summary: { milkCount: count, milkAmountMl: count * amount },
        }),
      });
    });

    await page.addInitScript(() => {
      const fixedNow = new Date('2026-05-30T12:00:00').getTime();
      const RealDate = Date;
      // eslint-disable-next-line no-global-assign
      Date = class extends RealDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }
        static now() { return fixedNow; }
      };
    });

    await app.loginAsDevAdmin();
    await expect(page.locator('#feeding-guidance')).toContainText('Feeding progress');
    await expect(page.locator('#feeding-guidance')).toContainText('5x · 100ml');
    await expect(page.locator('#feeding-guidance')).toContainText('4–6x · 120–180ml');
    await expect(page.locator('#feeding-guidance')).toContainText('50ml less');
    await expect(page.locator('#feeding-guidance a')).toHaveCount(3);
    await app.captureStep('Reviewed feeding progress guidance', 'The baby tab shows guideline progress, yesterday comparison, and source links.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('log input submit and CTA flow to task composer works', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await app.captureStep('Opened app for log flow', 'Starting on baby tab before creating a log.');

    await page.locator('#log-input').fill('formula');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();
    await app.captureStep('Saved baby log', 'Timeline updated with newly saved item.');

    await page.locator('#task-tab').click();
    await page.locator('#open-task-composer').click();
    await expect(page.locator('#task-form')).toBeVisible();
    await app.captureStep('Opened task composer', 'Task creation form is visible.');

    await page.locator('#task-assignee').selectOption({ index: 0 });
    await page.locator('#task-title').fill('E2E task creation');
    await page.locator('#task-due-mode').selectOption('on_date');
    await page.locator('#task-form button[type="submit"]').click();

    await expect(page.locator('#task-list')).toContainText('E2E task creation');
    await app.captureStep('Created task successfully', 'Task list shows the newly created task title.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('baby timeline sort and filter controls reorder visible logs', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);

    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            { id: 'timeline-diaper', type: 'diaper', rawText: 'wet diaper', occurredAt: { value: '2026-05-28T10:00:00.000Z' }, createdAt: '2026-05-28T10:01:00.000Z' },
            { id: 'timeline-formula', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-05-28T08:00:00.000Z' }, amountMl: { value: 120 }, createdAt: '2026-05-28T08:01:00.000Z' },
            { id: 'timeline-nap', type: 'sleep', rawText: 'nap', startAt: { value: '2026-05-28T09:00:00.000Z' }, endAt: { value: '2026-05-28T09:45:00.000Z' }, durationMinutes: { value: 45 }, createdAt: '2026-05-28T09:01:00.000Z' },
          ],
          summary: {},
        }),
      });
    });
    await app.loginAsDevAdmin();

    await expect(page.locator('#timeline .raw-text')).toHaveText(['formula', 'nap', 'wet diaper']);
    await expect(page.locator('#timeline .timeline-title')).toHaveText(['Formula', 'Sleep', 'Diaper (pee)']);
    await expect(page.locator('#summary .summary-item span')).toHaveText(['Sleep', 'Milk', 'Baby food', 'Diaper']);
    await app.captureStep('Timeline sorted oldest first', 'The default timeline order follows event time from earliest to latest.');

    await page.locator('#timeline-sort').selectOption('desc');
    await expect(page.locator('#timeline .raw-text')).toHaveText(['wet diaper', 'nap', 'formula']);
    await app.captureStep('Timeline sorted newest first', 'The sort control reverses visible logs by event time.');

    await page.locator('#timeline-filter').selectOption('sleep');
    await expect(page.locator('#timeline .raw-text')).toHaveText(['nap']);
    await expect(page.locator('#event-count')).toHaveText('1 of 3 items');
    await app.captureStep('Timeline filtered to sleep', 'The filter control limits visible timeline items to sleep logs.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('LLM-first baby context and recent suggestions update after mixed log save', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let events = [];

    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events,
          summary: { sleepMinutes: 0, milkCount: events.filter((event) => event.type === 'feeding_milk').length, milkAmountMl: 120, solidCount: 0, diaperCount: events.filter((event) => event.type === 'diaper').length },
          context: events.length ? {
            lastMilk: { label: '0m ago', amountMl: 120 },
            lastDiaper: { label: '0m ago', diaperKind: 'dirty' },
            sleep: null,
            inferredFieldCount: 0,
            correctedFieldCount: 0,
          } : { lastMilk: null, lastDiaper: null, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 },
        }),
      });
    });
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      events = [
        { id: 'e2e-milk', type: 'feeding_milk', rawText: '분유 120 먹고 응가했어', occurredAt: { value: '2026-05-30T10:00:00.000Z' }, amountMl: { value: 120, source: 'explicit' }, parserInfo: { kind: 'llm', provider: 'openai', model: 'gpt-5.4-mini' }, createdAt: '2026-05-30T10:00:00.000Z' },
        { id: 'e2e-diaper', type: 'diaper', rawText: '분유 120 먹고 응가했어', occurredAt: { value: '2026-05-30T10:00:00.000Z' }, diaperKind: { value: 'dirty', source: 'explicit' }, parserInfo: { kind: 'llm', provider: 'openai', model: 'gpt-5.4-mini' }, createdAt: '2026-05-30T10:00:00.000Z' },
      ];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events }) });
    });

    await app.loginAsDevAdmin();
    await page.locator('#log-input').fill('분유 120 먹고 응가했어');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#answer')).toHaveText('2 logs saved');
    await expect(page.locator('#today-context')).toContainText('0m ago · 120ml');
    await expect(page.locator('#today-context')).toContainText('0m ago · poop');
    await expect(page.locator('#timeline .parser-badge-llm').first()).toContainText('LLM');
    await expect(page.locator('#quick-actions .suggested-action')).toContainText('분유 120 먹고 응가했어');
    await app.captureStep('Saved mixed baby log with context', 'A mixed natural-language log produced two visible records, updated Today Context, and became a recent suggestion.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby nap shortcut toggles to Wake while using heuristic button parsing', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let hasOpenSleep = false;
    let shortcutPayload = null;
    const openSleep = {
      id: 'e2e-open-sleep',
      rawLogId: 'e2e-raw-sleep',
      type: 'sleep',
      rawText: 'nap',
      action: { value: 'start' },
      startAt: { value: new Date(Date.now() - 5 * 60000).toISOString() },
      status: 'ongoing_or_predicted',
      parserInfo: { kind: 'heuristic' },
    };

    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: hasOpenSleep ? [openSleep] : [], summary: {} }),
      });
    });
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      shortcutPayload = route.request().postDataJSON();
      hasOpenSleep = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [openSleep] }),
      });
    });

    await app.loginAsDevAdmin();
    await expect(page.locator('#tablet-actions')).toContainText('Nap start');
    await app.captureStep('Opened baby shortcut board', 'Nap start appears before an open sleep session exists.');

    await page.locator('#tablet-actions button', { hasText: 'Nap start' }).click();

    await expect(page.locator('#sleep-status')).toContainText('Napping now');
    await expect(page.locator('#tablet-actions')).toContainText('Wake');
    await expect(page.locator('#tablet-actions')).not.toContainText('Nap start');
    expect(shortcutPayload).toMatchObject({ text: 'nap', parserMode: 'heuristic', inputSource: 'button' });
    await app.captureStep('Nap shortcut toggled to Wake', 'Open sleep status is visible and the shortcut is now a Wake action.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby timeline item reveals and runs actions after a left swipe', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await app.captureStep('Opened app for swipe action scenario', 'Starting on baby tab before creating a swipable timeline log.');

    const rawText = `swipe action formula ${Date.now()}`;
    await page.locator('#log-input').fill(rawText);
    await page.getByRole('button', { name: 'Save' }).click();

    const row = page.locator('#timeline .timeline-swipe', { hasText: rawText }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'true');
    await app.captureStep('Created swipable timeline item', 'The new log is present and its action rail starts hidden.');

    const card = row.locator('.swipe-card');
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box.x + box.width - 16, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 140, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(row.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(async () => row.locator('.swipe-card').evaluate((node) => node.style.transform)).toMatch(/^translate3d\(-/);
    await app.captureStep('Revealed swipe action rail', 'A real desktop mouse drag opened the action rail.');

    await row.getByRole('button', { name: /Delete/ }).click();
    await expect(page.getByRole('heading', { name: 'Delete baby log?' })).toBeVisible();
    await page.locator('#action-dialog-confirm').click();
    await expect(page.locator('#timeline')).not.toContainText(rawText);
    await app.captureStep('Deleted from revealed swipe action', 'The Delete action from the revealed rail removed the log.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('empty and api-error states render without crash', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await app.captureStep('Opened app for error-state flow', 'Preparing to validate empty and fallback states.');

    await page.request.post('/api/dev/clear-tasks');
    await page.goto('/?tab=task');
    await expect(page.locator('#task-list')).toContainText('No tasks for this day.');
    await app.captureStep('Empty task state', 'Task tab shows empty-state message for selected day.');

    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced e2e failure' }),
      });
    });
    await page.goto('/?tab=baby');
    // TODO: once UI has explicit load-error banner, assert that message.
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('#timeline')).toContainText('No logs for this date yet.');
    await app.captureStep('API fallback state', 'Timeline stays stable and renders fallback empty text after API error.');

    app.assertCapturedFailures();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('account settings activate LLM provider only after an API key is saved', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const config = {
      provider: 'mock',
      model: 'mock-local',
      configured: true,
      providers: [
        { id: 'mock', label: 'Mock', defaultModel: 'mock-local', models: ['mock-local'], requiresApiKey: false, configured: true, active: true },
        { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-5.4-mini', models: ['gpt-5.4-mini', 'gpt-5.4'], requiresApiKey: true, configured: false, active: false },
        { id: 'mistral', label: 'Mistral', defaultModel: 'mistral-small-latest', models: ['mistral-small-latest', 'mistral-medium-latest'], requiresApiKey: true, configured: false, active: false },
      ],
    };
    await page.route('**/api/config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await page.route('**/api/llm-config', async (route) => {
      const body = route.request().postDataJSON();
      const provider = body.provider || 'mock';
      config.provider = provider;
      config.model = body.model || (provider === 'openai' ? 'gpt-5.4-mini' : provider === 'mistral' ? 'mistral-small-latest' : 'mock-local');
      config.providers = config.providers.map((item) => ({
        ...item,
        configured: ['openai', 'mistral'].includes(item.id) ? Boolean(body.apiKey) || item.configured : item.configured,
        active: item.id === provider,
      }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await app.loginAsDevAdmin();

    await page.locator('#menu-toggle').click();
    await expect(page.locator('#menu-panel')).toBeVisible();
    await expect(page.locator('#menu-panel #llm-provider-list')).toContainText('OpenAI');
    await expect(page.locator('#menu-panel #llm-provider-list')).toContainText('Mistral');
    const openAiOption = page.locator('#llm-provider-select option[value="openai"]');
    await expect(openAiOption).toHaveAttribute('disabled', '');
    await app.captureStep('Opened LLM provider settings', 'Account menu shows implemented providers and marks OpenAI as unavailable before an API key is saved.');

    const openAiCard = page.locator('#menu-panel .llm-provider-card', { hasText: 'OpenAI' });
    await openAiCard.locator('[data-llm-key]').fill('sk-e2e-placeholder');
    await openAiCard.locator('[data-llm-provider="openai"]').click();

    await expect(page.locator('#llm-provider-status')).toContainText('OpenAI is ready');
    await expect(page.locator('#llm-provider-select')).toHaveValue('openai');
    await expect(openAiOption).not.toHaveAttribute('disabled', '');
    await app.captureStep('Activated OpenAI provider', 'Saving an API key enables OpenAI and makes it the active server-side parser provider.');

    await page.locator('#llm-provider-select').selectOption('mock');
    await page.locator('#llm-provider-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#llm-provider-select')).toHaveValue('mock');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('baby growth records save birth and custom-date history with summary', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await app.captureStep('Opened baby settings for growth scenario', 'Starting on baby tab before saving birth measurements.');

    await page.locator('#open-baby-settings').click();
    await page.locator('#baby-name').fill('Growth E2E Baby');
    await page.locator('#birth-date').fill('2026-01-01');
    await page.locator('#birth-time').fill('20:06');
    await page.locator('#baby-height').fill('52.1');
    await page.locator('#baby-head').fill('34');
    await page.locator('#baby-weight').fill('3600');
    await page.locator('#baby-apgar').fill('99');
    await page.locator('#growth-record-mode').selectOption('birth');
    await page.locator('#baby-settings-form').evaluate((form) => form.requestSubmit());
    await page.locator('#open-baby-summary').click();

    await expect(page.locator('#growth-summary')).toContainText('52.1cm');
    await expect(page.locator('#growth-summary')).toContainText('Apgar 99%');
    await app.captureStep('Saved birth growth record', 'Growth summary displays the at-birth height, head, weight, and Apgar values.');

    await page.locator('#open-baby-settings').click();
    await page.locator('#baby-height').fill('55.2');
    await page.locator('#baby-head').fill('36');
    await page.locator('#baby-weight').fill('4300');
    await page.locator('#growth-record-mode').selectOption('custom');
    await expect(page.locator('#growth-record-date-control')).toBeVisible();
    await expect(page.locator('#growth-record-time-control')).toBeVisible();
    await page.locator('#growth-record-date').fill('2099-03-14');
    await page.locator('#growth-record-time').fill('09:30');
    await page.locator('#baby-settings-form').evaluate((form) => form.requestSubmit());
    await page.locator('#open-baby-summary').click();

    await expect(page.locator('#growth-summary')).toContainText('55.2cm');
    await expect(page.locator('#growth-summary')).toContainText('+3.1cm from baseline');
    await expect(page.locator('#growth-summary')).toContainText('4300g');
    await expect(page.locator('#growth-summary')).toContainText('Specific date');
    await app.captureStep('Saved custom-date growth record', 'Latest custom-date growth record is shown with baseline deltas and history.');

    const growthResponse = await page.request.get('/api/growth');
    expect(growthResponse.ok()).toBeTruthy();
    const growthPayload = await growthResponse.json();
    expect(growthPayload.growthRecords.some((record) => (
      record.occurredDate === '2099-03-14'
      && record.occurredTime === '09:30'
      && record.heightCm === 55.2
      && record.weightG === 4300
    ))).toBeTruthy();

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

});
