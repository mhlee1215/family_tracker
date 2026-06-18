import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notification worker generates Web Push request details and sends with fetch', () => {
  const source = readFileSync(new URL('../workers/notification-worker.js', import.meta.url), 'utf8');

  assert.match(source, /generateRequestDetails/);
  assert.match(source, /fetch\(request\.endpoint/);
  assert.doesNotMatch(source, /sendNotification\s*\(/);
});
