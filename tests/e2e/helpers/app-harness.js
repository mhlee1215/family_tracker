import { expect } from '@playwright/test';

export class AppHarness {
  constructor(page, testInfo) {
    this.page = page;
    this.testInfo = testInfo;
    this.consoleErrors = [];
    this.pageErrors = [];
    this.networkErrors = [];

    page.on('console', (message) => {
      if (message.type() === 'error') {
        this.consoleErrors.push(`[console:${message.type()}] ${message.text()}`);
      }
    });

    page.on('pageerror', (error) => {
      this.pageErrors.push(`[pageerror] ${error?.stack || error?.message || String(error)}`);
    });

    page.on('requestfailed', (request) => {
      const failure = request.failure()?.errorText || 'Unknown network failure';
      this.networkErrors.push(`[requestfailed] ${request.method()} ${request.url()} -> ${failure}`);
    });
  }

  async loginAsDevAdmin() {
    const response = await this.page.request.post('/api/auth/dev', { data: { id: 'admin' } });
    expect(response.ok()).toBeTruthy();
    await this.page.goto('/');
  }

  async attachDiagnostics() {
    await this.testInfo.attach('console-errors', {
      body: this.consoleErrors.join('\n') || 'None',
      contentType: 'text/plain',
    });
    await this.testInfo.attach('page-errors', {
      body: this.pageErrors.join('\n') || 'None',
      contentType: 'text/plain',
    });
    await this.testInfo.attach('network-errors', {
      body: this.networkErrors.join('\n') || 'None',
      contentType: 'text/plain',
    });
  }

  assertNoRuntimeErrors() {
    expect.soft(this.consoleErrors, 'Console errors should not happen').toEqual([]);
    expect.soft(this.pageErrors, 'Page errors should not happen').toEqual([]);
    expect.soft(this.networkErrors, 'Network failures should not happen').toEqual([]);
  }

  assertCapturedFailures() {
    expect(this.consoleErrors.length + this.pageErrors.length + this.networkErrors.length).toBeGreaterThan(0);
  }
}
