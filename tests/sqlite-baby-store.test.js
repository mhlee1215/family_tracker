import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createField } from '../src/domain/baby-events.js';
import { SQLiteBabyStore } from '../src/server/db/sqlite-baby-store.js';

test('SQLiteBabyStore saves raw logs with structured events', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const rawLog = {
    id: 'rawlog-test-001',
    familyId: 'local-family',
    babyId: 'local-baby',
    authorId: 'local-user',
    rawText: '분유 먹음',
    inputAt: '2026-05-23T14:00:00.000Z',
    timezone: 'UTC',
  };
  const event = {
    id: 'event-test-001',
    rawLogId: rawLog.id,
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    rawText: rawLog.rawText,
    type: 'feeding_milk',
    occurredAt: createField(rawLog.inputAt, 'system', 'current_time'),
    amountMl: createField(160, 'inferred', 'profile_or_age_default', 0.62),
  };

  const saved = store.saveLogWithEvents(rawLog, [event]);
  const events = store.listEvents({ limit: 10 });
  store.close();

  assert.equal(saved.rawText, '분유 먹음');
  assert.equal(saved.events.length, 1);
  assert.equal(events[0].amountMl.value, 160);
});

test('SQLiteBabyStore saves editable baby profile defaults', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);

  const profile = store.saveProfile({
    babyId: 'local-baby',
    babyName: 'Ari',
    birthDate: '2026-01-01',
    milkAmountMlOverride: 155,
    napDurationMinutesOverride: 50,
  });
  store.close();

  assert.equal(profile.babyName, 'Ari');
  assert.equal(profile.milkAmountMlOverride, 155);
  assert.equal(profile.napDurationMinutesOverride, 50);
});

test('SQLiteBabyStore separates sessions and family scopes by user', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const first = store.upsertUser({
    provider: 'dev',
    providerId: 'admin',
    email: 'admin@local.dev',
    name: 'Admin',
    familyId: 'family-admin',
  });
  const second = store.upsertUser({
    provider: 'google',
    providerId: 'google-001',
    email: 'parent@example.com',
    name: 'Parent',
  });
  const session = store.createSession({
    sessionId: 'session-test-001',
    userId: first.id,
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  store.close();

  assert.equal(session.user.email, 'admin@local.dev');
  assert.equal(first.familyId, 'family-admin');
  assert.notEqual(first.familyId, second.familyId);
});

test('SQLiteBabyStore updates an existing event after sleep completion', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const rawLog = {
    id: 'rawlog-test-sleep',
    familyId: 'local-family',
    babyId: 'local-baby',
    authorId: 'local-user',
    rawText: '낮잠',
    inputAt: '2026-05-23T13:00:00.000Z',
    timezone: 'UTC',
  };
  const sleep = {
    id: 'event-test-sleep-start',
    rawLogId: rawLog.id,
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    rawText: rawLog.rawText,
    type: 'sleep',
    action: createField('start', 'explicit', 'sleep_keyword'),
    startAt: createField(rawLog.inputAt, 'system', 'current_time'),
    status: 'ongoing_or_predicted',
  };

  store.saveLogWithEvents(rawLog, [sleep]);
  store.updateEvent({
    ...sleep,
    status: 'completed',
    endAt: createField('2026-05-23T14:00:00.000Z', 'system', 'open_sleep_session'),
    durationMinutes: createField(60, 'system', 'open_sleep_session'),
  });
  const updated = store.getEvent(sleep.id);
  store.close();

  assert.equal(updated.status, 'completed');
  assert.equal(updated.durationMinutes.value, 60);
});

test('SQLiteBabyStore lists events by local calendar day', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const rawLog = {
    id: 'rawlog-test-local-day',
    familyId: 'local-family',
    babyId: 'local-baby',
    authorId: 'local-user',
    rawText: '분유',
    inputAt: '2026-05-23T06:30:00.000Z',
    timezone: 'America/Los_Angeles',
  };
  const event = {
    id: 'event-test-local-day',
    rawLogId: rawLog.id,
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    rawText: rawLog.rawText,
    type: 'feeding_milk',
    occurredAt: createField(rawLog.inputAt, 'explicit', 'user_time'),
  };

  store.saveLogWithEvents(rawLog, [event]);
  const previousLocalDay = store.listEventsForDay('2026-05-22', {
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    timezone: rawLog.timezone,
  });
  const utcDay = store.listEventsForDay('2026-05-23', {
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    timezone: 'UTC',
  });
  const selectedLocalDay = store.listEventsForDay('2026-05-23', {
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    timezone: rawLog.timezone,
  });
  store.close();

  assert.equal(previousLocalDay.length, 1);
  assert.equal(utcDay.length, 1);
  assert.equal(selectedLocalDay.length, 0);
});

test('SQLiteBabyStore rolls open daily tasks forward and records completions', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const [mom] = store.ensureDefaultTaskAssignees('family-admin');

  const task = store.createTask({
    id: 'task-test-001',
    familyId: 'family-admin',
    title: 'Wash bottles',
    assigneeId: mom.id,
    dueDate: '2026-05-23',
  });
  const nextDayOpenTasks = store.listTasksForDay('2026-05-24', { familyId: 'family-admin' });
  const completed = store.updateTask(task.id, {
    status: 'done',
    completedAt: '2026-05-24T15:00:00.000Z',
    completedBy: 'user-admin',
  }, { familyId: 'family-admin' });
  const todayTasks = store.listTasksForDay('2026-05-24', { familyId: 'family-admin' });
  const overview = store.listTaskOverview({ familyId: 'family-admin' });
  store.close();

  assert.equal(nextDayOpenTasks.length, 1);
  assert.equal(nextDayOpenTasks[0].title, 'Wash bottles');
  assert.equal(completed.status, 'done');
  assert.equal(todayTasks[0].status, 'done');
  assert.equal(overview[0].completedBy, 'user-admin');
});

test('SQLiteBabyStore supports due modes and visibility rules', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const [mom] = store.ensureDefaultTaskAssignees('family-admin');

  const asap = store.createTask({
    id: 'task-due-asap',
    familyId: 'family-admin',
    title: 'Refill wipes',
    assigneeId: mom.id,
    dueMode: 'asap',
    dueDate: '2026-05-23',
  });
  const someday = store.createTask({
    id: 'task-due-someday',
    familyId: 'family-admin',
    title: 'Sort photos',
    assigneeId: mom.id,
    dueMode: 'someday',
    dueDate: '2026-05-30',
  });
  const beforeDate = store.createTask({
    id: 'task-due-before',
    familyId: 'family-admin',
    title: 'Buy formula',
    assigneeId: mom.id,
    dueMode: 'before_date',
    dueDate: '2026-05-24',
  });

  const tasksForDay = store.listTasksForDay('2026-05-24', { familyId: 'family-admin' });
  const allTasks = store.listAllTasks({ familyId: 'family-admin' });
  store.close();

  assert.equal(asap.dueMode, 'asap');
  assert.equal(someday.dueMode, 'someday');
  assert.equal(beforeDate.dueMode, 'before_date');
  assert.equal(tasksForDay.some((task) => task.id === 'task-due-asap'), true);
  assert.equal(tasksForDay.some((task) => task.id === 'task-due-someday'), true);
  assert.equal(tasksForDay.some((task) => task.id === 'task-due-before'), true);
  assert.equal(allTasks.length, 3);
});
