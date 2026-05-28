import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpenAIRequest } from '../src/domain/openai-provider.js';

test('builds baby log request with minimal instructions and JSON schema format', () => {
  const request = buildOpenAIRequest('parse_baby_log', { text: 'formula and diaper' }, { model: 'gpt-test' });

  assert.equal(request.model, 'gpt-test');
  assert.equal(request.instructions, 'Return JSON matching the supplied schema.');
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'baby_log_parse');
  assert.equal(request.text.format.schema.required[0], 'events');
  assert.equal(request.text.format.schema.properties.events.description, 'One event per baby activity described in the input text.');
  assert.deepEqual(request.text.format.schema.properties.events.items.properties.type.enum, ['sleep', 'feeding_milk', 'feeding_solid', 'diaper']);
  assert.equal(request.text.format.schema.properties.events.items.properties.amountMl.type, 'number');
  assert.equal(request.text.format.schema.properties.events.items.properties.occurredAt.type, 'string');
});
