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
});
