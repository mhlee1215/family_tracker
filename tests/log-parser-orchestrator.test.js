import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBabyLogForSave, parseBabyLogWithProvider } from '../src/domain/log-parser-orchestrator.js';

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
          occurredAt: now.toISOString(),
          amountMl: 12,
          feedingKind: 'formula',
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
          occurredAt: '2026-05-28T13:20:00.000Z',
          amountMl: 12,
          feedingKind: 'formula',
        }, {
          type: 'diaper',
          occurredAt: '2026-05-28T13:20:00.000Z',
          diaperKind: 'dirty',
        }],
      }),
    }),
  });

  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.type), ['feeding_milk', 'diaper']);
  assert.ok(events.every((event) => event.parser === 'llm:openai'));
  assert.ok(events.every((event) => event.parserInfo.model === 'gpt-test'));
});


test('uses heuristic parser when shortcut buttons request it even with configured LLM', async () => {
  let callCount = 0;
  const events = await parseBabyLogWithProvider('formula', { now }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    parserMode: 'heuristic',
    callTask: async () => {
      callCount += 1;
      throw new Error('LLM should not be called for shortcut buttons');
    },
  });

  assert.equal(callCount, 0);
  assert.equal(events[0].type, 'feeding_milk');
  assert.equal(events[0].parserInfo.kind, 'heuristic');
});


test('returns clarification decisions without falling back to heuristic saves', async () => {
  let callCount = 0;
  const result = await parseBabyLogForSave('fed 5mins', { now }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    callTask: async () => {
      callCount += 1;
      return {
        output_text: JSON.stringify({
          status: 'needs_clarification',
          code: 'llm_ambiguous_minutes',
          message: '5mins could be a feeding duration or timing note.',
          questions: ['Was formula feeding 5 minutes long?'],
          suggestedInputs: ['formula for 5 minutes'],
          events: [],
        }),
      };
    },
  });

  assert.equal(callCount, 1);
  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.code, 'llm_ambiguous_minutes');
  assert.equal(result.events, undefined);
});


test('resolves LLM relative diaper time from the latest recent formula feeding', async () => {
  let llmInput;
  const recentFormula = {
    id: 'event-formula-1',
    type: 'feeding_milk',
    occurredAt: { value: '2026-05-28T19:30:00.000Z' },
    amountMl: { value: 120 },
    feedingKind: { value: 'formula' },
  };

  const result = await parseBabyLogForSave('최근에 포뮬라 먹기 10분 전에 똥/오줌 기저귀 바꿨어', {
    now,
    recentEvents: [recentFormula],
  }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    callTask: async (_task, input) => {
      llmInput = input;
      return {
        output_text: JSON.stringify({
          status: 'ok',
          events: [{
            type: 'diaper',
            diaperKind: 'mixed',
            relativeTime: {
              anchorEventType: 'feeding_milk',
              anchorFeedingKind: 'formula',
              anchorSelector: 'latest',
              offsetMinutes: -10,
            },
          }],
        }),
      };
    },
  });

  assert.equal(llmInput.recentEvents[0].feedingKind, 'formula');
  assert.equal(result.status, 'ok');
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].type, 'diaper');
  assert.equal(result.events[0].diaperKind.value, 'mixed');
  assert.equal(result.events[0].diaperKind.source, 'explicit');
  assert.equal(result.events[0].occurredAt.value, '2026-05-28T19:20:00.000Z');
  assert.equal(result.events[0].occurredAt.source, 'inferred');
  assert.equal(result.events[0].occurredAt.basis, 'latest_feeding_milk_formula_minus_10_minutes');
  assert.deepEqual(result.events[0].timeAnchor, {
    eventId: 'event-formula-1',
    eventType: 'feeding_milk',
    feedingKind: 'formula',
    offsetMinutes: -10,
  });
});

test('asks for clarification when LLM relative time has no recent formula anchor', async () => {
  const result = await parseBabyLogForSave('최근에 포뮬라 먹기 10분 전에 똥/오줌 기저귀 바꿨어', {
    now,
    recentEvents: [{
      id: 'event-breast-1',
      type: 'feeding_milk',
      occurredAt: { value: '2026-05-28T19:30:00.000Z' },
      feedingKind: { value: 'breast' },
    }],
  }, {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'test-key',
    callTask: async () => ({
      output_text: JSON.stringify({
        status: 'ok',
        events: [{
          type: 'diaper',
          diaperKind: 'mixed',
          relativeTime: {
            anchorEventType: 'feeding_milk',
            anchorFeedingKind: 'formula',
            anchorSelector: 'latest',
            offsetMinutes: -10,
          },
        }],
      }),
    }),
  });

  assert.equal(result.status, 'needs_clarification');
  assert.equal(result.code, 'missing_relative_time_anchor');
  assert.match(result.questions[0], /recent formula feeding/i);
});
