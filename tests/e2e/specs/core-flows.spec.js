import { test, expect } from '@playwright/test';
import { AppHarness } from '../helpers/app-harness.js';

test.describe('Family Tracker core flows', () => {
  test('first screen renders and top-level navigation works', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await expect(page.locator('#baby-view.active #day-label')).toHaveText('Today');
    await expect(page.locator('#timeline')).toBeVisible();

    await page.locator('#task-tab').click();
    await expect(page.locator('#task-view.active #task-day-label')).toHaveText('Today');
    await expect(page.locator('#task-list')).toBeVisible();

    await page.locator('#baby-tab').click();
    await expect(page.locator('#log-form')).toBeVisible();

    app.assertNoRuntimeErrors();
    await app.attachDiagnostics();
  });

  test('log input submit and CTA flow to task composer works', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await page.locator('#log-input').fill('formula');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();

    await page.locator('#task-tab').click();
    await page.locator('#open-task-composer').click();
    await expect(page.locator('#task-form')).toBeVisible();

    await page.locator('#task-assignee').selectOption({ index: 0 });
    await page.locator('#task-title').fill('E2E task creation');
    await page.locator('#task-due-mode').selectOption('on_date');
    await page.locator('#task-form button[type="submit"]').click();

    await expect(page.locator('#task-list')).toContainText('E2E task creation');

    app.assertNoRuntimeErrors();
    await app.attachDiagnostics();
  });

  test('empty and api-error states render without crash', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();

    await page.request.post('/api/dev/clear-tasks');
    await page.goto('/?tab=task');
    await expect(page.locator('#task-list')).toContainText('No tasks for this day.');

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

    app.assertCapturedFailures();
    await app.attachDiagnostics();
  });
});
