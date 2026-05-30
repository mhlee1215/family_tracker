import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/domain/baby-events.js';
import { completedOpenSleepUpdate, createAutoWakeEvents, linkSleepSessions } from '../src/domain/sleep-session.js';

test('links wake-up event to the latest open sleep session', () => {
  const openSleep = {
    id: 'event-sleep-start',
    type: 'sleep',
    action: createField('start', 'explicit', 'sleep_keyword'),
    startAt: createField('2026-05-23T13:00:00.000Z', 'system', 'current_time'),
    status: 'ongoing_or_predicted',
  };
  const wake = {
    type: 'sleep',
    action: createField('end', 'explicit', 'completion_keyword'),
    endAt: createField('2026-05-23T14:10:00.000Z', 'system', 'current_time'),
    status: 'completed',
  };

  const [linked] = linkSleepSessions([wake], [openSleep]);

  assert.equal(linked.linkedStartEventId, openSleep.id);
  assert.equal(linked.startAt.value, openSleep.startAt.value);
  assert.equal(linked.durationMinutes.value, 70);
});

test('creates an automatic wake event when any awake-only activity is logged during open sleep', () => {
  const openSleep = {
    id: 'event-sleep-start',
    familyId: 'family-test',
    babyId: 'baby-test',
    type: 'sleep',
    action: createField('start', 'explicit', 'sleep_keyword'),
    startAt: createField('2026-05-23T13:00:00.000Z', 'system', 'current_time'),
    status: 'ongoing_or_predicted',
  };
  const awakeOnlyActivities = [
    { type: 'feeding_milk', occurredAt: createField('2026-05-23T14:00:00.000Z', 'system', 'current_time') },
    { type: 'feeding_solid', occurredAt: createField('2026-05-23T14:05:00.000Z', 'system', 'current_time') },
    { type: 'diaper', occurredAt: createField('2026-05-23T14:10:00.000Z', 'system', 'current_time') },
  ];

  for (const activity of awakeOnlyActivities) {
    const [autoWake] = createAutoWakeEvents([activity], [openSleep], { authorId: 'user-test' });

    assert.equal(autoWake.type, 'sleep');
    assert.equal(autoWake.linkedStartEventId, openSleep.id);
    assert.equal(autoWake.hiddenFromTimeline, true);
    assert.equal(autoWake.endAt.value, activity.occurredAt.value);
  }
});

test('uses the awake-only activity time when auto-closing sleep from mixed parsed events', () => {
  const openSleep = {
    id: 'event-sleep-start',
    familyId: 'family-test',
    babyId: 'baby-test',
    type: 'sleep',
    action: createField('start', 'explicit', 'sleep_keyword'),
    startAt: createField('2026-05-23T13:00:00.000Z', 'system', 'current_time'),
    status: 'ongoing_or_predicted',
  };
  const repeatedSleepStart = {
    type: 'sleep',
    action: createField('start', 'explicit', 'sleep_keyword'),
    startAt: createField('2026-05-23T13:30:00.000Z', 'system', 'current_time'),
    status: 'ongoing_or_predicted',
  };
  const diaper = {
    type: 'diaper',
    occurredAt: createField('2026-05-23T14:10:00.000Z', 'system', 'current_time'),
  };

  const [autoWake] = createAutoWakeEvents([repeatedSleepStart, diaper], [openSleep], { authorId: 'user-test' });

  assert.equal(autoWake.endAt.value, diaper.occurredAt.value);
  assert.equal(autoWake.durationMinutes.value, 70);
});

test('builds an update that completes the open sleep start event', () => {
  const openSleep = {
    id: 'event-sleep-start',
    type: 'sleep',
    action: createField('start', 'explicit', 'sleep_keyword'),
    startAt: createField('2026-05-23T13:00:00.000Z', 'system', 'current_time'),
    status: 'ongoing_or_predicted',
  };
  const endEvent = {
    id: 'event-sleep-end',
    type: 'sleep',
    linkedStartEventId: openSleep.id,
    endAt: createField('2026-05-23T14:15:00.000Z', 'system', 'current_time'),
  };

  const update = completedOpenSleepUpdate(endEvent, openSleep);

  assert.equal(update.status, 'completed');
  assert.equal(update.linkedEndEventId, endEvent.id);
  assert.equal(update.durationMinutes.value, 75);
});
