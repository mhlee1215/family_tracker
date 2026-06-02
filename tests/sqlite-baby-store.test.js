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
    birthTime: '20:06',
    heightCm: 52.1,
    headCm: 34,
    weightG: 3600,
    apgarPercent: 99,
    milkAmountMlOverride: 155,
    napDurationMinutesOverride: 50,
  });
  store.close();

  assert.equal(profile.babyName, 'Ari');
  assert.equal(profile.birthTime, '20:06');
  assert.equal(profile.heightCm, 52.1);
  assert.equal(profile.headCm, 34);
  assert.equal(profile.weightG, 3600);
  assert.equal(profile.apgarPercent, 99);
  assert.equal(profile.milkAmountMlOverride, 155);
  assert.equal(profile.napDurationMinutesOverride, 50);
});

test('SQLiteBabyStore saves dated growth records as history', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);

  store.saveGrowthRecord({
    id: 'growth-test-birth',
    familyId: 'local-family',
    babyId: 'local-baby',
    authorId: 'local-user',
    recordedFor: 'birth',
    occurredDate: '2026-01-01',
    occurredTime: '20:06',
    heightCm: 52.1,
    headCm: 34,
    weightG: 3600,
    apgarPercent: 99,
  });
  store.saveGrowthRecord({
    id: 'growth-test-checkup',
    familyId: 'local-family',
    babyId: 'local-baby',
    authorId: 'local-user',
    recordedFor: 'custom',
    occurredDate: '2026-02-01',
    heightCm: 55.2,
    headCm: 36,
    weightG: 4300,
  });

  const records = store.listGrowthRecords({ familyId: 'local-family', babyId: 'local-baby' });
  store.close();

  assert.equal(records.length, 2);
  assert.equal(records[0].id, 'growth-test-checkup');
  assert.equal(records[0].heightCm, 55.2);
  assert.equal(records[1].recordedFor, 'birth');
  assert.equal(records[1].occurredTime, '20:06');
  assert.equal(records[1].apgarPercent, 99);
});

