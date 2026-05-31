import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMistralRequest, callMistralForTask } from '../src/domain/mistral-provider.js';

test('builds Mistral baby log request with chat messages and JSON schema response format', () => {
  const request = buildMistralRequest('parse_baby_log', { text: '분유 먹고 응가' }, { model: 'mistral-test' });

  assert.equal(request.model, 'mistral-test');
  assert.deepEqual(request.messages.map((message) => message.role), ['system', 'user']);
  assert.match(request.messages[0].content, /Return JSON matching the supplied schema/);
  assert.match(request.messages[0].content, /needs_clarification/);
  assert.match(request.messages[0].content, /Do not turn minute expressions/);
  assert.equal(request.messages[1].content, JSON.stringify({ text: '분유 먹고 응가' }));
  assert.equal(request.response_format.type, 'json_schema');
  assert.equal(request.response_format.json_schema.name, 'baby_log_parse');
  assert.equal(request.response_format.json_schema.schema.required[0], 'events');
  assert.equal(request.response_format.json_schema.schema.properties.status.enum[1], 'needs_clarification');
  assert.deepEqual(request.response_format.json_schema.schema.properties.events.items.properties.type.enum, ['sleep', 'feeding_milk', 'feeding_solid', 'diaper']);
});

test('calls Mistral chat completions and exposes message content as output_text', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({ events: [{ type: 'diaper', diaperKind: 'dirty' }] }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await callMistralForTask('parse_baby_log', { text: '응가' }, { apiKey: 'mistral-key', model: 'mistral-test' });

    assert.equal(requests[0].url, 'https://api.mistral.ai/v1/chat/completions');
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.headers.authorization, 'Bearer mistral-key');
    assert.equal(JSON.parse(requests[0].init.body).model, 'mistral-test');
    assert.match(response.output_text, /"diaperKind":"dirty"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
