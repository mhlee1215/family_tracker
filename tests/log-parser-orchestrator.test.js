import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBabyLogWithProvider } from '../src/domain/log-parser-orchestrator.js';

const now = new Date('2026-05-28T20:00:00.000Z');

test('uses configured LLM provider and records provider/model metadata', async () => {
  const events = await parseBabyLogWithProvider('formula 12 ml', { now }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    callTask: async () => ({
      output_text: JSON.stringify({
        events: [{
          type: 'feeding_milk',
          occurredAt: { value: now.toISOString(), source: 'explicit', basis: 'typed_time', confidence: 0.9 },
          amountMl: { value: 12, source: 'explicit', basis: 'typed_number', confidence: 0.95 },
          feedingKind: { value: 'formula', source: 'explicit', basis: 'keyword', confidence: 0.95 },
        }],
      }),
    }),
  });

  assert.equal(events[0].type, 'feeding_milk');
  assert.equal(events[0].parser, 'llm:openai');
  assert.equal(events[0].parserInfo.kind, 'llm');
  assert.equal(events[0].parserInfo.model, 'gpt-test');
  assert.equal(events[0].amountMl.source, 'explicit');
});

test('falls back to heuristic parser when configured LLM parse fails', async () => {
  const events = await parseBabyLogWithProvider('ate formula 12 ml at 1:20 pm today', { now }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    callTask: async () => { throw new Error('bad JSON'); },
  });

  assert.equal(events[0].type, 'feeding_milk');
  assert.equal(events[0].parserInfo.kind, 'heuristic');
  assert.equal(events[0].parserInfo.fallbackFrom.provider, 'openai');
  assert.equal(events[0].parserInfo.fallbackFrom.model, 'gpt-test');
});

test('keeps multiple LLM events from one sentence linked to the same parser metadata', async () => {
  const events = await parseBabyLogWithProvider('formula 12 ml and dirty diaper at 1:20 pm', { now }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    callTask: async () => ({
      output_text: JSON.stringify({
        events: [{
          type: 'feeding_milk',
          occurredAt: { value: '2026-05-28T13:20:00.000Z', source: 'explicit', basis: 'typed_time', confidence: 0.9 },
          amountMl: { value: 12, source: 'explicit', basis: 'typed_number', confidence: 0.95 },
          feedingKind: { value: 'formula', source: 'explicit', basis: 'keyword', confidence: 0.95 },
        }, {
          type: 'diaper',
          occurredAt: { value: '2026-05-28T13:20:00.000Z', source: 'explicit', basis: 'typed_time', confidence: 0.9 },
          diaperKind: { value: 'dirty', source: 'explicit', basis: 'keyword', confidence: 0.95 },
        }],
      }),
    }),
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.type), ['feeding_milk', 'diaper']);
  assert.ok(events.every((event) => event.parser === 'llm:openai'));
  assert.ok(events.every((event) => event.parserInfo.model === 'gpt-test'));
});
