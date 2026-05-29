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

test('parses English and Vietnamese shortcut logs for localized UI buttons', () => {
  const [formula] = parseBabyLogText('formula', { now });
  const [nap] = parseBabyLogText('ngủ trưa', { now });
  const [diaper] = parseBabyLogText('tã bẩn', { now });

  assert.equal(formula.type, 'feeding_milk');
  assert.equal(nap.type, 'sleep');
  assert.equal(diaper.type, 'diaper');
  assert.equal(diaper.diaperKind.value, 'dirty');
});


test('does not treat today as Vietnamese wake shortcut in English formula logs', () => {
  const [event] = parseBabyLogText('ate formula 12 ml at 1:20 pm today', { now, timezone: 'UTC' });

  assert.equal(event.type, 'feeding_milk');
  assert.equal(event.amountMl.value, 12);
  assert.equal(event.amountMl.source, 'explicit');
  assert.equal(event.feedingKind.value, 'formula');
  assert.equal(event.feedingKind.source, 'explicit');
  assert.equal(event.occurredAt.value, '2026-05-23T13:20:00.000Z');
  assert.equal(event.occurredAt.source, 'explicit');
});


test('parses explicit English times on the local day for the user timezone', () => {
  const [event] = parseBabyLogText('ate formula 30 ml at 7:30 pm', {
    now: new Date('2026-05-29T04:30:00.000Z'),
    timezone: 'America/Los_Angeles',
  });

  assert.equal(event.type, 'feeding_milk');
  assert.equal(event.amountMl.value, 30);
  assert.equal(event.occurredAt.value, '2026-05-29T02:30:00.000Z');
  assert.equal(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(event.occurredAt.value)), '2026-05-28');
});

test('parses explicit Korean times on the local day for the user timezone', () => {
  const [event] = parseBabyLogText('분유 30ml 저녁 7시 30분', {
    now: new Date('2026-05-29T04:30:00.000Z'),
    timezone: 'America/Los_Angeles',
  });

  assert.equal(event.type, 'feeding_milk');
  assert.equal(event.occurredAt.value, '2026-05-29T02:30:00.000Z');
});