test('SQLiteBabyStore separates sessions and family scopes by user', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const first = store.upsertUser({
    provider: 'dev',
    providerId: 'admin-test',
    email: 'admin-test@local.dev',
    name: 'Admin Test',
    familyId: 'family-admin-test',
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

  assert.equal(session.user.email, 'admin-test@local.dev');
  assert.equal(first.familyId, 'family-admin-test');
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

test('SQLiteBabyStore shows on-date tasks only on their due day and records completions', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const [mom] = store.ensureDefaultTaskAssignees('family-admin-test');

  const task = store.createTask({
    id: 'task-test-001',
    familyId: 'family-admin-test',
    title: 'Wash bottles',
    assigneeId: mom.id,
    dueDate: '2026-05-23',
  });
  const nextDayOpenTasks = store.listTasksForDay('2026-05-24', { familyId: 'family-admin-test' });
  const completed = store.updateTask(task.id, {
    status: 'done',
    completedAt: '2026-05-24T15:00:00.000Z',
    completedBy: 'user-admin-test',
  }, { familyId: 'family-admin-test' });
  const todayTasks = store.listTasksForDay('2026-05-24', { familyId: 'family-admin-test' });
  const overview = store.listTaskOverview({ familyId: 'family-admin-test' });
  store.close();

  assert.equal(nextDayOpenTasks.length, 0);
  assert.equal(completed.status, 'done');
  assert.equal(todayTasks[0].status, 'done');
  assert.equal(overview[0].completedBy, 'user-admin-test');
});

test('SQLiteBabyStore supports due modes and visibility rules', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const [mom] = store.ensureDefaultTaskAssignees('family-admin-test');

  const asap = store.createTask({
    id: 'task-due-asap',
    familyId: 'family-admin-test',
    title: 'Refill wipes',
    assigneeId: mom.id,
    dueMode: 'asap',
    dueDate: '2026-05-23',
  });
  const someday = store.createTask({
    id: 'task-due-someday',
    familyId: 'family-admin-test',
    title: 'Sort photos',
    assigneeId: mom.id,
    dueMode: 'someday',
    dueDate: '2026-05-30',
  });
  const beforeDate = store.createTask({
    id: 'task-due-before',
    familyId: 'family-admin-test',
    title: 'Buy formula',
    assigneeId: mom.id,
    dueMode: 'before_date',
    dueDate: '2026-05-24',
  });

  const tasksForDay = store.listTasksForDay('2026-05-24', { familyId: 'family-admin-test' });
  const futureTasksForDay = store.listTasksForDay('2026-05-25', { familyId: 'family-admin-test' });
  const allTasks = store.listAllTasks({ familyId: 'family-admin-test' });
  store.close();

  assert.equal(asap.dueMode, 'asap');
  assert.equal(someday.dueMode, 'someday');
  assert.equal(beforeDate.dueMode, 'before_date');
  assert.equal(tasksForDay.some((task) => task.id === 'task-due-asap'), true);
  assert.equal(tasksForDay.some((task) => task.id === 'task-due-someday'), true);
  assert.equal(tasksForDay.some((task) => task.id === 'task-due-before'), true);
  assert.equal(futureTasksForDay.some((task) => task.id === 'task-due-before'), false);
  assert.equal(allTasks.length, 3);
});

test('SQLiteBabyStore replaces and deletes raw logs with structured events', () => {
  const store = new SQLiteBabyStore(':memory:');
  const rawLog = {
    id: 'raw-edit',
    familyId: 'family-1',
    babyId: 'baby-1',
    authorId: 'author-1',
    rawText: 'formula',
    inputAt: '2026-05-28T10:00:00.000Z',
    timezone: 'UTC',
  };
  const originalEvent = {
    id: 'event-original',
    rawLogId: rawLog.id,
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
    type: 'feeding_milk',
    rawText: rawLog.rawText,
    occurredAt: createField(rawLog.inputAt, 'system', 'current_time'),
    amountMl: createField(120, 'inferred', 'default'),
  };
  store.saveLogWithEvents(rawLog, [originalEvent]);

  const replacementEvent = {
    ...originalEvent,
    id: 'event-replacement',
    rawText: 'updated formula',
    amountMl: createField(150, 'explicit', 'user_text'),
  };
  const updated = store.replaceRawLogWithEvents(rawLog.id, { rawText: 'updated formula' }, [replacementEvent], {
    familyId: rawLog.familyId,
    babyId: rawLog.babyId,
  });

  assert.equal(updated.rawText, 'updated formula');
  assert.equal(updated.events.length, 1);
  assert.equal(updated.events[0].id, 'event-replacement');
  assert.equal(store.getEvent('event-original'), null);

  assert.equal(store.deleteRawLog(rawLog.id, { familyId: rawLog.familyId, babyId: rawLog.babyId }), true);
  assert.equal(store.getRawLog(rawLog.id), null);
  assert.equal(store.getEvent('event-replacement'), null);
  store.close();
});

test('SQLiteBabyStore keeps due completed tasks on their selected day', () => {
  const store = new SQLiteBabyStore(':memory:');
  const [assignee] = store.ensureDefaultTaskAssignees('family-1');
  const task = store.createTask({
    id: 'task-done-selected-day',
    familyId: 'family-1',
    title: 'Wash bottles',
    assigneeId: assignee.id,
    dueMode: 'on_date',
    dueDate: '2026-05-27',
  });
  store.updateTask(task.id, {
    status: 'done',
    completedAt: '2026-05-28T10:00:00.000Z',
    completedBy: 'author-1',
  }, { familyId: 'family-1' });

  const selectedDayTasks = store.listTasksForDay('2026-05-27', { familyId: 'family-1' });
  assert.equal(selectedDayTasks.length, 1);
  assert.equal(selectedDayTasks[0].status, 'done');
  store.close();
});

test('SQLiteBabyStore records module-scoped action logs', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);

  store.appendActionLog({
    id: 'action-baby-add',
    familyId: 'family-admin-test',
    module: 'baby',
    babyId: 'local-baby',
    entityType: 'record',
    entityId: 'rawlog-1',
    action: 'add',
    actorId: 'user-admin-test',
    message: 'added baby record "formula"',
    metadata: { after: { rawLogId: 'rawlog-1' } },
    createdAt: '2026-05-24T10:00:00.000Z',
  });
  store.appendActionLog({
    id: 'action-task-complete',
    familyId: 'family-admin-test',
    module: 'task',
    entityType: 'task',
    entityId: 'task-1',
    action: 'complete',
    actorId: 'user-admin-test',
    message: 'completed task "Wash bottles"',
    createdAt: '2026-05-24T11:00:00.000Z',
  });

  const babyActions = store.listActionLogs({ familyId: 'family-admin-test', module: 'baby' });
  const taskActions = store.listActionLogs({ familyId: 'family-admin-test', module: 'task' });
  const marked = store.markActionLogUndone('action-baby-add', { familyId: 'family-admin-test', undoneAt: '2026-05-24T12:00:00.000Z', undoneBy: 'user-admin-test' });
  store.close();

  assert.equal(babyActions.length, 1);
  assert.equal(babyActions[0].action, 'add');
  assert.equal(babyActions[0].message, 'added baby record "formula"');
  assert.equal(babyActions[0].metadata.after.rawLogId, 'rawlog-1');
  assert.equal(babyActions[0].canUndo, true);
  assert.equal(marked.canUndo, false);
  assert.equal(marked.undoneBy, 'user-admin-test');
  assert.equal(taskActions.length, 1);
  assert.equal(taskActions[0].action, 'complete');
});


test('SQLiteBabyStore deletes tasks for undoing task add transactions', () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'family-tracker-db-')), 'test.sqlite');
  const store = new SQLiteBabyStore(dbPath);
  const [mom] = store.ensureDefaultTaskAssignees('family-admin-test');
  const task = store.createTask({
    id: 'task-undo-add',
    familyId: 'family-admin-test',
    title: 'Undo me',
    assigneeId: mom.id,
    dueDate: '2026-05-24',
  });

  assert.equal(store.deleteTask(task.id, { familyId: 'family-admin-test' }), true);
  assert.equal(store.getTask(task.id, { familyId: 'family-admin-test' }), null);
  store.close();
});
