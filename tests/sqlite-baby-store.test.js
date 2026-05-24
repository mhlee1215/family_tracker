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
