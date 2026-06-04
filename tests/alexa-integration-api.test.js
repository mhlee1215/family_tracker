import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = resolve('.');
const testToken = 'test-alexa-token';
const fallbackFamilyId = 'family-admin-test';
const mappedAlexaUserId = 'amzn1.ask.account.test-user';
const mappedFamilyId = 'family-alexa-mapped';

let baseUrl;
let serverProcess;

before(async () => {
  const port = await findOpenPort();
  const cwd = mkdtempSync(join(tmpdir(), 'family-tracker-alexa-api-'));
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [join(repoRoot, 'scripts/start-server.js')], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PROVIDER: 'sqlite',
      LLM_PROVIDER: 'mock',
      MEDIA_STORAGE_PROVIDER: 'local',
      ALEXA_INTEGRATION_TOKEN: testToken,
      ALEXA_FAMILY_ID: fallbackFamilyId,
      ALEXA_USER_FAMILY_MAP: JSON.stringify({ [mappedAlexaUserId]: mappedFamilyId }),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer(baseUrl, serverProcess);
});

after(() => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill();
});

test('Alexa integration endpoint rejects missing or invalid bearer tokens', async () => {
  const missingToken = await postAlexaTask({
    text: 'clean bottles',
    requestId: 'auth-missing',
  }, { token: '' });
  const invalidToken = await postAlexaTask({
    text: 'clean bottles',
    requestId: 'auth-invalid',
  }, { token: 'wrong-token' });

  assert.equal(missingToken.status, 401);
  assert.equal(invalidToken.status, 401);
});

test('Alexa integration endpoint validates required request fields', async () => {
  const missingText = await postAlexaTask({ requestId: 'missing-text' });
  const missingRequestId = await postAlexaTask({ text: 'clean bottles' });
  const longAlexaUserId = await postAlexaTask({
    text: 'clean bottles',
    requestId: 'long-alexa-user',
    alexaUserId: 'x'.repeat(301),
  });

  assert.equal(missingText.status, 400);
  assert.match(missingText.body.error, /text/);
  assert.equal(missingRequestId.status, 400);
  assert.match(missingRequestId.body.error, /requestId/);
  assert.equal(longAlexaUserId.status, 400);
  assert.match(longAlexaUserId.body.error, /alexaUserId/);
});

test('Alexa integration endpoint creates an asap task in the mapped Alexa user family', async () => {
  const response = await postAlexaTask({
    text: 'clean the restroom by tomorrow',
    requestId: 'mapped-task',
    requestedAt: '2026-06-03T18:00:00.000Z',
    locale: 'en-US',
    timezone: 'America/Los_Angeles',
    alexaUserId: mappedAlexaUserId,
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task.title, 'clean the restroom by tomorrow');
  assert.equal(response.body.task.status, 'open');
  assert.equal(response.body.task.dueMode, 'asap');
  assert.equal(response.body.task.dueDate, '');
  assert.equal(response.body.task.familyId, mappedFamilyId);
});

test('Alexa integration endpoint falls back to test family and rejects duplicate request ids', async () => {
  const first = await postAlexaTask({
    text: 'take out recycling',
    requestId: 'fallback-duplicate-task',
  });
  const duplicate = await postAlexaTask({
    text: 'take out recycling again',
    requestId: 'fallback-duplicate-task',
  });

  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.task.familyId, fallbackFamilyId);
  assert.equal(duplicate.status, 409);
});

test('Alexa record endpoint routes formula speech to the baby log parser', async () => {
  const response = await postAlexaRecord({
    text: 'formula 60 milliliters',
    requestId: 'record-baby-formula',
    requestedAt: '2026-06-03T19:00:00.000Z',
    timezone: 'America/Los_Angeles',
    alexaUserId: mappedAlexaUserId,
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.kind, 'baby_log');
  assert.equal(response.body.rawLog.rawText, 'formula 60 milliliters');
  assert.equal(response.body.rawLog.familyId, mappedFamilyId);
  assert.equal(response.body.rawLog.babyId, `${mappedFamilyId}-baby`);
  assert.equal(response.body.events.length, 1);
  assert.equal(response.body.events[0].type, 'feeding_milk');
  assert.equal(response.body.events[0].rawText, 'formula 60 milliliters');
  assert.equal(response.body.events[0].inputSource, 'alexa');
});

test('Alexa record endpoint falls back to task creation for household speech', async () => {
  const response = await postAlexaRecord({
    text: 'clean the restroom by tomorrow',
    requestId: 'record-household-task',
    requestedAt: '2026-06-03T19:05:00.000Z',
    timezone: 'America/Los_Angeles',
    alexaUserId: mappedAlexaUserId,
  });

  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.ok, true);
  assert.equal(response.body.kind, 'task');
  assert.equal(response.body.task.title, 'clean the restroom by tomorrow');
  assert.equal(response.body.task.familyId, mappedFamilyId);
  assert.equal(response.body.task.dueMode, 'asap');
});

async function postAlexaTask(payload, options = {}) {
  return postAlexaIntegration('/api/integrations/alexa/task', payload, options);
}

async function postAlexaRecord(payload, options = {}) {
  return postAlexaIntegration('/api/integrations/alexa/record', payload, options);
}

async function postAlexaIntegration(path, payload, options = {}) {
  const token = options.token === undefined ? testToken : options.token;
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 10_000;
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited early with code ${child.exitCode}:\n${output}`);
    }
    try {
      const response = await fetch(`${url}/api/config`);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Timed out waiting for test server:\n${output}`);
}

async function findOpenPort() {
  const { createServer } = await import('node:net');
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}
