import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedingGuidance, classifyRange, feedingMetrics } from '../src/domain/feeding-guidance.js';

describe('feeding guidance', () => {
  it('compares newborn bottle-feeding records with the current day progress and yesterday baseline', () => {
    const guidance = buildFeedingGuidance({
      profile: { birthDate: '2026-05-16', milkAmountMlOverride: 30 },
      selectedDay: '2026-05-30',
      now: new Date('2026-05-30T12:00:00'),
      events: Array.from({ length: 5 }, (_, index) => ({
        id: `today-${index}`,
        type: 'feeding_milk',
        rawText: 'formula 20ml',
        occurredAt: { value: `2026-05-30T0${Math.min(index + 1, 9)}:00:00.000Z` },
        amountMl: { value: 20 },
      })),
      previousEvents: [
        ...Array.from({ length: 6 }, (_, index) => ({
          id: `yesterday-${index}`,
          type: 'feeding_milk',
          rawText: 'formula 25ml',
          occurredAt: { value: `2026-05-29T0${Math.min(index + 1, 9)}:00:00.000Z` },
          amountMl: { value: 25 },
        })),
        {
          id: 'yesterday-late',
          type: 'feeding_milk',
          rawText: 'formula late 200ml',
          occurredAt: { value: '2026-05-29T18:00:00.000Z' },
          amountMl: { value: 200 },
        },
      ],
    });

    assert.equal(guidance.ageDays, 14);
    assert.equal(guidance.stageLabel, 'Week 3 newborn');
    assert.deepEqual(guidance.comparison.feedCount, { min: 4, max: 6 });
    assert.deepEqual(guidance.comparison.amount, { min: 120, max: 180 });
    assert.equal(guidance.comparison.feedCountStatus, 'within_range');
    assert.equal(guidance.comparison.amountStatus, 'slightly_low');
    assert.equal(guidance.comparison.averageStatus, 'low');
    assert.equal(guidance.yesterdayComparison.totalAmountDeltaMl, -50);
    assert.equal(guidance.yesterdayComparison.feedCountDelta, -1);
    assert.match(guidance.summary, /feed count is within/);
  });

  it('ignores hidden milk events and missing amount values when computing ml averages', () => {
    const metrics = feedingMetrics([
      { type: 'feeding_milk', amountMl: { value: 60 } },
      { type: 'feeding_milk' },
      { type: 'feeding_milk', hiddenFromTimeline: true, amountMl: { value: 90 } },
      { type: 'diaper', amountMl: { value: 10 } },
    ]);

    assert.equal(metrics.feedCount, 2);
    assert.equal(metrics.amountCount, 1);
    assert.equal(metrics.totalAmountMl, 60);
    assert.equal(metrics.averageAmountMl, 60);
  });

  it('classifies values with a buffer around the expected range', () => {
    assert.equal(classifyRange(70, { min: 100, max: 200 }), 'low');
    assert.equal(classifyRange(90, { min: 100, max: 200 }), 'slightly_low');
    assert.equal(classifyRange(150, { min: 100, max: 200 }), 'within_range');
    assert.equal(classifyRange(220, { min: 100, max: 200 }), 'slightly_high');
    assert.equal(classifyRange(260, { min: 100, max: 200 }), 'high');
  });
});
