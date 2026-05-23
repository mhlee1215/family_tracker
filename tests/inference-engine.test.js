import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBabyLogText } from '../src/domain/baby-log-parser.js';
import { applyInferences } from '../src/domain/inference-engine.js';

const now = new Date('2026-05-23T14:00:00.000Z');

test('infers milk amount from profile or age defaults', () => {
  const parsed = parseBabyLogText('분유 먹음', { now });
  const [event] = applyInferences(parsed, {
    now,
    profile: { milkAmountMlOverride: 150 },
  });

  assert.equal(event.amountMl.value, 150);
  assert.equal(event.amountMl.source, 'inferred');
});

test('infers sleep end for nap start', () => {
  const parsed = parseBabyLogText('낮잠', { now });
  const [event] = applyInferences(parsed, {
    now,
    profile: { napDurationMinutesOverride: 60 },
  });

  assert.equal(event.endAt.source, 'inferred');
  assert.equal(event.durationMinutes.value, 60);
});

test('infers sleep start for completed nap with missing start', () => {
  const parsed = parseBabyLogText('낮잠 잤음', { now });
  const [event] = applyInferences(parsed, {
    now,
    profile: { napDurationMinutesOverride: 45 },
  });

  assert.equal(event.startAt.source, 'inferred');
  assert.equal(event.durationMinutes.value, 45);
});

