import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseEvent, serializeEvent } from '../../domain/baby-events.js';
import { createDefaultProfile, defaultBabyId, defaultFamilyId } from '../../domain/profile-defaults.js';
import { localDateKeyFromIso, utcRangeForLocalDay } from '../../utils/time.js';

export const defaultDatabasePath = join(process.cwd(), '.family-tracker', 'family-tracker.sqlite');

const legacyDevAdminFamilyId = 'family-admin';
const legacyDevAdminBabyId = 'family-admin-baby';
const currentDevAdminFamilyId = 'family-admin-dev';
const currentDevAdminBabyId = 'family-admin-dev-baby';

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
        birth_time TEXT NOT NULL DEFAULT '',
        timezone TEXT NOT NULL DEFAULT '',
        height_cm REAL,
        head_cm REAL,
        weight_g INTEGER,
        apgar_percent INTEGER,
        milk_amount_ml_override INTEGER,
        nap_duration_minutes_override INTEGER,
        solid_amount_override TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS growth_records (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        recorded_for TEXT NOT NULL DEFAULT 'custom',
        occurred_date TEXT NOT NULL,
        occurred_time TEXT NOT NULL DEFAULT '',
        height_cm REAL,
        head_cm REAL,
        weight_g INTEGER,
        apgar_percent INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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

      CREATE TABLE IF NOT EXISTS task_assignees (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#0066cc',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS task_items (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        title TEXT NOT NULL,
        assignee_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        due_date TEXT NOT NULL,
        due_mode TEXT NOT NULL DEFAULT 'on_date',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        completed_by TEXT,
        FOREIGN KEY (assignee_id) REFERENCES task_assignees(id)
      );

      CREATE TABLE IF NOT EXISTS action_logs (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        module TEXT NOT NULL,
        baby_id TEXT NOT NULL DEFAULT '',
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        undone_at TEXT,
        undone_by TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_growth_records_family_baby ON growth_records(family_id, baby_id, occurred_date);
      CREATE INDEX IF NOT EXISTS idx_raw_logs_family_baby ON raw_logs(family_id, baby_id, input_at);
      CREATE INDEX IF NOT EXISTS idx_baby_events_family_baby ON baby_events(family_id, baby_id, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_task_assignees_family ON task_assignees(family_id, name);
      CREATE INDEX IF NOT EXISTS idx_task_items_family_day ON task_items(family_id, due_date, status);
      CREATE INDEX IF NOT EXISTS idx_action_logs_family_module ON action_logs(family_id, module, created_at);
    `);
    try { this.db.exec(`ALTER TABLE task_items ADD COLUMN due_mode TEXT NOT NULL DEFAULT 'on_date';`); } catch {}
    try { this.db.exec(`ALTER TABLE action_logs ADD COLUMN baby_id TEXT NOT NULL DEFAULT '';`); } catch {}
    try { this.db.exec(`ALTER TABLE action_logs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';`); } catch {}
    try { this.db.exec(`ALTER TABLE action_logs ADD COLUMN undone_at TEXT;`); } catch {}
    try { this.db.exec(`ALTER TABLE action_logs ADD COLUMN undone_by TEXT;`); } catch {}
    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN birth_time TEXT NOT NULL DEFAULT '';`); } catch {}
    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT '';`); } catch {}
    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN height_cm REAL;`); } catch {}
    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN head_cm REAL;`); } catch {}
    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN weight_g INTEGER;`); } catch {}
    try { this.db.exec(`ALTER TABLE profiles ADD COLUMN apgar_percent INTEGER;`); } catch {}
    this.migrateLegacyDevAdminFamily();
  }

  migrateLegacyDevAdminFamily() {
    this.db.exec('BEGIN');
    try {
      const targetProfile = this.db.prepare('SELECT baby_id FROM profiles WHERE baby_id = ?').get(currentDevAdminBabyId);
      if (!targetProfile) {
        this.db.prepare(`
          UPDATE profiles
          SET family_id = ?, baby_id = ?
          WHERE family_id = ? AND baby_id = ?
        `).run(currentDevAdminFamilyId, currentDevAdminBabyId, legacyDevAdminFamilyId, legacyDevAdminBabyId);
      }
      this.db.prepare(`
        UPDATE growth_records
        SET family_id = ?, baby_id = ?
        WHERE family_id = ? AND baby_id = ?
      `).run(currentDevAdminFamilyId, currentDevAdminBabyId, legacyDevAdminFamilyId, legacyDevAdminBabyId);
      this.db.prepare(`
        UPDATE raw_logs
        SET family_id = ?, baby_id = ?
        WHERE family_id = ? AND baby_id = ?
      `).run(currentDevAdminFamilyId, currentDevAdminBabyId, legacyDevAdminFamilyId, legacyDevAdminBabyId);
      this.db.prepare(`
        UPDATE baby_events
        SET family_id = ?, baby_id = ?, event_json = REPLACE(REPLACE(event_json, ?, ?), ?, ?)
        WHERE family_id = ? AND baby_id = ?
      `).run(
        currentDevAdminFamilyId,
        currentDevAdminBabyId,
        legacyDevAdminFamilyId,
        currentDevAdminFamilyId,
        legacyDevAdminBabyId,
        currentDevAdminBabyId,
        legacyDevAdminFamilyId,
        legacyDevAdminBabyId,
      );
      this.db.prepare(`
        UPDATE action_logs
        SET family_id = ?,
            baby_id = CASE WHEN baby_id = ? THEN ? ELSE baby_id END,
            metadata_json = REPLACE(REPLACE(metadata_json, ?, ?), ?, ?)
        WHERE family_id = ?
      `).run(
        currentDevAdminFamilyId,
        legacyDevAdminBabyId,
        currentDevAdminBabyId,
        legacyDevAdminFamilyId,
        currentDevAdminFamilyId,
        legacyDevAdminBabyId,
        currentDevAdminBabyId,
        legacyDevAdminFamilyId,
      );
      this.db.prepare('UPDATE task_assignees SET family_id = ? WHERE family_id = ?')
        .run(currentDevAdminFamilyId, legacyDevAdminFamilyId);
      this.db.prepare('UPDATE task_items SET family_id = ? WHERE family_id = ?')
        .run(currentDevAdminFamilyId, legacyDevAdminFamilyId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
      birthTime: row.birth_time,
      timezone: row.timezone || '',
      heightCm: row.height_cm,
      headCm: row.head_cm,
      weightG: row.weight_g,
      apgarPercent: row.apgar_percent,
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
        baby_id, family_id, baby_name, birth_date, birth_time, timezone, height_cm, head_cm, weight_g, apgar_percent,
        milk_amount_ml_override, nap_duration_minutes_override, solid_amount_override, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(baby_id) DO UPDATE SET
        family_id = excluded.family_id,
        baby_name = excluded.baby_name,
        birth_date = excluded.birth_date,
        birth_time = excluded.birth_time,
        timezone = excluded.timezone,
        height_cm = excluded.height_cm,
        head_cm = excluded.head_cm,
        weight_g = excluded.weight_g,
        apgar_percent = excluded.apgar_percent,
        milk_amount_ml_override = excluded.milk_amount_ml_override,
        nap_duration_minutes_override = excluded.nap_duration_minutes_override,
        solid_amount_override = excluded.solid_amount_override,
        updated_at = excluded.updated_at
    `).run(
      next.babyId,
      next.familyId,
      next.babyName,
      next.birthDate,
      next.birthTime,
      next.timezone,
      next.heightCm,
      next.headCm,
      next.weightG,
      next.apgarPercent,
      next.milkAmountMlOverride,
      next.napDurationMinutesOverride,
      next.solidAmountOverride,
      now,
      now,
    );
    return this.getProfile(next.babyId, { familyId: next.familyId });
  }

  saveGrowthRecord(record) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO growth_records (
        id, family_id, baby_id, author_id, recorded_for, occurred_date, occurred_time,
        height_cm, head_cm, weight_g, apgar_percent, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.familyId || defaultFamilyId,
      record.babyId || defaultBabyId,
      record.authorId || '',
      record.recordedFor || 'custom',
      record.occurredDate,
      record.occurredTime || '',
      optionalNumber(record.heightCm),
      optionalNumber(record.headCm),
      optionalNumber(record.weightG),
      optionalNumber(record.apgarPercent),
      now,
    );
    return this.getGrowthRecord(record.id, { familyId: record.familyId || defaultFamilyId });
  }

  getGrowthRecord(id, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const row = this.db.prepare('SELECT * FROM growth_records WHERE id = ? AND family_id = ?').get(id, familyId);
    return row ? rowToGrowthRecord(row) : null;
  }

  listGrowthRecords(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const limit = Number.isInteger(options.limit) ? options.limit : 100;
    return this.db.prepare(`
      SELECT * FROM growth_records
      WHERE family_id = ? AND baby_id = ?
      ORDER BY occurred_date DESC, occurred_time DESC, created_at DESC
      LIMIT ?
    `).all(familyId, babyId, limit).map(rowToGrowthRecord);
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

  replaceRawLogWithEvents(rawLogId, patch, events, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const existing = this.getRawLog(rawLogId);
    if (!existing || existing.familyId !== familyId || existing.babyId !== babyId) return null;
    const rawText = patch.rawText || existing.rawText;
    const timezone = patch.timezone || existing.timezone || 'UTC';
    this.db.exec('BEGIN');
    try {
      this.db.prepare('UPDATE raw_logs SET raw_text = ?, timezone = ? WHERE id = ? AND family_id = ? AND baby_id = ?')
        .run(rawText, timezone, rawLogId, familyId, babyId);
      this.db.prepare('DELETE FROM baby_events WHERE raw_log_id = ? AND family_id = ? AND baby_id = ?')
        .run(rawLogId, familyId, babyId);
      const insertEvent = this.db.prepare(`
        INSERT INTO baby_events (id, raw_log_id, family_id, baby_id, type, occurred_at, event_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      events.forEach((event) => {
        insertEvent.run(
          event.id,
          rawLogId,
          event.familyId || familyId,
          event.babyId || babyId,
          event.type,
          event.occurredAt?.value || event.startAt?.value || event.endAt?.value || existing.inputAt,
          serializeEvent(event),
          event.createdAt || existing.inputAt,
        );
      });
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.getRawLog(rawLogId);
  }

  deleteRawLog(rawLogId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const existing = this.getRawLog(rawLogId);
    if (!existing || existing.familyId !== familyId || existing.babyId !== babyId) return false;
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM baby_events WHERE raw_log_id = ? AND family_id = ? AND baby_id = ?')
        .run(rawLogId, familyId, babyId);
      this.db.prepare('DELETE FROM raw_logs WHERE id = ? AND family_id = ? AND baby_id = ?')
        .run(rawLogId, familyId, babyId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return true;
  }

  updateEvent(event) {
    this.db.prepare(`
      UPDATE baby_events
      SET occurred_at = ?, event_json = ?
      WHERE id = ?
    `).run(
      event.occurredAt?.value || event.startAt?.value || event.endAt?.value || event.createdAt || new Date().toISOString(),
      serializeEvent(event),
      event.id,
    );
    return this.getEvent(event.id);
  }

  getEvent(eventId) {
    const row = this.db.prepare('SELECT * FROM baby_events WHERE id = ?').get(eventId);
    return row ? rowToEvent(row) : null;
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
    const { start, end } = utcRangeForLocalDay(day, options.timezone || 'UTC');
    return this.db
      .prepare(`
        SELECT * FROM baby_events
        WHERE family_id = ? AND baby_id = ? AND occurred_at >= ? AND occurred_at < ?
        ORDER BY occurred_at ASC, created_at ASC, rowid ASC
      `)
      .all(familyId, babyId, start, end)
      .map(rowToEvent);
  }



  getSyncState(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const babyVersion = maxIsoValue([
      this.getScalar('SELECT MAX(created_at) FROM action_logs WHERE family_id = ? AND module = ? AND baby_id = ?', [familyId, 'baby', babyId]),
      this.getScalar('SELECT MAX(created_at) FROM raw_logs WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
      this.getScalar('SELECT MAX(created_at) FROM baby_events WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
    ]);
    const taskVersion = maxIsoValue([
      this.getScalar('SELECT MAX(created_at) FROM action_logs WHERE family_id = ? AND module = ?', [familyId, 'task']),
      this.getScalar('SELECT MAX(updated_at) FROM task_items WHERE family_id = ?', [familyId]),
      this.getScalar('SELECT MAX(updated_at) FROM task_assignees WHERE family_id = ?', [familyId]),
    ]);
    const profileVersion = maxIsoValue([
      this.getScalar('SELECT MAX(updated_at) FROM profiles WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
      this.getScalar('SELECT MAX(created_at) FROM growth_records WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
    ]);
    return buildSyncState({ babyVersion, taskVersion, profileVersion });
  }

  getScalar(sql, args = []) {
    const row = this.db.prepare(sql).get(...args);
    if (!row) return '';
    return Object.values(row)[0] || '';
  }

  appendActionLog(entry) {
    const now = entry.createdAt || new Date().toISOString();
    this.db.prepare(`
      INSERT INTO action_logs (id, family_id, module, baby_id, entity_type, entity_id, action, actor_id, message, metadata_json, undone_at, undone_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.id,
      entry.familyId || defaultFamilyId,
      entry.module,
      entry.babyId || '',
      entry.entityType,
      entry.entityId,
      entry.action,
      entry.actorId || '',
      entry.message,
      JSON.stringify(entry.metadata || {}),
      entry.undoneAt || null,
      entry.undoneBy || null,
      now,
    );
    return this.getActionLog(entry.id, { familyId: entry.familyId || defaultFamilyId });
  }

  getActionLog(id, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const row = this.db.prepare('SELECT * FROM action_logs WHERE id = ? AND family_id = ?').get(id, familyId);
    return row ? rowToActionLog(row) : null;
  }


  markActionLogUndone(id, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const undoneAt = options.undoneAt || new Date().toISOString();
    const undoneBy = options.undoneBy || '';
    this.db.prepare('UPDATE action_logs SET undone_at = ?, undone_by = ? WHERE id = ? AND family_id = ? AND undone_at IS NULL')
      .run(undoneAt, undoneBy, id, familyId);
    return this.getActionLog(id, { familyId });
  }

  listActionLogs(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const module = options.module || 'baby';
    const limit = Number.isInteger(options.limit) ? options.limit : 30;
    return this.db.prepare(`
      SELECT * FROM action_logs
      WHERE family_id = ? AND module = ? AND (? != 'baby' OR baby_id = ?)
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    `).all(familyId, module, module, options.babyId || defaultBabyId, limit).map(rowToActionLog);
  }

  ensureDefaultTaskAssignees(familyId = defaultFamilyId) {
    const existing = this.listTaskAssignees({ familyId });
    if (existing.length) return existing;
    const now = new Date().toISOString();
    [
      { id: `assignee-${familyId}-mom`, name: 'Mom', color: '#0066cc' },
      { id: `assignee-${familyId}-dad`, name: 'Dad', color: '#34a853' },
    ].forEach((assignee) => {
      this.db.prepare(`
        INSERT OR IGNORE INTO task_assignees (id, family_id, name, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(assignee.id, familyId, assignee.name, assignee.color, now, now);
    });
    return this.listTaskAssignees({ familyId });
  }

  listTaskAssignees(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    return this.db
      .prepare('SELECT * FROM task_assignees WHERE family_id = ? ORDER BY created_at ASC, rowid ASC')
      .all(familyId)
      .map(rowToTaskAssignee);
  }

  createTaskAssignee(assignee) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_assignees (id, family_id, name, color, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      assignee.id,
      assignee.familyId || defaultFamilyId,
      assignee.name,
      assignee.color || '#0066cc',
      now,
      now,
    );
    return this.listTaskAssignees({ familyId: assignee.familyId || defaultFamilyId })
      .find((item) => item.id === assignee.id);
  }

  createTask(task) {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO task_items (
        id, family_id, title, assignee_id, status, due_date, due_mode, created_at, updated_at, completed_at, completed_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.familyId || defaultFamilyId,
      task.title,
      task.assigneeId,
      task.status || 'open',
      task.dueDate,
      task.dueMode || 'on_date',
      now,
      now,
      task.completedAt || null,
      task.completedBy || null,
    );
    return this.getTask(task.id, { familyId: task.familyId || defaultFamilyId });
  }

  getTask(taskId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const row = this.db.prepare(`
      SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
      FROM task_items
      LEFT JOIN task_assignees ON task_assignees.id = task_items.assignee_id
      WHERE task_items.id = ? AND task_items.family_id = ?
    `).get(taskId, familyId);
    return row ? rowToTask(row) : null;
  }

  updateTask(taskId, patch, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const existing = this.getTask(taskId, { familyId });
    if (!existing) return null;
    const now = new Date().toISOString();
    const status = patch.status || existing.status;
    const completedAt = status === 'done' ? patch.completedAt || existing.completedAt || now : null;
    const completedBy = status === 'done' ? patch.completedBy || existing.completedBy || null : null;
    this.db.prepare(`
      UPDATE task_items
      SET title = ?, assignee_id = ?, status = ?, due_date = ?, due_mode = ?, updated_at = ?, completed_at = ?, completed_by = ?
      WHERE id = ? AND family_id = ?
    `).run(
      Object.hasOwn(patch, 'title') && patch.title ? patch.title : existing.title,
      Object.hasOwn(patch, 'assigneeId') && patch.assigneeId ? patch.assigneeId : existing.assigneeId,
      status,
      Object.hasOwn(patch, 'dueDate') && patch.dueDate !== undefined ? patch.dueDate : existing.dueDate,
      Object.hasOwn(patch, 'dueMode') && patch.dueMode !== undefined ? patch.dueMode : existing.dueMode || 'on_date',
      now,
      completedAt,
      completedBy,
      taskId,
      familyId,
    );
    return this.getTask(taskId, { familyId });
  }


  deleteTask(taskId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const existing = this.getTask(taskId, { familyId });
    if (!existing) return false;
    this.db.prepare('DELETE FROM task_items WHERE id = ? AND family_id = ?').run(taskId, familyId);
    return true;
  }

  listTasksForDay(day, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    return this.db.prepare(`
      SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
      FROM task_items
      LEFT JOIN task_assignees ON task_assignees.id = task_items.assignee_id
      WHERE task_items.family_id = ?
        AND (
          (task_items.status = 'open' AND (
            (task_items.due_mode = 'on_date' AND task_items.due_date = ?)
            OR (task_items.due_mode = 'before_date' AND task_items.due_date >= ?)
            OR (task_items.due_mode in ('asap','someday'))
          ))
          OR (task_items.status = 'done' AND (
            substr(task_items.completed_at, 1, 10) = ?
            OR (task_items.due_mode = 'on_date' AND task_items.due_date = ?)
            OR (task_items.due_mode = 'before_date' AND task_items.due_date >= ?)
          ))
        )
      ORDER BY
        CASE task_items.status WHEN 'open' THEN 0 ELSE 1 END,
        task_items.created_at ASC,
        task_items.rowid ASC
    `).all(familyId, day, day, day, day, day).map(rowToTask);
  }

  listAllTasks(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    return this.db.prepare(`SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
      FROM task_items LEFT JOIN task_assignees ON task_assignees.id = task_items.assignee_id
      WHERE task_items.family_id = ? ORDER BY task_items.created_at DESC`).all(familyId).map(rowToTask);
  }

  clearTasksForFamily(familyId = defaultFamilyId) {
    this.db.prepare('DELETE FROM task_items WHERE family_id = ?').run(familyId);
  }

  listTaskOverview(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const limit = Number.isInteger(options.limit) ? options.limit : 40;
    const today = localDateKeyFromIso(options.now || new Date(), options.timezone || 'UTC');
    return this.db.prepare(`
      SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
      FROM task_items
      LEFT JOIN task_assignees ON task_assignees.id = task_items.assignee_id
      WHERE task_items.family_id = ? AND (
        task_items.status = 'done'
        OR (task_items.status = 'open' AND task_items.due_mode in ('on_date', 'before_date') AND task_items.due_date < ?)
      )
      ORDER BY
        CASE
          WHEN task_items.status = 'open' THEN 0
          ELSE 1
        END,
        COALESCE(task_items.completed_at, task_items.due_date) DESC,
        task_items.updated_at DESC
      LIMIT ?
    `).all(familyId, today, limit).map(rowToTask);
  }
}


function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function rowToActionLog(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    module: row.module,
    babyId: row.baby_id || '',
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    actorId: row.actor_id,
    message: row.message,
    metadata: parseJson(row.metadata_json, {}),
    undoneAt: row.undone_at,
    undoneBy: row.undone_by,
    canUndo: !row.undone_at && row.action !== 'undo',
    createdAt: row.created_at,
  };
}

function rowToGrowthRecord(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    babyId: row.baby_id,
    authorId: row.author_id,
    recordedFor: row.recorded_for,
    occurredDate: row.occurred_date,
    occurredTime: row.occurred_time,
    heightCm: row.height_cm,
    headCm: row.head_cm,
    weightG: row.weight_g,
    apgarPercent: row.apgar_percent,
    createdAt: row.created_at,
  };
}


function buildSyncState({ babyVersion = '', taskVersion = '', profileVersion = '' } = {}) {
  return {
    serverTime: new Date().toISOString(),
    modules: {
      baby: { version: babyVersion || '' },
      task: { version: taskVersion || '' },
      profile: { version: profileVersion || '' },
    },
  };
}

function maxIsoValue(values = []) {
  return values.filter(Boolean).sort().at(-1) || '';
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function rowToTaskAssignee(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTask(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || '',
    assigneeColor: row.assignee_color || '#0066cc',
    status: row.status,
    dueDate: row.due_date,
    dueMode: row.due_mode || 'on_date',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    completedBy: row.completed_by,
  };
}

function stableUserKey(value = '') {
  return String(value || 'local')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'local';
}
