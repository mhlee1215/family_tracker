import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/domain/baby-events.js';
import { linkSleepSessions } from '../src/domain/sleep-session.js';

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

