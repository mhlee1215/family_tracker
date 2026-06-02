import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCareForecast, normalizeForecastPeriodDays } from '../src/domain/care-forecast.js';
import { createField } from '../src/domain/baby-events.js';

function milk(id, occurredAt, amountMl) {
  return {
    id,
    type: 'feeding_milk',
    occurredAt: createField(occurredAt, 'explicit', 'typed_time'),
    amountMl: amountMl == null ? undefined : createField(amountMl, 'explicit', 'typed_amount'),
  };
}

function diaper(id, occurredAt, diaperKind = 'wet') {
  return {
    id,
    type: 'diaper',
    occurredAt: createField(occurredAt, 'explicit', 'typed_time'),
    diaperKind: createField(diaperKind, 'explicit', 'keyword'),
  };
}

test('buildCareForecast estimates next milk time and amount from recent medians', () => {
  const forecast = buildCareForecast([
    milk('m1', '2026-06-02T00:00:00.000Z', 90),
    milk('m2', '2026-06-02T03:00:00.000Z', 110),
    milk('m3', '2026-06-02T06:00:00.000Z', 130),
    milk('m4', '2026-06-02T09:30:00.000Z', 150),
  ], { now: new Date('2026-06-02T10:00:00.000Z'), periodDays: 7 });

  assert.equal(forecast.periodDays, 7);
  assert.equal(forecast.milk.status, 'ready');
  assert.equal(forecast.milk.nextAt, '2026-06-02T12:30:00.000Z');
  assert.equal(forecast.milk.remainingMinutes, 150);
  assert.deepEqual(forecast.milk.amountMl, { value: 120, range: [105, 135] });
  assert.equal(forecast.milk.basis.sampleCount, 4);
  assert.equal(forecast.milk.basis.medianIntervalMinutes, 180);
});

test('buildCareForecast estimates diaper time and keeps kind counts for detail', () => {
  const forecast = buildCareForecast([
    diaper('d1', '2026-06-02T01:00:00.000Z', 'wet'),
    diaper('d2', '2026-06-02T03:00:00.000Z', 'dirty'),
    diaper('d3', '2026-06-02T06:30:00.000Z', 'wet'),
    diaper('d4', '2026-06-02T09:30:00.000Z', 'mixed'),
  ], { now: new Date('2026-06-02T10:00:00.000Z'), periodDays: 1 });

  assert.equal(forecast.diaper.status, 'ready');
  assert.equal(forecast.diaper.nextAt, '2026-06-02T12:30:00.000Z');
  assert.equal(forecast.diaper.remainingMinutes, 150);
  assert.equal(forecast.diaper.basis.medianIntervalMinutes, 180);
  assert.deepEqual(forecast.diaper.basis.diaperKinds, { wet: 2, dirty: 1, mixed: 1 });
});

test('buildCareForecast reports overdue status and excludes outlier intervals', () => {
  const forecast = buildCareForecast([
    milk('m1', '2026-06-01T00:00:00.000Z', 100),
    milk('m2', '2026-06-01T12:00:00.000Z', 100),
    milk('m3', '2026-06-01T15:00:00.000Z', 110),
    milk('m4', '2026-06-01T18:00:00.000Z', 120),
  ], { now: new Date('2026-06-01T22:30:00.000Z'), periodDays: 7 });

  assert.equal(forecast.milk.status, 'overdue');
  assert.equal(forecast.milk.nextAt, '2026-06-01T21:00:00.000Z');
  assert.equal(forecast.milk.remainingMinutes, -90);
  assert.equal(forecast.milk.basis.excludedOutliers, 1);
  assert.deepEqual(forecast.milk.basis.intervalMinutes, [180, 180]);
});

test('buildCareForecast handles insufficient data without inventing a next event', () => {
  const forecast = buildCareForecast([
    milk('m1', '2026-06-02T09:00:00.000Z', 120),
    diaper('d1', '2026-06-02T09:30:00.000Z', 'wet'),
  ], { now: new Date('2026-06-02T10:00:00.000Z'), periodDays: 7 });

  assert.equal(forecast.milk.status, 'not_enough_data');
  assert.equal(forecast.milk.nextAt, null);
  assert.equal(forecast.milk.basis.sampleCount, 1);
  assert.equal(forecast.diaper.status, 'not_enough_data');
  assert.equal(forecast.diaper.nextAt, null);
});

test('buildCareForecast filters to the selected baseline and ignores hidden logs', () => {
  const forecast = buildCareForecast([
    milk('old', '2026-05-20T09:00:00.000Z', 50),
    { ...milk('hidden', '2026-06-02T06:00:00.000Z', 999), hiddenFromTimeline: true },
    milk('m1', '2026-06-02T06:00:00.000Z', 100),
    milk('m2', '2026-06-02T09:00:00.000Z', 120),
  ], { now: new Date('2026-06-02T10:00:00.000Z'), periodDays: 1 });

  assert.equal(forecast.milk.status, 'ready');
  assert.equal(forecast.milk.basis.sampleCount, 2);
  assert.equal(forecast.milk.basis.medianIntervalMinutes, 180);
});

test('normalizeForecastPeriodDays supports day, week, and month choices', () => {
  assert.equal(normalizeForecastPeriodDays(1), 1);
  assert.equal(normalizeForecastPeriodDays('7'), 7);
  assert.equal(normalizeForecastPeriodDays(30), 30);
  assert.equal(normalizeForecastPeriodDays(14), 7);
});
