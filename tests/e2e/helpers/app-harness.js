import { expect } from '@playwright/test';

export class AppHarness {
  constructor(page, testInfo) {
    this.page = page;
    this.testInfo = testInfo;
    this.consoleErrors = [];
    this.pageErrors = [];
    this.networkErrors = [];
    this.stepArtifacts = [];

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

  async captureStep(title, detail = '') {
    const index = this.stepArtifacts.length + 1;
    this.stepArtifacts.push({
      index,
      title,
      detail,
    });
  }

  async attachScenarioNarrative() {
    const lines = ['# E2E Scenario Steps', ''];
    if (!this.stepArtifacts.length) {
      lines.push('- No steps were captured.');
    } else {
      for (const step of this.stepArtifacts) {
        lines.push(`## ${step.index}. ${step.title}`);
        if (step.detail) lines.push(step.detail);
        lines.push('');
      }
    }

    await this.testInfo.attach('scenario-steps', {
      body: lines.join('\n'),
      contentType: 'text/markdown',
    });
  }

  async loginAsDevAdmin(path = '/baby') {
    const response = await this.page.request.post('/api/auth/dev', { data: { id: 'admin-test' } });
    expect(response.ok()).toBeTruthy();
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
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
