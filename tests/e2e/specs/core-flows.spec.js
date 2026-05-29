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

    await row.locator('.swipe-card').evaluate((node) => {
      const makeTouchEvent = (type, x, y, touchListName) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        const touch = {
          identifier: 1,
          target: node,
          pageX: x,
          pageY: y,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
        };
        Object.defineProperties(event, {
          changedTouches: { value: [touch] },
          touches: { value: touchListName === 'touches' ? [touch] : [] },
          targetTouches: { value: touchListName === 'targetTouches' ? [touch] : [] },
        });
        node.dispatchEvent(event);
      };

      makeTouchEvent('touchstart', 320, 120, 'touches');
      makeTouchEvent('touchmove', 170, 122, 'targetTouches');
      makeTouchEvent('touchend', 170, 122, 'changedTouches');
    });

    await expect(row.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(async () => row.locator('.swipe-card').evaluate((node) => node.style.transform)).toMatch(/^translate3d\(-/);
    await app.captureStep('Revealed swipe action rail', 'A synthetic left swipe opened the Swiped-backed action rail.');

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });
    await row.getByRole('button', { name: /Delete/ }).click();
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
      ],
    };
    await page.route('**/api/config', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await page.route('**/api/llm-config', async (route) => {
      const body = route.request().postDataJSON();
      const provider = body.provider || 'mock';
      config.provider = provider;
      config.model = body.model || (provider === 'openai' ? 'gpt-5.4-mini' : 'mock-local');
      config.providers = config.providers.map((item) => ({
        ...item,
        configured: item.id === 'openai' ? Boolean(body.apiKey) || item.configured : item.configured,
        active: item.id === provider,
      }));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(config) });
    });
    await app.loginAsDevAdmin();

    await page.locator('#menu-toggle').click();
    await expect(page.locator('#llm-provider-list')).toContainText('OpenAI');
    const openAiOption = page.locator('#llm-provider-select option[value="openai"]');
    await expect(openAiOption).toHaveAttribute('disabled', '');
    await app.captureStep('Opened LLM provider settings', 'Account menu shows implemented providers and marks OpenAI as unavailable before an API key is saved.');

    const openAiCard = page.locator('.llm-provider-card', { hasText: 'OpenAI' });
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
