import { test, expect } from '@playwright/test';
import { AppHarness } from '../helpers/app-harness.js';

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

function dayKeyAtOffset(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test.describe('Family Tracker core flows', () => {
  test('initial page access releases startup loading while auth is pending', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let releaseAuth;
    let markAuthBlocked;
    const authBlocked = new Promise((resolve) => {
      markAuthBlocked = resolve;
    });
    await page.route('**/api/auth/me', async (route) => {
      await new Promise((resolve) => {
        releaseAuth = resolve;
        markAuthBlocked();
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: null }),
      });
    });

    const pageLoad = page.goto('/');
    await authBlocked;
    await expect(page.locator('#app-loading')).toBeHidden();
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#app-loading')).toHaveCSS('backdrop-filter', 'none');
    await app.captureStep('Initial loading released', 'The app shell is usable even while auth is still pending.');

    releaseAuth();
    await pageLoad;
    await expect(page.locator('#app-loading')).toBeHidden();
    await expect(page.locator('#app')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#auth-panel')).toBeVisible();
    await app.captureStep('Initial loading completed', 'The loading mark clears when the initial data boundary resolves.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('home dashboard renders and top-level navigation works', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin('/');
    await app.captureStep('Logged in to home dashboard', 'Dev admin login completed and the Home dashboard opened.');

    await expect(page.locator('#home-view.active #home-day-label')).toHaveText(relativeDayHeading('Today'));
    await expect(page.locator('#home-summary-grid .home-card')).toHaveCount(3);
    await expect(page.locator('#home-summary-grid')).toContainText('Baby today');
    await expect(page.locator('#home-summary-grid')).toContainText('Tasks today');
    await expect(page.locator('#home-summary-grid')).toContainText('Meals today');

    await page.locator('#next-home-day').click();
    await expect(page.locator('#home-view.active #home-day-label')).toHaveText(relativeDayHeading('Tomorrow', 1));
    await expect(page).toHaveURL(/day=/);
    await app.captureStep('Changed the Home dashboard day', 'Home date controls moved the shared dashboard context to tomorrow.');

    await page.locator('#baby-tab').click();
    await expect(page.locator('#baby-view.active #day-label')).toHaveText(relativeDayHeading('Tomorrow', 1));
    await expect(page.locator('#timeline')).toBeVisible();
    await app.captureStep('Navigated to baby tab', 'Baby log form and timeline are visible.');

    await page.locator('#task-tab').click();
    await expect(page.locator('#task-view.active #task-day-label')).toHaveText(relativeDayHeading('Tomorrow', 1));
    await expect(page.locator('#task-list')).toBeVisible();
    await app.captureStep('Navigated to task tab', 'Task view rendered with today context and list.');

    await page.locator('#fund-tab').click();
    await expect(page.locator('#fund-view.active #fund-dashboard-frame')).toHaveAttribute('src', 'https://trader-agent.pages.dev/live_dashboard');
    await expect(page.locator('#fund-view.active #fund-dashboard-frame')).toHaveAttribute('data-src', 'https://trader-agent.pages.dev/live_dashboard');
    await expect(page.locator('#fund-view.active .fund-open-link')).toHaveAttribute('href', 'https://trader-agent.pages.dev/live_dashboard');
    await app.captureStep('Navigated to fund tab', 'Fund tab embeds the Trader Agent live dashboard.');

    await page.locator('#brand-home').click();
    await expect(page.locator('#home-view.active #home-summary-grid')).toBeVisible();
    await app.captureStep('Returned to home dashboard from brand', 'The Family Tracker brand returns to the Home dashboard.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('camping tab manages recurring national campground searches', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const availabilityRequests = [];
    let campingQueries = [];
    let campingMonitorSettings = { enabled: false, maxConcurrent: 2, lastStatus: '', lastRunAt: '' };
    await page.route('**/api/camping/national/search**', async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q');
      const campgrounds = query === '94117'
        ? Array.from({ length: 12 }, (_, index) => ({
          id: `near-${index}`,
          name: `Nearby Campground ${index + 1}`,
          location: 'San Francisco, CA',
          rating: 4.1,
          ratingCount: 100 - index,
          campsiteCount: 10,
          distance: 4.2 + index,
        }))
        : [
          { id: '232447', name: 'Upper Pines Campground', location: 'Yosemite National Park, CA', rating: 4.4, ratingCount: 3830, campsiteCount: 235 },
          { id: '232450', name: 'Lower Pines Campground', location: 'Yosemite National Park, CA', rating: 4.1, ratingCount: 1200, campsiteCount: 60 },
        ];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ campgrounds }),
      });
    });
    await page.route('**/api/camping/queries', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queries: campingQueries }) });
        return;
      }
      const body = route.request().postDataJSON();
      campingQueries = body.queries || [];
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queries: campingQueries }) });
    });
    await page.route('**/api/camping/monitor', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: campingMonitorSettings }) });
        return;
      }
      const body = route.request().postDataJSON();
      campingMonitorSettings = { ...campingMonitorSettings, ...(body.settings || {}), lastStatus: 'Saved monitor settings.' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: campingMonitorSettings }) });
    });
    await page.route('**/api/camping/monitor/run', async (route) => {
      const body = route.request().postDataJSON();
      const selectedIds = body.queryId ? [body.queryId] : campingQueries.map((query) => query.id);
      await new Promise((resolve) => setTimeout(resolve, 100));
      campingQueries = campingQueries.map((query) => {
        if (!selectedIds.includes(query.id)) return query;
        const rawMatches = query.campgrounds.flatMap((campground) => {
          const requestBody = {
            campgroundId: campground.id,
            rangeStart: query.rangeStart,
            rangeEnd: query.rangeEnd,
            stayNights: query.stayNights,
            weekendOnly: query.weekendOnly,
          };
          availabilityRequests.push(requestBody);
          const isUpperPines = campground.id === '232447';
          return isUpperPines
            ? [
              ...Array.from({ length: 18 }, (_, index) => {
                const day = String(4 + index).padStart(2, '0');
                const checkout = String(6 + index).padStart(2, '0');
                return { campgroundId: requestBody.campgroundId, campgroundName: campground.name, campsiteId: '100', site: '044', loop: 'Upper Pines', campsiteType: 'STANDARD NONELECTRIC', typeOfUse: 'Overnight', startDate: `2026-09-${day}`, endDate: `2026-09-${checkout}`, nights: [`2026-09-${day}`], checkoutUrl: `https://www.recreation.gov/camping/campsites/100?checkin=09%2F${day}%2F2026&checkout=09%2F${checkout}%2F2026` };
              }),
              { campgroundId: requestBody.campgroundId, campgroundName: campground.name, campsiteId: 'sail', site: 'Sail 1', loop: 'Anchoring', campsiteType: 'SAILING VESSEL', startDate: '2026-09-04', endDate: '2026-09-06', nights: ['2026-09-04'], checkoutUrl: 'https://www.recreation.gov/camping/campgrounds/sail' },
              { campgroundId: requestBody.campgroundId, campgroundName: campground.name, campsiteId: 'group', site: 'Group 1', loop: 'Group', campsiteType: 'GROUP STANDARD NONELECTRIC', startDate: '2026-09-04', endDate: '2026-09-06', nights: ['2026-09-04'], checkoutUrl: 'https://www.recreation.gov/camping/campgrounds/group' },
              { campgroundId: requestBody.campgroundId, campgroundName: campground.name, campsiteId: 'rv', site: 'RV 1', loop: 'RV', campsiteType: 'RV ELECTRIC', startDate: '2026-09-04', endDate: '2026-09-06', nights: ['2026-09-04'], checkoutUrl: 'https://www.recreation.gov/camping/campgrounds/rv' },
              { campgroundId: requestBody.campgroundId, campgroundName: campground.name, campsiteId: 'cabin', site: 'Cabin 1', loop: 'Cabin', campsiteType: 'CABIN ELECTRIC', startDate: '2026-09-04', endDate: '2026-09-06', nights: ['2026-09-04'], checkoutUrl: 'https://www.recreation.gov/camping/campgrounds/cabin' },
            ]
            : [{ campgroundId: requestBody.campgroundId, campgroundName: campground.name, campsiteId: '200', site: '012', loop: 'Lower Pines', campsiteType: 'STANDARD NONELECTRIC', startDate: '2026-09-04', endDate: '2026-09-06', nights: ['2026-09-04', '2026-09-05'], checkoutUrl: 'https://www.recreation.gov/camping/campsites/200?checkin=09%2F04%2F2026&checkout=09%2F06%2F2026' }];
        });
        const matches = rawMatches.filter((match) => !['Sail 1', 'Group 1', 'RV 1', 'Cabin 1'].includes(match.site));
        return { ...query, matches, lastCheckedAt: '2026-07-03T17:00:00.000Z', lastStatus: '19 available after filters (23 total).', progress: '' };
      });
      campingMonitorSettings = { ...campingMonitorSettings, lastRunAt: '2026-07-03T17:00:00.000Z', lastStatus: 'Monitor checked 1 search.' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queries: campingQueries, settings: campingMonitorSettings }),
      });
    });

    await app.loginAsDevAdmin('/camping');
    await expect(page.locator('#camping-view.active')).toBeVisible();
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('familyTracker.campingQueries')).forEach((key) => localStorage.removeItem(key)));
    await page.locator('#camping-query-name').fill('94117');
    await expect(page.locator('#camping-recommendations button')).toHaveCount(12);
    await expect(page.locator('#camping-recommendations button').first()).toContainText('4.2 mi');
    await expect.poll(() => page.locator('#camping-recommendations').evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
    await page.locator('#camping-query-name').fill('Upper');
    await expect(page.locator('#camping-candidates option')).toHaveCount(2);
    await expect(page.locator('#camping-recommendations button')).toHaveCount(2);
    await expect(page.locator('#camping-filter-tent')).toBeChecked();
    await expect(page.locator('#camping-filter-sail')).toBeChecked();
    await expect(page.locator('#camping-filter-group')).toBeChecked();
    await expect(page.locator('#camping-filter-rv')).toBeChecked();
    await expect(page.locator('#camping-recommendations button').first()).toContainText('3,830 ratings');
    await expect(page.locator('#camping-recommendations button').first()).toContainText('235 sites');
    await page.locator('#camping-recommendations button', { hasText: 'Upper Pines Campground' }).click();
    await page.locator('#camping-recommendations button', { hasText: 'Lower Pines Campground' }).click();
    await expect(page.locator('#camping-recommendations button.selected')).toHaveCount(2);
    await expect(page.locator('#camping-auto-confirm')).toBeDisabled();
    await page.locator('#camping-start-date').fill('2026-09-01');
    await expect(page.locator('#camping-end-date')).toHaveAttribute('min', '2026-09-02');
    await page.locator('#camping-end-date').click();
    await expect(page.locator('.flatpickr-calendar.open .flatpickr-day[aria-label="September 1, 2026"]')).toHaveClass(/flatpickr-disabled/);
    await page.keyboard.press('Escape');
    await page.locator('#camping-end-date').fill('2026-11-15');
    await page.locator('#camping-stay-nights').fill('2');
    await page.locator('#camping-check-minutes').fill('1');
    await expect(page.locator('#camping-check-minutes')).toHaveValue('1');
    await page.locator('#camping-check-minutes').fill('2');
    await page.locator('#camping-check-unit').selectOption('hour');
    await page.locator('#camping-weekend-only').check();
    const [saveQueriesResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/camping/queries')),
      page.locator('#camping-save-query').click(),
    ]);
    expect(saveQueriesResponse.ok()).toBeTruthy();
    await saveQueriesResponse.finished();

    await expect(page.locator('#camping-query-list')).toContainText('Upper Pines Campground');
    await expect(page.locator('#camping-query-list')).toContainText('Lower Pines Campground');
    await expect(page.locator('#camping-query-list')).toContainText('2 hr');
    await expect(page.locator('#camping-query-list')).toContainText('Autooff');
    await page.locator('#camping-monitor-enabled').check();
    await page.locator('#camping-monitor-concurrency').fill('3');
    await page.locator('#camping-monitor-save').click();
    await expect(page.locator('#camping-monitor-status')).toContainText('Server monitor on.');
    await expect(page.locator('#camping-monitor-status')).toContainText('Max 3 at once.');
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('familyTracker.campingQueries')).forEach((key) => localStorage.removeItem(key)));
    await page.reload();
    await expect(page.locator('#camping-query-list')).toContainText('Upper Pines Campground');
    await expect(page.locator('#camping-query-list')).toContainText('Lower Pines Campground');
    await expect(page.locator('#camping-monitor-status')).toContainText('Server monitor on.');
    await page.locator('[data-camping-action="run"]').click();
    await expect(page.locator('[data-camping-action="run"]')).toHaveText('Checking');
    await expect(page.locator('#camping-query-list')).toContainText('Checking Upper Pines Campground, Lower Pines Campground');
    await expect(page.locator('#camping-query-list')).toContainText('Server monitor is checking availability');

    await expect.poll(() => availabilityRequests.length).toBe(2);
    expect(availabilityRequests[0]).toMatchObject({
      campgroundId: '232447',
      rangeStart: '2026-09-01',
      rangeEnd: '2026-11-15',
      stayNights: 2,
      weekendOnly: true,
    });
    expect(availabilityRequests[1]).toMatchObject({
      campgroundId: '232450',
      rangeStart: '2026-09-01',
      rangeEnd: '2026-11-15',
      stayNights: 2,
      weekendOnly: true,
    });
    await expect(page.locator('#camping-query-list')).toContainText('Available');
    await expect(page.locator('#camping-query-list')).toContainText('19 available after filters (23 total)');
    await expect(page.locator('#camping-query-list')).toContainText('Site 044');
    await expect(page.locator('#camping-query-list')).toContainText('Site 012');
    await expect(page.locator('#camping-query-list')).not.toContainText('Sail 1');
    await expect(page.locator('#camping-query-list')).not.toContainText('Group 1');
    await expect(page.locator('#camping-query-list')).not.toContainText('RV 1');
    await expect(page.locator('#camping-query-list')).not.toContainText('Cabin 1');
    await expect(page.locator('.camping-match-group')).toHaveCount(2);
    await expect(page.locator('.camping-match-group').first()).toContainText('18 dates');
    await expect.poll(() => page.locator('.camping-match-groups').evaluate((element) => element.scrollHeight > element.clientHeight)).toBeTruthy();
    await expect(page.locator('#camping-query-list a[href*="recreation.gov"]')).toHaveCount(19);
    await expect(page.locator('#camping-query-list a[href*="recreation.gov"]').first()).toHaveAttribute('href', 'https://www.recreation.gov/camping/campsites/100?checkin=09%2F04%2F2026&checkout=09%2F06%2F2026');
    const actionButtonSizes = await page.locator('.camping-query-card').first().locator('.camping-actions button').evaluateAll((buttons) => buttons.map((button) => ({
      width: Math.round(button.getBoundingClientRect().width),
      height: Math.round(button.getBoundingClientRect().height),
    })));
    expect(new Set(actionButtonSizes.map((size) => size.height)).size).toBe(1);
    expect(Math.max(...actionButtonSizes.map((size) => size.width)) - Math.min(...actionButtonSizes.map((size) => size.width))).toBeLessThanOrEqual(12);

    await page.locator('[data-camping-action="edit"]').click();
    await expect(page.locator('#camping-save-query')).toHaveText('Update query');
    await expect(page.locator('#camping-auto-confirm')).toBeDisabled();
    await expect(page.locator('#camping-check-minutes')).toHaveValue('2');
    await expect(page.locator('#camping-check-unit')).toHaveValue('hour');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Delete saved search "Upper Pines Campground, Lower Pines Campground"?');
      await dialog.dismiss();
    });
    await page.locator('[data-camping-action="delete"]').click();
    await expect(page.locator('#camping-query-list')).toContainText('Upper Pines Campground');
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Delete saved search "Upper Pines Campground, Lower Pines Campground"?');
      await dialog.accept();
    });
    const [deleteQueriesResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'PUT' && response.url().includes('/api/camping/queries')),
      page.locator('[data-camping-action="delete"]').click(),
    ]);
    expect(deleteQueriesResponse.ok()).toBeTruthy();
    await deleteQueriesResponse.finished();
    await expect(page.locator('#camping-query-list')).toContainText('No saved searches yet.');
    await app.captureStep('Managed national campsite search', 'Camping tab saved a recurring weekend search, checked availability, and allowed edit/delete.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('camping run action reports invalid saved search instead of getting stuck', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await page.route('**/api/camping/queries', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            queries: [{
              id: 'broken-range',
              name: 'Broken camping range',
              campgrounds: [{ id: '232447', name: 'Upper Pines Campground', location: 'Yosemite National Park, CA' }],
              rangeStart: '2026-09-10',
              rangeEnd: '2026-09-10',
              stayNights: 2,
              checkMinutes: 30,
              filters: {},
              weekendOnly: false,
              autoConfirm: false,
              matches: [],
            }],
          }),
        });
        return;
      }
      const body = JSON.parse(route.request().postData() || '{"queries":[]}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queries: body.queries || [] }),
      });
    });
    await page.route('**/api/camping/monitor', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ settings: { enabled: false, maxConcurrent: 2 } }),
      });
    });
    await page.route('**/api/camping/monitor/run', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'A valid date range is required.' }),
      });
    });
    await app.loginAsDevAdmin('/camping');
    await expect(page.locator('#camping-view.active')).toBeVisible();
    await expect(page.locator('#camping-query-list')).toContainText('Broken camping range');
    await page.locator('[data-camping-action="run"]').click();
    await expect(page.locator('#camping-query-list')).toContainText('A valid date range is required.');
    await expect(page.locator('[data-camping-action="run"]')).toBeEnabled();
  });

  test('camping delete action restores the search when server sync fails', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await page.route('**/api/camping/queries', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            queries: [{
              id: 'delete-sync-fails',
              name: 'Delete sync fails',
              campgrounds: [{ id: '232447', name: 'Upper Pines Campground', location: 'Yosemite National Park, CA' }],
              rangeStart: '2026-09-01',
              rangeEnd: '2026-09-03',
              stayNights: 2,
              checkMinutes: 30,
              filters: {},
              weekendOnly: false,
              autoConfirm: false,
              matches: [],
            }],
          }),
        });
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Sync failed' }),
      });
    });
    await app.loginAsDevAdmin('/camping');
    await expect(page.locator('#camping-query-list')).toContainText('Delete sync fails');
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.locator('[data-camping-action="delete"]').click();
    await expect(page.locator('#camping-query-list')).toContainText('Delete sync fails');
    await expect(page.locator('#camping-status')).toContainText('Could not delete Delete sync fails: Sync failed');
  });

  test('camping saved searches do not auto-run unless auto reservation is enabled', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await page.addInitScript(() => {
      window.__familyTrackerIntervals = [];
      const originalSetInterval = window.setInterval;
      window.setInterval = (callback, delay, ...args) => {
        window.__familyTrackerIntervals.push({ source: String(callback), delay });
        return originalSetInterval(callback, delay, ...args);
      };
    });
    await page.route('**/api/camping/queries', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            queries: [{
              id: 'manual-only-camping',
              name: 'Manual only camping',
              campgrounds: [{ id: '232447', name: 'Upper Pines Campground', location: 'Yosemite National Park, CA' }],
              rangeStart: '2026-09-01',
              rangeEnd: '2026-09-03',
              stayNights: 2,
              checkMinutes: 1,
              filters: {},
              weekendOnly: false,
              autoConfirm: false,
              matches: [],
            }],
          }),
        });
        return;
      }
      await route.fallback();
    });
    await app.loginAsDevAdmin('/camping');
    await expect(page.locator('#camping-query-list')).toContainText('Manual only camping');
    const campingIntervals = await page.evaluate(() => window.__familyTrackerIntervals.filter((item) => item.source.includes('runCampingQuery')));
    expect(campingIntervals).toEqual([]);
  });

  test('travel tab aggregates flight lookup and saves a deal watch', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let searchRequest = null;
    await page.route('**/api/travel/search', async (route) => {
      searchRequest = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          sources: [
            { id: 'amadeus', name: 'Amadeus', status: 'ready', coverage: 'Flight fares and cached deal dates' },
            { id: 'aviationstack', name: 'Aviationstack', status: 'missing_key', coverage: 'Flight status and schedule lookup' },
          ],
          results: [
            { id: 'fare-1', source: 'Amadeus', kind: 'fare', title: 'SFO to ICN', price: 721, currency: 'USD', airline: 'United Airlines', departureAt: '2026-10-10T11:00:00', arrivalAt: '2026-10-11T16:00:00', detail: '1 segment', bookingUrl: 'https://www.google.com/travel/flights/search?q=SFO%20ICN' },
            { id: 'status-1', source: 'Aviationstack', kind: 'status', title: 'UA893', price: null, currency: '', airline: 'United Airlines', departureAt: '2026-10-10T11:00:00', arrivalAt: '2026-10-11T16:00:00', detail: 'scheduled' },
          ],
        }),
      });
    });

    await app.loginAsDevAdmin('/travel');
    await expect(page.locator('#travel-view.active')).toBeVisible();
    await page.evaluate(() => localStorage.removeItem('familyTracker.travelWatches'));
    await page.locator('#travel-origin').fill('S');
    await expect(page.locator('#travel-recommendations')).toContainText('SFO to ICN');
    await page.locator('#travel-recommendations button', { hasText: 'SFO to ICN' }).click();
    await page.locator('#travel-departure-date').fill('2026-10-10');
    await page.locator('#travel-max-price').fill('800');
    await page.locator('#travel-search').click();

    await expect(page.locator('#travel-status')).toHaveText('2 results.');
    await expect(page.locator('#travel-results')).toContainText('SFO to ICN');
    await expect(page.locator('#travel-results')).toContainText('UA893');
    await expect(page.locator('#travel-results a[href*="google.com/travel/flights/search"]')).toHaveCount(1);
    await expect(page.locator('#travel-history')).toContainText('SFO to ICN');
    await expect(page.locator('#travel-sources')).toContainText('Amadeus: ready');
    await page.locator('#travel-save-watch').click();
    await expect(page.locator('#travel-watch-list')).toContainText('SFO to ICN');
    expect(searchRequest).toMatchObject({ origin: 'SFO', destination: 'ICN', departureDate: '2026-10-10', maxPrice: '800' });
    await app.captureStep('Searched travel and saved deal watch', 'Travel tab merged fare/status results and saved a browser-local fare watch.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('baby settings save milk reminder notification preferences', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let savedNotificationSettings = null;
    await page.route('**/api/notification-settings', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        savedNotificationSettings = body.settings;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            settings: body.settings,
            pushConfigured: true,
            subscribed: false,
            job: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          settings: { milkReminderEnabled: false, milkReminderOffsetMinutes: 30 },
          pushConfigured: true,
          subscribed: false,
        }),
      });
    });

    await app.loginAsDevAdmin('/baby');
    await page.locator('#open-baby-settings').click();
    await expect(page.locator('#baby-settings-panel')).toBeVisible();
    await expect(page.locator('#milk-reminder-enabled')).toBeVisible();

    await page.locator('#milk-reminder-enabled').check();
    await page.locator('#milk-reminder-offset').selectOption('45');
    await page.locator('#baby-settings-form button[type="submit"]').click();

    await expect.poll(() => savedNotificationSettings).toEqual({
      milkReminderEnabled: true,
      milkReminderOffsetMinutes: 45,
    });
    await app.captureStep('Saved milk reminder preferences', 'Baby settings persisted the reminder toggle and lead time.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby tab supports pull-to-refresh for user-requested updates', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let todayRequests = 0;
    await page.route('**/api/sync/state**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ modules: { baby: { version: 'baby-v1' }, task: { version: 'task-v1' }, profile: { version: 'profile-v1' } } }) });
    });
    await page.route('**/api/profile', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { babyName: 'Ari' }, growthRecords: [] }) });
    });
    await page.route('**/api/logs/today**', async (route) => {
      todayRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], summary: {}, context: {} }) });
    });
    await page.route('**/api/action-logs**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ logs: [] }) });
    });
    await page.route('**/api/task-assignees', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assignees: [] }) });
    });
    await page.route('**/api/tasks/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks: [], days: {} }) });
    });
    await page.route('**/api/events/summary**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: null }) });
    });

    await app.loginAsDevAdmin('/baby');
    const initialTodayRequests = todayRequests;
    await page.evaluate(() => {
      const dispatchTouch = (type, clientY, target = document, ended = false) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { configurable: true, value: ended ? [] : [{ clientY }] });
        target.dispatchEvent(event);
      };
      window.scrollTo(0, 0);
      dispatchTouch('touchstart', 0, document.querySelector('#baby-view'));
      dispatchTouch('touchmove', 180);
    });
    await expect(page.locator('#pull-refresh-label')).toHaveText('Release to refresh');
    await page.evaluate(() => {
      const event = new Event('touchend', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'touches', { configurable: true, value: [] });
      document.dispatchEvent(event);
    });
    await expect.poll(() => todayRequests).toBeGreaterThan(initialTodayRequests);
    await expect(page.locator('#pull-refresh')).toHaveClass(/visible/);
    await app.captureStep('Pulled baby view to refresh', 'Pulling down from the top explicitly triggered a current-tab refresh without relying on automatic polling.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('home baby timeline clusters crowded logs into one marker', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            { id: 'milk-1', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-06-01T10:00:00.000Z' }, amountMl: { value: 120 } },
            { id: 'diaper-1', type: 'diaper', rawText: 'pee', occurredAt: { value: '2026-06-01T10:12:00.000Z' }, diaperKind: { value: 'wet' } },
            { id: 'sleep-1', type: 'sleep', rawText: 'nap', startAt: { value: '2026-06-01T10:31:00.000Z' }, endAt: { value: '2026-06-01T10:42:00.000Z' }, durationMinutes: { value: 11 } },
            { id: 'milk-2', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-06-01T13:00:00.000Z' }, amountMl: { value: 90 } },
          ],
          summary: {},
        }),
      });
    });

    await app.loginAsDevAdmin('/');
    const babyCard = page.locator('.home-card-baby');
    await expect(babyCard.locator('.home-marker')).toHaveCount(2);
    await expect(babyCard.locator('.baby-cluster-marker .home-cluster-icon')).toHaveCount(3);

    await babyCard.locator('.baby-cluster-marker').click();
    await expect(babyCard.locator('.baby-cluster-marker')).toHaveAttribute('aria-expanded', 'true');
    await expect(babyCard.locator('.baby-cluster-marker .home-tooltip')).toContainText('3 logs near');
    await expect(babyCard.locator('.baby-cluster-marker .home-tooltip')).toContainText('Formula');
    await app.captureStep('Opened clustered baby timeline marker', 'Crowded baby logs are represented as one small icon collection with a combined tooltip.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('home dashboard stays within one screen on Apple-sized viewports', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const viewports = [
      { name: 'iphone-se', width: 375, height: 667 },
      { name: 'iphone-pro', width: 393, height: 852 },
      { name: 'iphone-max', width: 430, height: 932 },
      { name: 'ipad-mini', width: 744, height: 1133 },
      { name: 'ipad-pro-11', width: 834, height: 1194 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await app.loginAsDevAdmin('/');
      await expect(page.locator('#home-view.active #home-summary-grid .home-card')).toHaveCount(3);

      const metrics = await page.evaluate(() => ({
        documentScrollHeight: document.documentElement.scrollHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        homeHeight: document.querySelector('#home-view')?.getBoundingClientRect().height ?? 0,
        homeBottom: document.querySelector('#home-view')?.getBoundingClientRect().bottom ?? 0,
        headingRight: document.querySelector('#home-day-label')?.getBoundingClientRect().right ?? 0,
      }));

      expect(metrics.documentScrollWidth, `${viewport.name} should not create horizontal page overflow`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.headingRight, `${viewport.name} day heading should fit within viewport`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(metrics.documentScrollHeight, `${viewport.name} should not create page scroll`).toBeLessThanOrEqual(metrics.viewportHeight + 1);
      expect(metrics.homeHeight, `${viewport.name} home view should fit viewport below nav`).toBeLessThanOrEqual(metrics.viewportHeight - 44 + 1);
      expect(metrics.homeBottom, `${viewport.name} home view should end within the visible page`).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    }

    app.assertNoRuntimeErrors();
    await app.attachDiagnostics();
  });

  test('date heading footprint stays stable when days change', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const viewports = [
      { name: 'iphone-se', width: 375, height: 667 },
      { name: 'iphone-max', width: 430, height: 932 },
      { name: 'desktop', width: 1280, height: 900 },
    ];

    const readFootprint = async () => page.evaluate(() => {
      const heading = document.querySelector('#home-view.active .date-heading')?.getBoundingClientRect();
      const label = document.querySelector('#home-view.active .date-picker-label')?.getBoundingClientRect();
      const next = document.querySelector('#next-home-day')?.getBoundingClientRect();
      return {
        headingHeight: heading?.height ?? 0,
        headingWidth: heading?.width ?? 0,
        labelHeight: label?.height ?? 0,
        labelWidth: label?.width ?? 0,
        nextOffset: heading && next ? next.left - heading.left : 0,
      };
    });

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await app.loginAsDevAdmin('/');
      await expect(page.locator('#home-view.active #home-day-label')).toHaveText(dayHeadingAtOffset(0));
      const today = await readFootprint();

      await page.locator('#next-home-day').click();
      await expect(page.locator('#home-view.active #home-day-label')).toHaveText(dayHeadingAtOffset(1));
      const tomorrow = await readFootprint();

      await page.locator('#next-home-day').click();
      await expect(page.locator('#home-view.active #home-day-label')).toHaveText(dayHeadingAtOffset(2));
      const future = await readFootprint();

      for (const metric of ['headingHeight', 'headingWidth', 'labelHeight', 'labelWidth', 'nextOffset']) {
        expect(tomorrow[metric], `${viewport.name} ${metric} should stay stable for relative dates`).toBeCloseTo(today[metric], 0);
        expect(future[metric], `${viewport.name} ${metric} should stay stable for non-relative dates`).toBeCloseTo(today[metric], 0);
      }
    }

    app.assertNoRuntimeErrors();
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
    await page.locator('#open-baby-summary').click();
    await expect(page.locator('#feeding-guidance')).toContainText('Feeding progress');
    await expect(page.locator('#feeding-guidance')).toContainText('Progress at a glance');
    await expect(page.locator('#feeding-guidance .feeding-progress-row summary')).toContainText(['Day elapsed', 'Milk pace']);
    await page.locator('#feeding-guidance .feeding-progress-row', { hasText: 'Milk pace' }).locator('summary').click();
    await expect(page.locator('#feeding-guidance .feeding-progress-row', { hasText: 'Milk pace' })).toContainText('logged so far');
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

    await page.locator('#log-input').fill('formula 120');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();
    await app.captureStep('Saved baby log', 'Timeline updated with newly saved item.');

    await page.locator('#task-tab').click();
    await page.locator('#open-task-composer').click();
    await expect(page.locator('#task-form')).toBeVisible();
    await expect(page.locator('#task-assignee option')).toHaveText(['Mom', 'Dad', 'Family']);
    await app.captureStep('Opened task composer', 'Task creation form is visible.');

    await page.locator('#task-assignee').selectOption({ index: 0 });
    await page.locator('#task-title').fill('E2E task creation');
    await page.locator('#task-due-mode').selectOption('on_date');
    await page.locator('#task-form button[type="submit"]').click();

    await expect(page.locator('#task-list')).toContainText('E2E task creation');
    await app.captureStep('Created task successfully', 'Task list shows the newly created task title.');

    const taskRow = page.locator('#task-list .task-swipe', { hasText: 'E2E task creation' }).first();
    await expect(taskRow).toBeVisible();
    await taskRow.locator('.swipe-card').hover();
    await page.mouse.wheel(220, 0);
    await expect(taskRow.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'false');
    await taskRow.getByRole('button', { name: /Edit/ }).click();
    await expect(page.locator('#task-form')).toBeVisible();
    await expect(page.locator('#task-title')).toHaveValue('E2E task creation');
    await expect(page.locator('#task-form button[type="submit"]')).toHaveText('Save');

    await page.locator('#task-title').fill('E2E task edited');
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/tasks/') && response.request().method() === 'PATCH'),
      page.locator('#task-form button[type="submit"]').click(),
    ]);
    await expect(page.locator('#task-list')).toContainText('E2E task edited');
    await expect(page.locator('#task-list')).not.toContainText('E2E task creation');
    await app.captureStep('Edited task successfully', 'The task edit action reuses the composer and updates the list after Save.');

    const editedRow = page.locator('#task-list .task-swipe', { hasText: 'E2E task edited' }).first();
    await editedRow.getByRole('checkbox', { name: /Complete E2E task edited/ }).check();
    await expect(page.locator('.completed-task-section')).toContainText('E2E task edited');
    const completedRow = page.locator('.completed-task-section .task-swipe', { hasText: 'E2E task edited' }).first();
    await expect(completedRow.getByRole('checkbox')).toBeChecked();

    await completedRow.getByRole('checkbox', { name: /Reopen E2E task edited/ }).uncheck();
    await expect(page.locator('#task-list .task-swipe', { hasText: 'E2E task edited' }).first().getByRole('checkbox')).not.toBeChecked();
    await app.captureStep('Reopened task successfully', 'A completed task can be reopened from the completed section and remains visible as an open task.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });



  test('baby moments flow saves media for gallery browsing without timeline thumbnails', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin('/baby');
    await app.captureStep('Opened baby tracker for moments', 'Starting from the Baby tracker before adding a growth moment.');

    const title = `First outing media ${Date.now()}`;
    await page.locator('#quick-add-moment').click();
    await expect(page.locator('#baby-moment-panel')).toBeVisible();
    await page.locator('#moment-title').fill(title);
    await page.locator('#moment-note').fill('Stroller walk around the neighborhood');
    await page.locator('#moment-file-input').setInputFiles({
      name: 'first-outing.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZElEQVR4nO3PQQ0AIBDAMMC/5+ONAvZoFSzZnplzzwO8G04EjAgYETAiYETACIGJgBECIwJGBAwJGBEwImBEwIiAEQEjAkYEjAgYETAiYETACIGJgBECIwJGBAwJGBEwImCEFy09AYNXbEXuAAAAAElFTkSuQmCC', 'base64'),
    });
    await expect(page.locator('#moment-preview-strip .moment-preview-card img')).toBeVisible();
    await app.captureStep('Prepared moment media thumbnail', 'The selected photo appears as a local thumbnail before saving.');

    await page.locator('#moment-form button[type="submit"]').click();
    await expect(page.locator('#timeline')).toContainText(title);
    await expect(page.locator('#timeline .moment-media-grid img')).toHaveCount(0);
    await page.locator('#timeline-filter').selectOption('milestone');
    await expect(page.locator('#event-count')).toContainText('of');
    await expect(page.locator('#timeline')).toContainText(title);
    await page.locator('#timeline .timeline-swipe', { hasText: title }).first().locator('.timeline-detail-button').click();
    await expect(page.locator('#timeline .timeline-swipe', { hasText: title }).first().locator('.timeline-detail-popover')).toContainText('Stroller walk around the neighborhood');
    await page.locator('#open-baby-moments').click();
    await expect(page.locator('#baby-moment-gallery')).toBeVisible();
    await expect(page.locator('#baby-moment-gallery')).toContainText(title);
    await expect(page.locator('#baby-moment-gallery img').first()).toBeVisible();
    await app.captureStep('Saved moment to gallery and timeline log', 'The growth moment is saved as a lightweight timeline log, with media reserved for the Moments gallery.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });



  test('runtime config exposes media storage status without R2 secrets', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin('/baby');

    const response = await page.request.get('/api/config');
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    expect(payload.mediaStorage).toMatchObject({
      provider: 'local',
      configured: true,
      publicBaseUrlConfigured: false,
      maxImageBytes: 10485760,
      maxVideoBytes: 104857600,
    });
    expect(JSON.stringify(payload)).not.toContain('R2_SECRET_ACCESS_KEY');
    expect(JSON.stringify(payload)).not.toContain('R2_ACCESS_KEY_ID');
    expect(JSON.stringify(payload)).not.toContain('R2_ACCOUNT_ID');
    await app.captureStep('Verified safe media runtime config', 'The deployed runtime config endpoint returns media storage status without exposing R2 credentials.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('baby moments menu supports presets, reset, no-media save, and action log reflection', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin('/baby');
    const title = `첫 이유식 ${Date.now()}`;

    await page.locator('#open-baby-moments').click();
    await expect(page.locator('#baby-moment-gallery')).toBeVisible();
    await expect(page.locator('#baby-moment-panel')).toContainText('Growth moments');
    await page.locator('[data-open-moment-form]').click();
    await expect(page.locator('#moment-form')).toBeVisible();
    await page.locator('[data-moment-title="First solids"]').click();
    await expect(page.locator('#moment-title')).toHaveValue('First solids');
    await page.locator('#moment-reset').click();
    await expect(page.locator('#moment-title')).toHaveValue('');
    await expect(page.locator('#moment-is-first')).toBeChecked();
    await app.captureStep('Opened and reset moment form', 'The Moments menu opens a browsing gallery first, then its Add button reveals the form; preset chips populate the title, and Reset clears it while keeping first-moment default.');

    await page.locator('#moment-title').fill(title);
    await page.locator('#moment-note').fill('사진 없이 먼저 저장해도 타임라인에 남아야 해');
    await page.locator('#moment-form button[type="submit"]').click();
    await expect(page.locator('#timeline')).toContainText(title);
    await page.locator('#timeline-filter').selectOption('milestone');
    await expect(page.locator('#timeline')).toContainText(title);
    const savedMomentRow = page.locator('#timeline .timeline-swipe', { hasText: title }).first();
    await expect(savedMomentRow.locator('.moment-media-grid')).toHaveCount(0);

    await page.locator('#open-baby-action-log').click();
    await expect(page.locator('#baby-action-log-panel')).toBeVisible();
    await expect(page.locator('#baby-action-log')).toContainText(`added growth moment "${title}"`);
    await app.captureStep('Saved no-media moment and verified action log', 'A text-only growth moment appears under the Moments filter and records an action-log entry.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('baby records and task changes appear in action logs', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    const recordText = 'action log formula 120 ml at 4:00 pm';

    await page.locator('#log-input').fill(recordText);
    await page.locator('#log-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#answer')).toContainText('log saved');
    await expect(page.locator('#timeline')).toContainText(recordText);
    await page.locator('#open-baby-action-log').click();
    await expect(page.locator('#baby-action-log-panel')).toBeVisible();
    await expect(page.locator('#baby-action-log')).toContainText(`added baby record "${recordText}"`);
    await page.locator('#baby-action-log').getByRole('button', { name: 'Undo' }).first().click();
    await expect(page.getByRole('heading', { name: 'Undo this action?' })).toBeVisible();
    await confirmUndoAndWaitForRefresh(page, 'baby');
    await expect(page.locator('#timeline')).not.toContainText(recordText);
    await expect(page.locator('#baby-action-log')).toContainText(`undid added baby record "${recordText}"`);
    await app.captureStep('Baby action log records and undoes add transaction', 'The baby action log records the new record separately and Undo removes it from the timeline.');

    await page.locator('#task-tab').click();
    await page.locator('#open-task-composer').click();
    await page.locator('#task-assignee').selectOption({ index: 0 });
    const taskTitle = `Action log task ${Math.random().toString(36).slice(2, 8)}`;
    await page.locator('#task-title').fill(taskTitle);
    await page.locator('#task-form button[type="submit"]').click();
    await expect(page.locator('#task-list')).toContainText(taskTitle);
    await page.locator('#open-task-action-log').click();
    await expect(page.locator('#task-action-log-panel')).toBeVisible();
    await expect(page.locator('#task-action-log')).toContainText(`added task "${taskTitle}"`);
    await page.locator('#task-action-log').getByRole('button', { name: 'Undo' }).first().click();
    await expect(page.getByRole('heading', { name: 'Undo this action?' })).toBeVisible();
    await confirmUndoAndWaitForRefresh(page, 'task');
    await expect(page.locator('#task-list')).not.toContainText(taskTitle);
    await expect(page.locator('#task-action-log')).toContainText(`undid added task "${taskTitle}"`);
    await app.captureStep('Task action log records and undoes add transaction', 'Task create appears in the action log, and Undo removes the newly added task.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby action log undo restores add, edit, and delete transactions', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await page.waitForLoadState('networkidle');
    const suffix = Date.now();

    const addText = `undo baby add formula ${suffix}`;
    await createBabyRecord(page, addText);
    await gotoAndSettle(page, '/baby');
    await expect(page.locator('#timeline')).toContainText(addText);
    await undoBabyAction(page, `added baby record "${addText}"`);
    await expect(page.locator('#timeline')).not.toContainText(addText);
    await expect(page.locator('#baby-action-log')).toContainText(`undid added baby record "${addText}"`);
    await app.captureStep('Undid baby record add', 'Undoing an add transaction removes the baby record from the timeline.');

    const originalText = `undo baby edit original ${suffix}`;
    const editedText = `undo baby edit updated ${suffix}`;
    const editable = await createBabyRecord(page, originalText);
    await patchBabyRecord(page, editable.rawLog.id, editedText);
    await gotoAndSettle(page, '/baby');
    await expect(page.locator('#timeline')).toContainText(editedText);
    await undoBabyAction(page, `edited baby record "${editedText}"`);
    await expect(page.locator('#timeline')).toContainText(originalText);
    await expect(page.locator('#timeline')).not.toContainText(editedText);
    await app.captureStep('Undid baby record edit', 'Undoing an edit restores the original baby record text.');

    const deletedText = `undo baby delete formula ${suffix}`;
    const deleted = await createBabyRecord(page, deletedText);
    await deleteBabyRecord(page, deleted.rawLog.id);
    await gotoAndSettle(page, '/baby');
    await expect(page.locator('#timeline')).not.toContainText(deletedText);
    await undoBabyAction(page, `deleted baby record "${deletedText}"`);
    await expect(page.locator('#timeline')).toContainText(deletedText);
    await app.captureStep('Undid baby record delete', 'Undoing a delete restores the baby record to the timeline.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('task action log undo restores add, edit, complete, and reopen transactions', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await page.waitForLoadState('networkidle');
    const suffix = Date.now();
    const selectedDay = await page.locator('#day-picker').inputValue();

    const addTitle = `Undo task add ${suffix}`;
    await createTaskViaApi(page, addTitle, selectedDay);
    await gotoAndSettle(page, '/tasks');
    await expect(page.locator('#task-list')).toContainText(addTitle);
    await undoTaskAction(page, `added task "${addTitle}"`);
    await expect(page.locator('#task-list')).not.toContainText(addTitle);
    await expect(page.locator('#task-action-log')).toContainText(`undid added task "${addTitle}"`);
    await app.captureStep('Undid task add', 'Undoing a task add removes the task from the task list.');

    const originalTitle = `Undo task edit original ${suffix}`;
    const editedTitle = `Undo task edit updated ${suffix}`;
    const editable = await createTaskViaApi(page, originalTitle, selectedDay);
    await patchTaskViaApi(page, editable.id, { title: editedTitle });
    await gotoAndSettle(page, '/tasks');
    await expect(page.locator('#task-list')).toContainText(editedTitle);
    await undoTaskAction(page, `edited task "${editedTitle}"`);
    await expect(page.locator('#task-list')).toContainText(originalTitle);
    await expect(page.locator('#task-list')).not.toContainText(editedTitle);
    await app.captureStep('Undid task edit', 'Undoing a task edit restores the original task title.');

    const completeTitle = `Undo task complete ${suffix}`;
    const completable = await createTaskViaApi(page, completeTitle, selectedDay);
    await patchTaskViaApi(page, completable.id, { status: 'done' });
    await gotoAndSettle(page, '/tasks');
    await expect(page.locator('.task-item', { hasText: completeTitle }).first().getByRole('checkbox')).toBeChecked();
    await undoTaskAction(page, `completed task "${completeTitle}"`);
    await expect(page.locator('.task-item', { hasText: completeTitle }).first().getByRole('checkbox')).not.toBeChecked();
    await app.captureStep('Undid task complete', 'Undoing a complete transaction reopens the task.');

    const reopenTitle = `Undo task reopen ${suffix}`;
    const reopenable = await createTaskViaApi(page, reopenTitle, selectedDay);
    await patchTaskViaApi(page, reopenable.id, { status: 'done' });
    await patchTaskViaApi(page, reopenable.id, { status: 'open' });
    await gotoAndSettle(page, '/tasks');
    await expect(page.locator('.task-item', { hasText: reopenTitle }).first().getByRole('checkbox')).not.toBeChecked();
    await undoTaskAction(page, `reopened task "${reopenTitle}"`);
    await expect(page.locator('.task-item', { hasText: reopenTitle }).first().getByRole('checkbox')).toBeChecked();
    await app.captureStep('Undid task reopen', 'Undoing a reopen transaction restores the task to completed state.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('completed task can be reopened even when its due date is not today', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin('/tasks');
    const title = `Reopen completed off-day task ${Date.now()}`;
    const dueDate = dayKeyAtOffset(-1);
    const task = await createTaskViaApi(page, title, dueDate);
    await patchTaskViaApi(page, task.id, { status: 'done', completedAt: `${dayKeyAtOffset(0)}T12:00:00.000Z` });
    await gotoAndSettle(page, '/tasks');

    const completedRow = page.locator('.completed-task-section .task-swipe', { hasText: title }).first();
    await expect(completedRow).toBeVisible();
    await expect(completedRow.getByRole('checkbox', { name: new RegExp(`Reopen ${title}`) })).toBeChecked();
    await completedRow.getByRole('checkbox', { name: new RegExp(`Reopen ${title}`) }).uncheck();

    await expect(page.locator('#task-day-picker')).toHaveValue(dueDate);
    const reopenedRow = page.locator('#task-list .task-swipe', { hasText: title }).first();
    await expect(reopenedRow.getByRole('checkbox', { name: new RegExp(`Complete ${title}`) })).not.toBeChecked();
    await app.captureStep('Reopened off-day completed task', 'Reopening a completed task that was only visible from its completion date moves the task view to its due day so the reopened item remains visible.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });

  test('open and completed tasks stay grouped under one assignee column', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin('/tasks');
    const assigneesResponse = await page.request.get('/api/task-assignees');
    expect(assigneesResponse.ok()).toBeTruthy();
    const { assignees } = await assigneesResponse.json();
    const dad = assignees.find((item) => item.name === 'Dad') || assignees[0];
    const selectedDay = await page.locator('#task-day-picker').inputValue();
    const suffix = Date.now();
    const openTitle = `Dad grouped open ${suffix}`;
    const doneTitle = `Dad grouped done ${suffix}`;

    await createTaskViaApi(page, openTitle, selectedDay, { assigneeId: dad.id });
    const completed = await createTaskViaApi(page, doneTitle, selectedDay, { assigneeId: dad.id });
    await patchTaskViaApi(page, completed.id, { status: 'done' });
    await gotoAndSettle(page, `/tasks?day=${selectedDay}`);

    const dadColumns = page.locator('.task-column').filter({ has: page.locator('.task-column-header', { hasText: dad.name }) });
    await expect(dadColumns).toHaveCount(1);
    await expect(dadColumns.first()).toContainText(openTitle);
    await expect(dadColumns.first()).toContainText(doneTitle);
    await expect(dadColumns.first().locator('.completed-task-section')).toContainText('Completed');
    await app.captureStep('Grouped Dad tasks in one column', 'Open and completed Dad tasks render in one assignee column instead of duplicated Dad blocks.');

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
    await app.loginAsDevAdmin('/');

    await expect(page.locator('#home-summary-grid .home-marker').first()).toBeVisible();
    await page.locator('#home-summary-grid .home-marker').first().click();
    await expect(page.locator('#home-summary-grid .home-marker').first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#home-summary-grid .home-tooltip').first()).toContainText('Formula');
    await app.captureStep('Opened dashboard detail tooltip', 'Clicking a Home dashboard item opens a visible detail tooltip instead of relying on the browser title.');

    await page.locator('#baby-tab').click();
    await expect(page.locator('#timeline-sort')).toHaveValue('desc');
    await expect(page.locator('#timeline .raw-text')).toHaveText(['wet diaper', 'nap', 'formula']);
    await expect(page.locator('#timeline .timeline-title')).toHaveText(['Diaper (pee)', 'Sleep', 'Formula']);
    await expect(page.locator('#timeline .swipe-affordance')).toHaveCount(0);
    await page.locator('#timeline .timeline-detail-button').first().click();
    await expect(page.locator('#timeline .timeline-detail-popover').first()).toContainText('Original text');
    await expect(page.locator('#summary .summary-item span')).toHaveText(['Sleep', 'Milk', 'Baby food', 'Diaper']);
    await app.captureStep('Timeline sorted newest first by default', 'The default timeline order shows newest baby records first.');

    await page.locator('#timeline-sort').selectOption('asc');
    await expect(page.locator('#timeline .raw-text')).toHaveText(['formula', 'nap', 'wet diaper']);
    await expect(page.locator('#timeline .timeline-title')).toHaveText(['Formula', 'Sleep', 'Diaper (pee)']);
    await app.captureStep('Timeline sorted oldest first', 'The sort control can show visible logs from earliest to latest.');

    await page.locator('#timeline-filter').selectOption('sleep');
    await expect(page.locator('#timeline .raw-text')).toHaveText(['nap']);
    await expect(page.locator('#event-count')).toHaveText('1 of 3 items');
    await app.captureStep('Timeline filtered to sleep', 'The filter control limits visible timeline items to sleep logs.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby care forecast replaces AI checks with next milk and diaper detail', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const eventsByDay = {
      '2026-05-28': [
        { id: 'forecast-milk-1', type: 'feeding_milk', rawText: 'formula 90', occurredAt: { value: '2026-05-28T00:00:00.000Z' }, amountMl: { value: 90 }, createdAt: '2026-05-28T00:01:00.000Z' },
        { id: 'forecast-diaper-1', type: 'diaper', rawText: 'pee diaper', occurredAt: { value: '2026-05-28T01:00:00.000Z' }, diaperKind: { value: 'wet' }, createdAt: '2026-05-28T01:01:00.000Z' },
      ],
      '2026-05-29': [
        { id: 'forecast-milk-2', type: 'feeding_milk', rawText: 'formula 110', occurredAt: { value: '2026-05-29T03:00:00.000Z' }, amountMl: { value: 110 }, createdAt: '2026-05-29T03:01:00.000Z' },
        { id: 'forecast-diaper-2', type: 'diaper', rawText: 'poop diaper', occurredAt: { value: '2026-05-29T03:00:00.000Z' }, diaperKind: { value: 'dirty' }, createdAt: '2026-05-29T03:01:00.000Z' },
      ],
      '2026-05-30': [
        { id: 'forecast-milk-3', type: 'feeding_milk', rawText: 'formula 130', occurredAt: { value: '2026-05-30T06:00:00.000Z' }, amountMl: { value: 130 }, createdAt: '2026-05-30T06:01:00.000Z' },
        { id: 'forecast-milk-4', type: 'feeding_milk', rawText: 'formula 150', occurredAt: { value: '2026-05-30T09:00:00.000Z' }, amountMl: { value: 150 }, createdAt: '2026-05-30T09:01:00.000Z' },
        { id: 'forecast-diaper-3', type: 'diaper', rawText: 'pee diaper', occurredAt: { value: '2026-05-30T06:00:00.000Z' }, diaperKind: { value: 'wet' }, createdAt: '2026-05-30T06:01:00.000Z' },
        { id: 'forecast-diaper-4', type: 'diaper', rawText: 'mixed diaper', occurredAt: { value: '2026-05-30T09:00:00.000Z' }, diaperKind: { value: 'mixed' }, createdAt: '2026-05-30T09:01:00.000Z' },
        { id: 'forecast-nap', type: 'sleep', rawText: 'nap', startAt: { value: '2026-05-30T10:00:00.000Z' }, endAt: { value: '2026-05-30T10:45:00.000Z' }, durationMinutes: { value: 45 }, createdAt: '2026-05-30T10:00:00.000Z' },
      ],
    };

    await page.route('**/api/logs/today**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const day = requestUrl.searchParams.get('day') || '2026-05-30';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: eventsByDay[day] || [], summary: {}, context: null }),
      });
    });

    const loginResponse = await page.request.post('/api/auth/dev', { data: { id: 'admin-test' } });
    expect(loginResponse.ok()).toBeTruthy();
    await page.goto('/baby?day=2026-05-30');

    await page.locator('#open-baby-summary').click();
    await expect(page.locator('#today-context')).toContainText('Last milk');
    await expect(page.locator('#today-context')).toContainText('Last diaper');
    await expect(page.locator('#today-context')).toContainText('Sleep');
    await expect(page.locator('#today-context')).not.toContainText('AI checks');
    await expect(page.locator('#care-forecast')).toContainText('Care forecast');
    await expect(page.locator('#care-forecast')).toContainText('Next milk');
    await expect(page.locator('#care-forecast')).toContainText('Estimated amount');
    await expect(page.locator('#care-forecast')).toContainText('Next diaper');

    await page.locator('#care-forecast .care-forecast-card').first().click();
    await expect(page.locator('#care-forecast .care-forecast-detail').first()).toContainText('Median interval');
    await expect(page.locator('#care-forecast .care-forecast-detail').first()).toContainText('Last 7 days');
    await expect(page.locator('#care-forecast .care-forecast-explainer').first()).toContainText('How this estimate was made');
    await expect(page.locator('#care-forecast .care-forecast-explainer').first()).toContainText('typical gap');
    await expect(page.locator('#care-forecast .care-forecast-scatter').first()).toContainText('Dots are recent gaps over time');
    await expect(page.locator('#care-forecast .care-forecast-scatter svg').first()).toBeVisible();
    await expect(page.locator('#care-forecast .care-forecast-prediction').first()).toBeVisible();
    await expect(page.locator('#care-forecast .care-forecast-chip.median').first()).toBeVisible();
    await app.captureStep('Opened baby care forecast details', 'The summary shows next milk and diaper estimates with a detail view explaining baseline, samples, and intervals.');

    await page.locator('#open-baby-settings').click();
    await page.locator('#forecast-baseline').selectOption('30');
    await page.locator('#open-baby-summary').click();
    await expect(page.locator('#care-forecast')).toContainText('Last 30 days baseline');
    await app.captureStep('Changed forecast baseline', 'The forecast baseline setting updates the history window used for care estimates.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('milk reminder notification deep link opens and highlights next milk forecast', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const eventsByDay = {
      '2026-05-30': [
        { id: 'deep-link-milk-0', type: 'feeding_milk', rawText: 'formula 90', occurredAt: { value: '2026-05-30T00:00:00.000Z' }, amountMl: { value: 90 }, createdAt: '2026-05-30T00:01:00.000Z' },
        { id: 'deep-link-milk-1', type: 'feeding_milk', rawText: 'formula 100', occurredAt: { value: '2026-05-30T03:00:00.000Z' }, amountMl: { value: 100 }, createdAt: '2026-05-30T03:01:00.000Z' },
        { id: 'deep-link-milk-2', type: 'feeding_milk', rawText: 'formula 120', occurredAt: { value: '2026-05-30T06:00:00.000Z' }, amountMl: { value: 120 }, createdAt: '2026-05-30T06:01:00.000Z' },
        { id: 'deep-link-diaper', type: 'diaper', rawText: 'pee diaper', occurredAt: { value: '2026-05-30T07:00:00.000Z' }, diaperKind: { value: 'wet' }, createdAt: '2026-05-30T07:01:00.000Z' },
      ],
    };

    await page.route('**/api/logs/today**', async (route) => {
      const url = new URL(route.request().url());
      const day = url.searchParams.get('day') || '2026-05-30';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: eventsByDay[day] || [], summary: {}, context: null }),
      });
    });

    await app.loginAsDevAdmin('/baby?day=2026-05-30&panel=summary&focus=next-milk');

    await expect(page.locator('#baby-summary-panel')).toBeVisible();
    await expect(page.locator('#open-baby-summary')).toHaveAttribute('aria-expanded', 'true');
    const nextMilk = page.locator('#care-forecast .care-forecast-milk');
    await expect(nextMilk).toBeVisible();
    await expect(nextMilk).toHaveAttribute('open', '');
    await expect(nextMilk).toHaveClass(/deep-link-highlight/);
    await expect(nextMilk).toContainText('Next milk');
    await expect(nextMilk).toContainText('Estimate');
    await app.captureStep('Opened milk reminder notification deep link', 'The Baby summary panel opened directly with the Next milk forecast expanded and highlighted.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby weekly patterns summarize seven-day rhythm and type filters', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    const eventsByDay = {
      '2026-05-28': [
        { id: 'pattern-e2e-milk-1', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-05-28T08:00:00.000Z' }, amountMl: { value: 120 }, feedingKind: { value: 'formula' }, createdAt: '2026-05-28T08:01:00.000Z' },
        { id: 'pattern-e2e-sleep-1', type: 'sleep', rawText: 'nap', startAt: { value: '2026-05-28T10:00:00.000Z' }, endAt: { value: '2026-05-28T11:00:00.000Z' }, durationMinutes: { value: 60 }, createdAt: '2026-05-28T10:00:00.000Z' },
      ],
      '2026-05-29': [
        { id: 'pattern-e2e-milk-2', type: 'feeding_milk', rawText: 'breast milk', occurredAt: { value: '2026-05-29T08:30:00.000Z' }, amountMl: { value: 130, source: 'inferred' }, feedingKind: { value: 'breast' }, createdAt: '2026-05-29T08:31:00.000Z' },
        { id: 'pattern-e2e-poop-1', type: 'diaper', rawText: 'poop diaper', occurredAt: { value: '2026-05-29T12:00:00.000Z' }, diaperKind: { value: 'dirty' }, createdAt: '2026-05-29T12:00:00.000Z' },
      ],
      '2026-05-30': [
        { id: 'pattern-e2e-milk-3', type: 'feeding_milk', rawText: 'formula', occurredAt: { value: '2026-05-30T09:00:00.000Z' }, amountMl: { value: 140 }, createdAt: '2026-05-30T09:01:00.000Z' },
      ],
    };

    await page.route('**/api/logs/today**', async (route) => {
      const requestUrl = new URL(route.request().url());
      const day = requestUrl.searchParams.get('day') || '2026-05-30';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: eventsByDay[day] || [], summary: {}, context: null }),
      });
    });

    const loginResponse = await page.request.post('/api/auth/dev', { data: { id: 'admin-test' } });
    expect(loginResponse.ok()).toBeTruthy();
    await page.goto('/baby?day=2026-05-30');

    await expect(page.locator('#baby-patterns')).toBeHidden();
    await page.locator('#open-baby-patterns').click();
    await expect(page.locator('#baby-patterns')).toBeVisible();
    await expect(page.locator('#workspace')).toBeHidden();
    await page.locator('#open-baby-log').click();
    await expect(page.locator('#workspace')).toBeVisible();
    await page.locator('#open-baby-patterns').click();
    await expect(page.locator('#baby-patterns')).toContainText('7-day rhythm');
    await expect(page.locator('#baby-patterns')).toContainText('5 visible logs');
    await expect(page.locator('#baby-patterns .pattern-marker')).toHaveCount(5);
    await expect(page.locator('#baby-patterns')).toContainText('Milk interval');
    await expect(page.locator('#baby-patterns')).toContainText('Sleep rhythm');
    await expect(page.locator('#baby-patterns')).toContainText('Week comparison');
    await expect(page.locator('#baby-patterns')).toContainText('line charts');
    await expect(page.locator('#baby-patterns')).toContainText('Y-axis: Logs count');
    await expect(page.locator('#baby-patterns')).toContainText('Y-axis: Milk ml + Feeds count');
    await expect(page.locator('#baby-patterns')).toContainText('Assumed by app');
    await expect(page.locator('#baby-patterns')).toContainText('auto-filled fields marked with dashed outlines');
    await expect(page.locator('#baby-patterns .pattern-stat-chart-card.pattern-stat-milk')).toContainText('Feeds');
    await expect(page.locator('#baby-patterns .pattern-stat-chart-card.pattern-stat-milk')).toContainText('Formula');
    await expect(page.locator('#baby-patterns .pattern-stat-chart-card.pattern-stat-milk')).toContainText('Breast milk');
    await expect(page.locator('#baby-patterns .pattern-stat-line-chart')).toHaveCount(4);
    await expect(page.locator('#baby-patterns .pattern-stat-series').first()).toBeVisible();
    await expect(page.locator('#baby-patterns .pattern-stat-detail').first()).toBeVisible();
    await expect(page.locator('#baby-patterns .pattern-stat-detail-table')).toBeVisible();
    await expect(page.locator('#baby-patterns .pattern-stat-detail-table')).toContainText('Formula');
    await expect(page.locator('#baby-patterns .pattern-stat-detail-table')).toContainText('Breast milk');
    await expect(page.locator('#baby-patterns .pattern-stat-detail article')).toHaveCount(0);
    await app.captureStep('Weekly baby pattern rendered', 'The pattern panel opened from the baby menu with seven calendar lanes, interval cards, and statistics.');

    await page.locator('#baby-patterns .pattern-toggle', { hasText: 'Milk' }).click();
    await expect(page.locator('#baby-patterns')).toContainText('2 visible logs');
    await expect(page.locator('#baby-patterns .pattern-marker.pattern-feeding_milk')).toHaveCount(0);
    await app.captureStep('Filtered milk out of the pattern chart', 'The type toggle hides milk markers while preserving other rhythm cards.');

    await page.locator('#pattern-period-days').selectOption('30');
    await expect(page.locator('#baby-patterns')).toContainText('Monthly rhythm');
    await page.locator('#pattern-stat-unit').selectOption('day');
    await expect(page.locator('#baby-patterns')).toContainText('Day comparison');
    await app.captureStep('Changed pattern period and statistics grouping', 'The same menu panel switches from weekly rhythm to monthly history and daily comparison lines.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby status defaults to recent 24h and toggles back to today', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);

    await page.route('**/api/logs/today**', async (route) => {
      const url = new URL(route.request().url());
      const recent = url.searchParams.get('range') === 'recent24h';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(recent ? {
          events: [{ id: 'recent-milk', type: 'feeding_milk', rawText: 'recent formula', occurredAt: { value: new Date().toISOString() }, amountMl: { value: 90 } }],
          summary: { sleepMinutes: 0, milkCount: 2, milkAmountMl: 180, solidCount: 0, diaperCount: 1 },
          context: { lastMilk: { label: '10m ago', amountMl: 90 }, lastDiaper: { label: '2h ago', diaperKind: 'wet' }, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 },
        } : {
          events: [{ id: 'today-diaper', type: 'diaper', rawText: 'today diaper', occurredAt: { value: '2026-05-30T10:00:00.000Z' } }],
          summary: { sleepMinutes: 0, milkCount: 1, milkAmountMl: 90, solidCount: 0, diaperCount: 0 },
          context: { lastMilk: { label: '9:00 AM', amountMl: 90 }, lastDiaper: null, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 },
        }),
      });
    });

    await app.loginAsDevAdmin();
    await page.locator('#open-baby-summary').click();

    await expect(page.locator('#baby-status-range [data-status-range="recent24h"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#summary')).toContainText('2x · 180ml');
    await expect(page.locator('#today-context')).toContainText('10m ago · 90ml');

    await page.locator('#baby-status-range [data-status-range="today"]').click();
    await expect(page.locator('#baby-status-range [data-status-range="today"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#summary')).toContainText('1x · 90ml');
    await expect(page.locator('#today-context')).toContainText('9:00 AM · 90ml');
    await app.captureStep('Toggled baby status range', 'The status cards default to Recent 24h and can switch back to the Today snapshot.');

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
    await expect(page.locator('#recent-actions .suggested-action')).toContainText('분유 120 먹고 응가했어');
    await app.captureStep('Saved mixed baby log with context', 'A mixed natural-language log produced two visible records, updated Today Context, and became a recent suggestion.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('ambiguous baby logs show clarification guidance instead of saving', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    let postCount = 0;

    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ events: [], summary: {}, context: { lastMilk: null, lastDiaper: null, sleep: null, inferredFieldCount: 0, correctedFieldCount: 0 } }),
      });
    });
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      postCount += 1;
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'needs_clarification',
          code: 'needs_clarification',
          error: '입력 내용을 정확히 기록하려면 추가 정보가 필요해요.',
          message: '5mins could mean diaper timing or feeding duration.',
          questions: ['Did the poop diaper happen 5 minutes before formula feeding?'],
          suggestedInputs: ['formula now, poop diaper 5 minutes before'],
        }),
      });
    });

    page.on('dialog', async (dialog) => {
      expect(dialog.message()).toContain('추가 정보가 필요');
      await dialog.accept();
    });

    await app.loginAsDevAdmin();
    await page.locator('#log-input').fill('poop diaper before feeding formula 5mins');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#answer')).toContainText('추가 정보가 필요');
    await expect(page.locator('#answer')).toContainText('formula now, poop diaper 5 minutes before');
    await expect(page.locator('#log-input')).toHaveValue('poop diaper before feeding formula 5mins');
    await expect(page.locator('#timeline')).not.toContainText('poop diaper before feeding formula 5mins');
    expect(postCount).toBe(1);
    await app.captureStep('Ambiguous baby log blocked', 'The app warns that more information is needed, keeps the original input, and avoids adding a timeline record.');

    // A 422 clarification response is expected and browsers report it as a console resource error.
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby shortcut wheel disables volume for diaper and toggles Sleep to Wake', async ({ page }, testInfo) => {
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
    const chooseShortcut = async (label) => {
      await page.locator('#quick-actions .quick-action-button', { hasText: label }).evaluate((button) => button.click());
    };
    await expect(page.locator('#quick-actions')).toContainText('Sleep');
    await app.captureStep('Opened baby log shortcuts', 'Sleep appears under the Log input before an open sleep session exists.');

    await page.locator('#log-input').fill('manual baby note');
    await expect(page.locator('#quick-actions')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#quick-actions .quick-action-button').first()).toBeDisabled();
    await page.locator('#reset-log-form').click();
    await expect(page.locator('#quick-actions')).toHaveAttribute('aria-disabled', 'false');
    await app.captureStep('Manual text disables shortcut picker', 'Typing a natural-language record disables the heuristic picker so the shared Save button has one source.');

    await chooseShortcut('Diaper - pee');
    await expect(page.locator('#log-input')).toHaveValue('');
    await expect(page.locator('.quick-wheel-amount')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('.quick-picker-amount .quick-value-option').first()).toBeDisabled();
    await app.captureStep('Diaper shortcut disables volume', 'Choosing a diaper shortcut keeps the text input blank and disables the volume wheel.');

    await chooseShortcut('Feed formula');
    await expect(page.locator('#log-input')).toHaveValue('');
    await expect(page.locator('.quick-wheel-amount')).toHaveAttribute('aria-disabled', 'false');
    await app.captureStep('Milk shortcut enables volume', 'Choosing a milk shortcut re-enables the volume wheel without writing into the text input.');

    await chooseShortcut('Sleep');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.locator('#sleep-status')).toContainText('Napping now');
    await expect(page.locator('#quick-actions')).toContainText('Wake');
    await expect(page.locator('#quick-actions')).not.toContainText('Sleep');
    expect(shortcutPayload).toMatchObject({ parserMode: 'heuristic', inputSource: 'button' });
    expect(shortcutPayload.text).toMatch(/^nap at .+ today$/);
    await app.captureStep('Nap shortcut toggled to Wake', 'Open sleep status is visible and the Log shortcut is now a Wake action.');

    app.assertNoRuntimeErrors();
    await app.attachScenarioNarrative();
    await app.attachDiagnostics();
  });


  test('baby timeline item reveals and runs actions after a horizontal reveal gesture', async ({ page }, testInfo) => {
    const app = new AppHarness(page, testInfo);
    await app.loginAsDevAdmin();
    await app.captureStep('Opened app for swipe action scenario', 'Starting on baby tab before creating a swipable timeline log.');

    const token = Math.random().toString(36).replace(/[0-9]/g, 'x').slice(2, 8);
    const rawText = `swipe action formula 120 ml now ${token}`;
    await page.locator('#log-input').fill(rawText);
    await page.locator('#log-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#answer')).toContainText('log saved');

    const row = page.locator('#timeline .timeline-swipe', { hasText: rawText }).first();
    await expect(row).toBeVisible();
    await expect(row.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'true');
    await app.captureStep('Created swipable timeline item', 'The new log is present and its action rail starts hidden.');

    const card = row.locator('.swipe-card');
    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await page.mouse.wheel(220, 0);

    await expect(row.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'false');
    await expect.poll(async () => row.locator('.swipe-card').evaluate((node) => node.style.transform)).toMatch(/^translate3d\(-/);
    await app.captureStep('Revealed swipe action rail', 'A desktop horizontal wheel gesture opened the action rail.');

    await row.getByRole('button', { name: /Edit/ }).click();
    await expect(page.getByRole('heading', { name: 'Edit baby record' })).toBeVisible();
    await expect(page.locator('#action-dialog-input')).toBeVisible();
    await expect(page.locator('#action-dialog-quick-actions')).toBeVisible();
    await expect(page.locator('#action-dialog-quick-actions')).toContainText('Feed formula');
    await page.locator('#action-dialog-quick-actions').getByRole('button', { name: '80 ml', exact: true }).click();
    await expect(page.locator('#action-dialog-input')).toHaveValue(/formula 80 ml/);
    await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/logs/') && response.request().method() === 'PATCH'),
      page.locator('#action-dialog-confirm').click(),
    ]);
    await expect(page.locator('#timeline')).toContainText('80ml');
    await app.captureStep('Edited from revealed swipe action', 'The Edit dialog shows both the text field and heuristic picker, and picker changes update the saved note.');

    const editedRow = page.locator('#timeline .timeline-swipe', { hasText: 'formula 80 ml' }).first();
    await editedRow.locator('.swipe-card').scrollIntoViewIfNeeded();
    await editedRow.locator('.swipe-card').hover();
    await page.mouse.wheel(220, 0);
    await expect(editedRow.locator('.swipe-actions')).toHaveAttribute('aria-hidden', 'false');
    await editedRow.getByRole('button', { name: /Delete/ }).click();
    await expect(page.getByRole('heading', { name: 'Delete baby record?' })).toBeVisible();
    await page.locator('#action-dialog-confirm').click();
    await expect(page.locator('#timeline')).not.toContainText('formula 80 ml');
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
    await gotoAndSettle(page, '/tasks');
    await expect(page.locator('#task-list')).toContainText('No tasks for this day.');
    await app.captureStep('Empty task state', 'Task tab shows empty-state message for selected day.');

    await page.route('**/api/logs/today**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'forced e2e failure' }),
      });
    });
    await gotoAndSettle(page, '/baby');
    // TODO: once UI has explicit load-error banner, assert that message.
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('#timeline')).toContainText('No records for this date yet.');
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
    await expect(page.locator('#account-panel')).not.toHaveClass(/hidden/);

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
    await expect(page.locator('#baby-settings-panel')).toBeVisible();
    await expect(page.locator('#workspace')).toBeHidden();
    await page.locator('#baby-name').fill('Growth E2E Baby');
    await page.locator('#birth-date').fill('2026-01-01');
    await page.locator('#birth-time').fill('20:06');
    await page.locator('#baby-height').fill('52.1');
    await page.locator('#baby-weight').fill('3600');
    await page.locator('#growth-record-mode').selectOption('birth');
    await page.locator('#baby-settings-form').evaluate((form) => form.requestSubmit());
    await page.locator('#open-baby-summary').click();

    await expect(page.locator('#growth-summary')).toContainText('52.1cm');
    await expect(page.locator('#growth-summary')).toContainText('3600g');
    await expect(page.locator('#growth-summary')).not.toContainText('Apgar');
    await expect(page.locator('#growth-summary')).not.toContainText('Head');
    await app.captureStep('Saved birth growth record', 'Growth summary displays the at-birth weight and height values.');

    await page.locator('#open-baby-settings').click();
    await page.locator('#baby-height').fill('55.2');
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
    await expect(page.locator('[data-growth-chart-metric="weightG"]')).toBeChecked();
    await expect(page.locator('[data-growth-chart-metric="heightCm"]')).not.toBeChecked();
    await expect(page.locator('#growth-summary')).toContainText('Y-axis shows grams for weight');
    await page.locator('[data-growth-chart-metric="heightCm"]').check();
    await expect(page.locator('[data-growth-chart-metric="heightCm"]')).toBeChecked();
    await expect(page.locator('#growth-summary')).toContainText('centimeters for height');
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

