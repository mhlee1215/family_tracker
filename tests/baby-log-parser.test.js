import test from 'node:test';
import assert from 'node:assert/strict';
import { getBabyLogClarification, parseBabyLogText } from '../src/domain/baby-log-parser.js';

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


test('heuristic parser returns multiple events from one mixed natural-language log', () => {
  const events = parseBabyLogText('분유 120 먹고 응가했어', { now });

  assert.deepEqual(events.map((event) => event.type), ['feeding_milk', 'diaper']);
  assert.equal(events[0].amountMl.value, 120);
  assert.equal(events[0].amountMl.source, 'explicit');
  assert.equal(events[1].diaperKind.value, 'dirty');
  assert.equal(events[1].diaperKind.source, 'explicit');
});


test('flags ambiguous relative diaper and formula minute logs instead of saving guesses', () => {
  const clarification = getBabyLogClarification('poop diaper before feeding formula 5mins');

  assert.equal(clarification.status, 'needs_clarification');
  assert.equal(clarification.code, 'ambiguous_relative_timing');
  assert.match(clarification.questions[0], /5 minutes/);
  assert.ok(clarification.suggestedInputs.some((input) => input.includes('5 minutes before')));
});

test('does not treat minute expressions near formula as milk amount', () => {
  const [event] = parseBabyLogText('formula 5mins', { now });

  assert.equal(event.type, 'feeding_milk');
  assert.equal(event.amountMl, undefined);
});


test('parses 5/31 baby tracker log strings into structured event data', () => {
  const may31Now = new Date('2026-05-31T20:00:00.000Z');
  const cases = [
    {
      text: 'feed formula 10 ml 10 mins ago',
      expected: {
        type: 'feeding_milk',
        occurredAt: '2026-05-31T19:50:00.000Z',
        occurredAtSource: 'inferred',
        occurredAtBasis: 'current_time_minus_10_minutes',
        amountMl: 10,
        amountSource: 'explicit',
        feedingKind: 'formula',
      },
    },
    {
      text: 'feed formula 10 mins ago',
      expected: {
        type: 'feeding_milk',
        occurredAt: '2026-05-31T19:50:00.000Z',
        occurredAtSource: 'inferred',
        occurredAtBasis: 'current_time_minus_10_minutes',
        amountMl: undefined,
        feedingKind: 'formula',
      },
    },
    {
      text: 'dirty diaper 5 mins ago',
      expected: {
        type: 'diaper',
        occurredAt: '2026-05-31T19:55:00.000Z',
        occurredAtSource: 'inferred',
        occurredAtBasis: 'current_time_minus_5_minutes',
        diaperKind: 'dirty',
      },
    },
    {
      text: 'nap 30 mins ago',
      expected: {
        type: 'sleep',
        startAt: '2026-05-31T19:30:00.000Z',
        startAtSource: 'inferred',
        startAtBasis: 'current_time_minus_30_minutes',
        action: 'start',
      },
    },
  ];

  for (const { text, expected } of cases) {
    const clarification = getBabyLogClarification(text);
    assert.equal(clarification, null, `${text} should not need clarification`);

    const [event] = parseBabyLogText(text, { now: may31Now, timezone: 'UTC' });

    assert.equal(event.rawText, text);
    assert.equal(event.type, expected.type);
    assert.equal(event.occurredAt?.value, expected.occurredAt);
    assert.equal(event.occurredAt?.source, expected.occurredAtSource);
    assert.equal(event.occurredAt?.basis, expected.occurredAtBasis);
    assert.equal(event.startAt?.value, expected.startAt);
    assert.equal(event.startAt?.source, expected.startAtSource);
    assert.equal(event.startAt?.basis, expected.startAtBasis);
    assert.equal(event.amountMl?.value, expected.amountMl);
    assert.equal(event.amountMl?.source, expected.amountSource);
    assert.equal(event.feedingKind?.value, expected.feedingKind);
    assert.equal(event.diaperKind?.value, expected.diaperKind);
    assert.equal(event.action?.value, expected.action);
  }
});
