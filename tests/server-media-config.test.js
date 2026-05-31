import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../app/main.js', import.meta.url), 'utf8');

test('server exposes only public media storage config and keeps R2 secrets server-side', () => {
  assert.match(serverSource, /getMediaStorageConfig/);
  assert.match(serverSource, /publicMediaStorageConfig\(mediaStorageConfig\)/);
  assert.match(serverSource, /mediaStorage:/);
  assert.doesNotMatch(clientSource, /R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|R2_ACCOUNT_ID/);
});
