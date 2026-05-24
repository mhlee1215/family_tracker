import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/domain/baby-events.js';
import { buildTodaySummary } from '../src/domain/summary-builder.js';

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

