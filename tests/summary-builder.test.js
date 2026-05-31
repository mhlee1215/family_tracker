import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/domain/baby-events.js';
import { buildTodayContext, buildTodaySummary, buildWindowSummary, filterEventsForWindow } from '../src/domain/summary-builder.js';

test('buildTodaySummary does not double-count linked sleep end events', () => {
  const summary = buildTodaySummary([
    {
      id: 'sleep-start',
      type: 'sleep',
      action: createField('start', 'explicit', 'sleep_keyword'),
      status: 'completed',
      durationMinutes: createField(40, 'system', 'open_sleep_session'),
    },
    {
      id: 'sleep-end',
      type: 'sleep',
      action: createField('end', 'explicit', 'completion_keyword'),
      linkedStartEventId: 'sleep-start',
      durationMinutes: createField(40, 'system', 'open_sleep_session'),
    },
  ]);

  assert.equal(summary.sleepMinutes, 40);
});

test('buildTodaySummary ignores hidden automatic wake events', () => {
  const summary = buildTodaySummary([
    {
      id: 'sleep-start',
      type: 'sleep',
      action: createField('start', 'explicit', 'sleep_keyword'),
      status: 'completed',
      durationMinutes: createField(20, 'system', 'open_sleep_session'),
    },
    {
      id: 'auto-wake',
      type: 'sleep',
      hiddenFromTimeline: true,
      action: createField('end', 'system', 'activity_during_open_sleep'),
      linkedStartEventId: 'sleep-start',
      durationMinutes: createField(20, 'system', 'activity_during_open_sleep'),
    },
    {
      id: 'milk',
      type: 'feeding_milk',
      amountMl: createField(160, 'inferred', 'profile_or_age_default'),
    },
  ]);

  assert.equal(summary.sleepMinutes, 20);
  assert.equal(summary.milkCount, 1);
});



test('buildTodayContext summarizes last care events and provenance counts', () => {
  const context = buildTodayContext([
    {
      id: 'milk-1',
      type: 'feeding_milk',
      occurredAt: createField('2026-05-30T09:00:00.000Z', 'explicit', 'typed_time'),
      amountMl: createField(120, 'inferred', 'profile_or_age_default'),
    },
    {
      id: 'diaper-1',
      type: 'diaper',
      occurredAt: createField('2026-05-30T09:30:00.000Z', 'system', 'current_time'),
      diaperKind: createField('dirty', 'explicit', 'keyword'),
    },
    {
      id: 'sleep-1',
      type: 'sleep',
      action: createField('start', 'explicit', 'sleep_keyword'),
      status: 'ongoing_or_predicted',
      startAt: createField('2026-05-30T09:45:00.000Z', 'system', 'current_time'),
    },
  ], { now: new Date('2026-05-30T10:00:00.000Z'), selectedDay: '2026-05-30', today: '2026-05-30' });

  assert.equal(context.lastMilk.label, '1h ago');
  assert.equal(context.lastMilk.amountMl, 120);
  assert.equal(context.lastDiaper.label, '30m ago');
  assert.equal(context.lastDiaper.diaperKind, 'dirty');
  assert.equal(context.sleep.state, 'ongoing');
  assert.equal(context.sleep.minutes, 15);
  assert.equal(context.inferredFieldCount, 1);
});


test('buildWindowSummary counts only the rolling window and clips overlapping sleep', () => {
  const events = [
    {
      id: 'sleep-overlap',
      type: 'sleep',
      action: createField('start', 'explicit', 'sleep_keyword'),
      status: 'completed',
      startAt: createField('2026-05-30T09:00:00.000Z', 'explicit', 'typed_time'),
      endAt: createField('2026-05-30T11:00:00.000Z', 'explicit', 'typed_time'),
      durationMinutes: createField(120, 'explicit', 'typed_duration'),
    },
    {
      id: 'old-milk',
      type: 'feeding_milk',
      occurredAt: createField('2026-05-30T09:30:00.000Z', 'explicit', 'typed_time'),
      amountMl: createField(90, 'explicit', 'typed_amount'),
    },
    {
      id: 'recent-milk',
      type: 'feeding_milk',
      occurredAt: createField('2026-05-30T12:00:00.000Z', 'explicit', 'typed_time'),
      amountMl: createField(120, 'explicit', 'typed_amount'),
    },
  ];
  const options = {
    start: new Date('2026-05-30T10:00:00.000Z'),
    end: new Date('2026-05-31T10:00:00.000Z'),
  };

  const windowEvents = filterEventsForWindow(events, options);
  const summary = buildWindowSummary(events, options);

  assert.deepEqual(windowEvents.map((event) => event.id), ['sleep-overlap', 'recent-milk']);
  assert.equal(summary.sleepMinutes, 60);
  assert.equal(summary.milkCount, 1);
  assert.equal(summary.milkAmountMl, 120);
});
