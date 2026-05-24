import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseEvent, serializeEvent } from '../../domain/baby-events.js';
import { createDefaultProfile, defaultBabyId, defaultFamilyId } from '../../domain/profile-defaults.js';

export const defaultDatabasePath = join(process.cwd(), '.family-tracker', 'family-tracker.sqlite');

export class SQLiteBabyStore {
  constructor(databasePath = defaultDatabasePath) {
    this.databasePath = databasePath;
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.migrate();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        picture TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_id),
        UNIQUE(email)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS profiles (
        baby_id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        baby_name TEXT NOT NULL DEFAULT '',
        birth_date TEXT NOT NULL DEFAULT '',
        milk_amount_ml_override INTEGER,
        nap_duration_minutes_override INTEGER,
        solid_amount_override TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS raw_logs (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        input_at TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS baby_events (
        id TEXT PRIMARY KEY,
        raw_log_id TEXT NOT NULL,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        type TEXT NOT NULL,
        occurred_at TEXT,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_log_id) REFERENCES raw_logs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_raw_logs_family_baby ON raw_logs(family_id, baby_id, input_at);
      CREATE INDEX IF NOT EXISTS idx_baby_events_family_baby ON baby_events(family_id, baby_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `);
  }

  upsertUser(user) {
    const now = new Date().toISOString();
    const familyId = user.familyId || `family-${stableUserKey(user.email || user.providerId)}`;
    const userId = user.id || `user-${stableUserKey(user.email || user.providerId)}`;
    this.db.prepare(`
      INSERT INTO users (id, family_id, provider, provider_id, email, name, picture, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_id) DO UPDATE SET
        email = excluded.email,
        name = excluded.name,
        picture = excluded.picture,
        updated_at = excluded.updated_at
    `).run(
      userId,
      familyId,
      user.provider,
      user.providerId,
      user.email,
      user.name || '',
      user.picture || '',
      now,
      now,
    );
    return this.getUserByProvider(user.provider, user.providerId) || this.getUser(userId);
  }

  getUser(userId) {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return row ? rowToUser(row) : null;
  }

  getUserByProvider(provider, providerId) {
    const row = this.db.prepare('SELECT * FROM users WHERE provider = ? AND provider_id = ?').get(provider, providerId);
    return row ? rowToUser(row) : null;
  }

  createSession({ sessionId, userId, expiresAt }) {
    this.db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(sessionId, userId, expiresAt);
    return this.getSession(sessionId);
  }

  getSession(sessionId) {
    const row = this.db.prepare(`
      SELECT
        sessions.id AS session_id,
        sessions.expires_at,
        users.*
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.expires_at > ?
    `).get(sessionId, new Date().toISOString());
    if (!row) return null;
    return {
      id: row.session_id,
      expiresAt: row.expires_at,
      user: rowToUser(row),
    };
  }

  deleteSession(sessionId) {
    this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }

  getProfile(babyId = defaultBabyId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const row = this.db.prepare('SELECT * FROM profiles WHERE baby_id = ? AND family_id = ?').get(babyId, familyId);
    if (!row) return createDefaultProfile({ babyId, familyId });
    return {
      familyId: row.family_id,
      babyId: row.baby_id,
      babyName: row.baby_name,
      birthDate: row.birth_date,
      milkAmountMlOverride: row.milk_amount_ml_override,
      napDurationMinutesOverride: row.nap_duration_minutes_override,
      solidAmountOverride: row.solid_amount_override,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveProfile(profile) {
    const next = createDefaultProfile(profile);
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO profiles (
        baby_id, family_id, baby_name, birth_date, milk_amount_ml_override,
        nap_duration_minutes_override, solid_amount_override, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(baby_id) DO UPDATE SET
        family_id = excluded.family_id,
        baby_name = excluded.baby_name,
        birth_date = excluded.birth_date,
        milk_amount_ml_override = excluded.milk_amount_ml_override,
        nap_duration_minutes_override = excluded.nap_duration_minutes_override,
        solid_amount_override = excluded.solid_amount_override,
        updated_at = excluded.updated_at
    `).run(
      next.babyId,
      next.familyId,
      next.babyName,
      next.birthDate,
      next.milkAmountMlOverride,
      next.napDurationMinutesOverride,
      next.solidAmountOverride,
      now,
      now,
    );
    return this.getProfile(next.babyId);
  }

  saveLogWithEvents(rawLog, events) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare(`
        INSERT INTO raw_logs (id, family_id, baby_id, author_id, raw_text, input_at, timezone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        rawLog.id,
        rawLog.familyId || defaultFamilyId,
        rawLog.babyId || defaultBabyId,
        rawLog.authorId || 'local-user',
        rawLog.rawText,
        rawLog.inputAt,
        rawLog.timezone || 'UTC',
        rawLog.createdAt || rawLog.inputAt,
      );

      const insertEvent = this.db.prepare(`
        INSERT INTO baby_events (id, raw_log_id, family_id, baby_id, type, occurred_at, event_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      events.forEach((event) => {
        insertEvent.run(
          event.id,
          rawLog.id,
          event.familyId || rawLog.familyId || defaultFamilyId,
          event.babyId || rawLog.babyId || defaultBabyId,
          event.type,
          event.occurredAt?.value || event.startAt?.value || event.endAt?.value || rawLog.inputAt,
          serializeEvent(event),
          event.createdAt || rawLog.inputAt,
        );
      });

      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getRawLog(rawLog.id);
  }

  getRawLog(rawLogId) {
    const row = this.db.prepare('SELECT * FROM raw_logs WHERE id = ?').get(rawLogId);
    if (!row) return null;
    return {
      id: row.id,
      familyId: row.family_id,
      babyId: row.baby_id,
      authorId: row.author_id,
      rawText: row.raw_text,
      inputAt: row.input_at,
      timezone: row.timezone,
      createdAt: row.created_at,
      events: this.listEvents({ rawLogId: row.id }),
    };
  }

  listEvents(options = {}) {
    if (options.rawLogId) {
      return this.db
        .prepare('SELECT * FROM baby_events WHERE raw_log_id = ? ORDER BY created_at ASC, rowid ASC')
        .all(options.rawLogId)
        .map(rowToEvent);
    }

    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const limit = Number.isInteger(options.limit) ? options.limit : 200;
    return this.db
      .prepare(`
        SELECT * FROM baby_events
        WHERE family_id = ? AND baby_id = ?
        ORDER BY occurred_at DESC, created_at DESC, rowid DESC
        LIMIT ?
      `)
      .all(familyId, babyId, limit)
      .map(rowToEvent);
  }

  listEventsForDay(day, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const start = `${day}T00:00:00.000Z`;
    const end = `${day}T23:59:59.999Z`;
    return this.db
      .prepare(`
        SELECT * FROM baby_events
        WHERE family_id = ? AND baby_id = ? AND occurred_at BETWEEN ? AND ?
        ORDER BY occurred_at ASC, created_at ASC, rowid ASC
      `)
      .all(familyId, babyId, start, end)
      .map(rowToEvent);
  }
}

function rowToEvent(row) {
  return {
    ...parseEvent(row.event_json),
    id: row.id,
    rawLogId: row.raw_log_id,
    createdAt: row.created_at,
  };
}

function rowToUser(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    provider: row.provider,
    providerId: row.provider_id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stableUserKey(value = '') {
  return String(value || 'local')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'local';
}
