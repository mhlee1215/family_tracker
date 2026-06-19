import test from 'node:test';
import assert from 'node:assert/strict';
import { createField } from '../src/domain/baby-events.js';
import { buildMilkReminderJob, normalizeNotificationSettings } from '../src/domain/milk-reminder.js';

function milk(id, occurredAt, amountMl = 100) {
  return {
    id,
    type: 'feeding_milk',
    occurredAt: createField(occurredAt, 'explicit', 'typed_time'),
    amountMl: createField(amountMl, 'explicit', 'typed_amount'),
  };
}

test('normalizeNotificationSettings defaults invalid lead times to 30 minutes', () => {
  assert.deepEqual(normalizeNotificationSettings({ milkReminderEnabled: true, milkReminderOffsetMinutes: 999 }), {
    milkReminderEnabled: true,
    milkReminderOffsetMinutes: 30,
  });
});

test('buildMilkReminderJob schedules a milk push before the forecast next time', () => {
  const job = buildMilkReminderJob(
    { milkReminderEnabled: true, milkReminderOffsetMinutes: 45 },
    [
      milk('m1', '2026-06-18T08:00:00.000Z'),
      milk('m2', '2026-06-18T11:00:00.000Z'),
      milk('m3', '2026-06-18T14:00:00.000Z'),
    ],
    {
      familyId: 'family-1',
      babyId: 'baby-1',
      userId: 'user-1',
      now: new Date('2026-06-18T15:00:00.000Z'),
      periodDays: 7,
    },
  );

  assert.equal(job.type, 'milk_reminder');
  assert.equal(job.targetAt, '2026-06-18T17:00:00.000Z');
  assert.equal(job.notifyAt, '2026-06-18T16:15:00.000Z');
  assert.equal(job.metadata.offsetMinutes, 45);
  assert.match(job.dedupeKey, /^milk-reminder:baby-1:2026-06-18T17:00:00.000Z:45$/);
});

test('buildMilkReminderJob formats notification body in the family timezone', () => {
  const job = buildMilkReminderJob(
    { milkReminderEnabled: true, milkReminderOffsetMinutes: 30 },
    [
      milk('m1', '2026-06-18T19:00:00.000Z'),
      milk('m2', '2026-06-18T22:00:00.000Z'),
      milk('m3', '2026-06-19T01:00:00.000Z'),
    ],
    {
      babyId: 'baby-1',
      now: new Date('2026-06-19T02:30:00.000Z'),
      periodDays: 7,
      timezone: 'America/Los_Angeles',
    },
  );

  assert.equal(job.targetAt, '2026-06-19T04:00:00.000Z');
  assert.equal(job.body, 'Next milk is estimated around 9:00 PM.');
  assert.equal(job.metadata.timezone, 'America/Los_Angeles');
});

test('buildMilkReminderJob returns null when reminders are disabled or forecast is overdue', () => {
  const events = [
    milk('m1', '2026-06-18T08:00:00.000Z'),
    milk('m2', '2026-06-18T11:00:00.000Z'),
    milk('m3', '2026-06-18T14:00:00.000Z'),
  ];

  assert.equal(buildMilkReminderJob({ milkReminderEnabled: false }, events, {
    now: new Date('2026-06-18T15:00:00.000Z'),
  }), null);
  assert.equal(buildMilkReminderJob({ milkReminderEnabled: true }, events, {
    now: new Date('2026-06-18T18:00:00.000Z'),
  }), null);
});
