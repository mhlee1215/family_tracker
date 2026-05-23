import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBabyLogText } from '../src/domain/baby-log-parser.js';

const now = new Date('2026-05-23T14:00:00.000Z');

test('parses short milk logs with system time and explicit amount when present', () => {
  const [simple] = parseBabyLogText('분유 먹음', { now });
  const [withAmount] = parseBabyLogText('분유 180', { now });

  assert.equal(simple.type, 'feeding_milk');
  assert.equal(simple.occurredAt.source, 'system');
  assert.equal(withAmount.amountMl.value, 180);
  assert.equal(withAmount.amountMl.source, 'explicit');
});

test('parses nap start from a very short sleep log', () => {
  const [event] = parseBabyLogText('낮잠', { now });

  assert.equal(event.type, 'sleep');
  assert.equal(event.action.value, 'start');
  assert.equal(event.startAt.value, now.toISOString());
  assert.equal(event.startAt.source, 'system');
});

test('parses completed nap as sleep end when only completion is typed', () => {
  const [event] = parseBabyLogText('낮잠 잤음', { now });

  assert.equal(event.type, 'sleep');
  assert.equal(event.action.value, 'end');
  assert.equal(event.endAt.value, now.toISOString());
});

test('parses solid food and diaper logs', () => {
  const [solid] = parseBabyLogText('고구마 먹음', { now });
  const [diaper] = parseBabyLogText('응가', { now });

  assert.equal(solid.type, 'feeding_solid');
  assert.equal(solid.food.value, '고구마');
  assert.equal(diaper.type, 'diaper');
  assert.equal(diaper.diaperKind.value, 'dirty');
});

