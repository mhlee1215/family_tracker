import test from 'node:test';
import assert from 'node:assert/strict';
import { callLLMTask, getProviderModelOptions, normalizeLLMProvider } from '../src/domain/llm-provider.js';

test('registers Mistral as a configurable server-side LLM provider', () => {
  const providers = getProviderModelOptions();
  const mistral = providers.find((provider) => provider.id === 'mistral');

  assert.equal(normalizeLLMProvider('mistral'), 'mistral');
  assert.equal(mistral.label, 'Mistral');
  assert.equal(mistral.defaultModel, 'mistral-small-latest');
  assert.deepEqual(mistral.models, ['mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest']);
  assert.equal(mistral.requiresApiKey, true);
});

test('dispatches Mistral provider calls through the Mistral adapter', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ events: [{ type: 'diaper', diaperKind: 'dirty' }] }) } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    const response = await callLLMTask('parse_baby_log', { text: '응가' }, {
      provider: 'mistral',
      model: 'mistral-small-latest',
      apiKey: 'test-key',
    });

    assert.match(response.output_text, /"type":"diaper"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
