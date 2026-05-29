import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const serverSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

test('server runtime LLM config reads Mistral API keys only on the server side', () => {
  assert.match(serverSource, /mistral: process\.env\.MISTRAL_API_KEY \|\| ''/);
  assert.match(serverSource, /provider === 'mistral'/);
  assert.match(serverSource, /runtimeLLMConfig\.apiKeys\.mistral \|\| process\.env\.MISTRAL_API_KEY/);
  assert.match(serverSource, /provider === 'mistral' \? process\.env\.MISTRAL_MODEL/);
});