async function createBabyRecord(page, text) {
  const response = await page.request.post('/api/logs', {
    data: { text, timezone: 'UTC', parserMode: 'heuristic', inputSource: 'e2e' },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function patchBabyRecord(page, rawLogId, text) {
  const response = await page.request.patch(`/api/logs/${encodeURIComponent(rawLogId)}`, {
    data: { text, timezone: 'UTC', parserMode: 'heuristic', inputSource: 'e2e' },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function deleteBabyRecord(page, rawLogId) {
  const response = await page.request.delete(`/api/logs/${encodeURIComponent(rawLogId)}`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function undoBabyAction(page, message) {
  await page.locator('#open-baby-action-log').click();
  await expect(page.locator('#baby-action-log-panel')).toBeVisible();
  const row = page.locator('#baby-action-log .action-log-entry', { hasText: message }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Undo this action?' })).toBeVisible();
  await confirmUndoAndWaitForRefresh(page, 'baby');
}

async function createTaskViaApi(page, title, dueDate = new Date().toISOString().slice(0, 10), options = {}) {
  const assigneesResponse = await page.request.get('/api/task-assignees');
  expect(assigneesResponse.ok()).toBeTruthy();
  const { assignees } = await assigneesResponse.json();
  const response = await page.request.post('/api/tasks', {
    data: {
      title,
      assigneeId: options.assigneeId || assignees[0].id,
      dueMode: options.dueMode || 'on_date',
      dueDate,
    },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.task;
}

async function patchTaskViaApi(page, taskId, patch) {
  const response = await page.request.patch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    data: { timezone: 'America/Los_Angeles', ...patch },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return payload.task;
}

async function undoTaskAction(page, message) {
  await page.locator('#open-task-action-log').click();
  await expect(page.locator('#task-action-log-panel')).toBeVisible();
  const row = page.locator('#task-action-log .action-log-entry', { hasText: message }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Undo this action?' })).toBeVisible();
  await confirmUndoAndWaitForRefresh(page, 'task');
}

async function confirmUndoAndWaitForRefresh(page, module) {
  const refreshPath = module === 'task' ? '/api/tasks/today' : '/api/logs/today';
  const [undoResponse, refreshResponse] = await Promise.all([
    page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/api/action-logs/') && response.url().endsWith('/undo')),
    page.waitForResponse((response) => response.request().method() === 'GET' && response.url().includes(refreshPath)),
    page.locator('#action-dialog-confirm').click(),
  ]);
  expect(undoResponse.ok()).toBeTruthy();
  expect(refreshResponse.ok()).toBeTruthy();
}

async function gotoAndSettle(page, url) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}
