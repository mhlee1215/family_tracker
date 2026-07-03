import { createClient as createNodeClient } from '@libsql/client';
import { createClient as createWebClient } from '@libsql/client/web';
import { parseEvent, serializeEvent } from '../../domain/baby-events.js';
import { createDefaultProfile, defaultBabyId, defaultFamilyId } from '../../domain/profile-defaults.js';
import { localDateKeyFromIso, utcRangeForLocalDay } from '../../utils/time.js';

const legacyDevAdminFamilyId = 'family-admin';
const legacyDevAdminBabyId = 'family-admin-baby';
const currentDevAdminFamilyId = 'family-admin-dev';
const currentDevAdminBabyId = 'family-admin-dev-baby';
const defaultTaskAssignees = Object.freeze([
  { key: 'mom', name: 'Mom', color: '#0066cc' },
  { key: 'dad', name: 'Dad', color: '#34a853' },
  { key: 'family', name: 'Family', color: '#7a7a7a' },
]);

export class TursoBabyStore {
  static async create(options = {}) {
    if (!options.url) throw new Error('TURSO_DATABASE_URL is required.');
    const createClient = resolveLibsqlClient(options.url);
    const store = new TursoBabyStore(createClient({
      url: options.url,
      authToken: options.authToken,
    }));
    await store.migrate();
    return store;
  }

  constructor(client) {
    this.client = client;
  }

  async close() {
    this.client.close?.();
  }

  async migrate() {
    await this.client.batch([
      `CREATE TABLE IF NOT EXISTS users (
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
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS profiles (
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
      )`,
      `CREATE TABLE IF NOT EXISTS growth_records (
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
      )`,
      `CREATE TABLE IF NOT EXISTS raw_logs (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        raw_text TEXT NOT NULL,
        input_at TEXT NOT NULL,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS baby_events (
        id TEXT PRIMARY KEY,
        raw_log_id TEXT NOT NULL,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        type TEXT NOT NULL,
        occurred_at TEXT,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (raw_log_id) REFERENCES raw_logs(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS task_assignees (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#0066cc',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS task_items (
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
      )`,
      `CREATE TABLE IF NOT EXISTS action_logs (
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
      )`,
      `CREATE TABLE IF NOT EXISTS notification_settings (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        milk_reminder_enabled INTEGER NOT NULL DEFAULT 0,
        milk_reminder_offset_minutes INTEGER NOT NULL DEFAULT 30,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, baby_id)
      )`,
      `CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        disabled_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, endpoint)
      )`,
      `CREATE TABLE IF NOT EXISTS notification_jobs (
        id TEXT PRIMARY KEY,
        family_id TEXT NOT NULL,
        baby_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        target_at TEXT NOT NULL,
        notify_at TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        dedupe_key TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        failure_reason TEXT NOT NULL DEFAULT '',
        sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(dedupe_key)
      )`,
      `CREATE TABLE IF NOT EXISTS camping_queries (
        family_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        queries_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (family_id, user_id)
      )`,
      'CREATE INDEX IF NOT EXISTS idx_growth_records_family_baby ON growth_records(family_id, baby_id, occurred_date)',
      'CREATE INDEX IF NOT EXISTS idx_raw_logs_family_baby ON raw_logs(family_id, baby_id, input_at)',
      'CREATE INDEX IF NOT EXISTS idx_baby_events_family_baby ON baby_events(family_id, baby_id, occurred_at)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_task_assignees_family ON task_assignees(family_id, name)',
      'CREATE INDEX IF NOT EXISTS idx_task_items_family_day ON task_items(family_id, due_date, status)',
      'CREATE INDEX IF NOT EXISTS idx_action_logs_family_module ON action_logs(family_id, module, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(family_id, user_id, disabled_at)',
      'CREATE INDEX IF NOT EXISTS idx_notification_jobs_due ON notification_jobs(status, notify_at)',
      'CREATE INDEX IF NOT EXISTS idx_notification_jobs_scope ON notification_jobs(family_id, baby_id, user_id, type, status)',
    ], 'write');
    await this.ensureTaskDueModeColumn();
    await this.ensureActionLogColumns();
    await this.ensureProfileBirthDetailColumns();
    await this.migrateLegacyDevAdminFamily();
  }

  async migrateLegacyDevAdminFamily() {
    const targetProfile = await this.client.execute({
      sql: 'SELECT baby_id FROM profiles WHERE baby_id = ?',
      args: [currentDevAdminBabyId],
    });
    const statements = [];
    if (!targetProfile.rows.length) {
      statements.push({
        sql: `UPDATE profiles
          SET family_id = ?, baby_id = ?
          WHERE family_id = ? AND baby_id = ?`,
        args: [currentDevAdminFamilyId, currentDevAdminBabyId, legacyDevAdminFamilyId, legacyDevAdminBabyId],
      });
    }
    statements.push(
      {
        sql: `UPDATE growth_records
          SET family_id = ?, baby_id = ?
          WHERE family_id = ? AND baby_id = ?`,
        args: [currentDevAdminFamilyId, currentDevAdminBabyId, legacyDevAdminFamilyId, legacyDevAdminBabyId],
      },
      {
        sql: `UPDATE raw_logs
          SET family_id = ?, baby_id = ?
          WHERE family_id = ? AND baby_id = ?`,
        args: [currentDevAdminFamilyId, currentDevAdminBabyId, legacyDevAdminFamilyId, legacyDevAdminBabyId],
      },
      {
        sql: `UPDATE baby_events
          SET family_id = ?, baby_id = ?, event_json = REPLACE(REPLACE(event_json, ?, ?), ?, ?)
          WHERE family_id = ? AND baby_id = ?`,
        args: [
          currentDevAdminFamilyId,
          currentDevAdminBabyId,
          legacyDevAdminFamilyId,
          currentDevAdminFamilyId,
          legacyDevAdminBabyId,
          currentDevAdminBabyId,
          legacyDevAdminFamilyId,
          legacyDevAdminBabyId,
        ],
      },
      {
        sql: `UPDATE action_logs
          SET family_id = ?,
              baby_id = CASE WHEN baby_id = ? THEN ? ELSE baby_id END,
              metadata_json = REPLACE(REPLACE(metadata_json, ?, ?), ?, ?)
          WHERE family_id = ?`,
        args: [
          currentDevAdminFamilyId,
          legacyDevAdminBabyId,
          currentDevAdminBabyId,
          legacyDevAdminFamilyId,
          currentDevAdminFamilyId,
          legacyDevAdminBabyId,
          currentDevAdminBabyId,
          legacyDevAdminFamilyId,
        ],
      },
      {
        sql: 'UPDATE task_assignees SET family_id = ? WHERE family_id = ?',
        args: [currentDevAdminFamilyId, legacyDevAdminFamilyId],
      },
      {
        sql: 'UPDATE task_items SET family_id = ? WHERE family_id = ?',
        args: [currentDevAdminFamilyId, legacyDevAdminFamilyId],
      },
    );
    await this.client.batch(statements, 'write');
  }

  async ensureTaskDueModeColumn() {
    try {
      await this.client.execute("ALTER TABLE task_items ADD COLUMN due_mode TEXT NOT NULL DEFAULT 'on_date'");
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('duplicate column name') && !message.includes('already exists')) throw error;
    }
  }

  async ensureActionLogColumns() {
    const columns = [
      "ALTER TABLE action_logs ADD COLUMN baby_id TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE action_logs ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
      'ALTER TABLE action_logs ADD COLUMN undone_at TEXT',
      'ALTER TABLE action_logs ADD COLUMN undone_by TEXT',
    ];
    for (const sql of columns) {
      try {
        await this.client.execute(sql);
      } catch (error) {
        const message = String(error?.message || '');
        if (!message.includes('duplicate column name') && !message.includes('already exists')) throw error;
      }
    }
  }

  async ensureProfileBirthDetailColumns() {
    await this.ignoreDuplicateColumn(`ALTER TABLE profiles ADD COLUMN birth_time TEXT NOT NULL DEFAULT ''`);
    await this.ignoreDuplicateColumn(`ALTER TABLE profiles ADD COLUMN timezone TEXT NOT NULL DEFAULT ''`);
    await this.ignoreDuplicateColumn('ALTER TABLE profiles ADD COLUMN height_cm REAL');
    await this.ignoreDuplicateColumn('ALTER TABLE profiles ADD COLUMN head_cm REAL');
    await this.ignoreDuplicateColumn('ALTER TABLE profiles ADD COLUMN weight_g INTEGER');
    await this.ignoreDuplicateColumn('ALTER TABLE profiles ADD COLUMN apgar_percent INTEGER');
  }

  async ignoreDuplicateColumn(sql) {
    try {
      await this.client.execute(sql);
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('duplicate column name') && !message.includes('already exists')) throw error;
    }
  }

  async upsertUser(user) {
    const now = new Date().toISOString();
    const familyId = user.familyId || `family-${stableUserKey(user.email || user.providerId)}`;
    const userId = user.id || `user-${stableUserKey(user.email || user.providerId)}`;
    await this.client.execute({
      sql: `INSERT INTO users (id, family_id, provider, provider_id, email, name, picture, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_id) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          picture = excluded.picture,
          updated_at = excluded.updated_at`,
      args: [userId, familyId, user.provider, user.providerId, user.email, user.name || '', user.picture || '', now, now],
    });
    return this.getUserByProvider(user.provider, user.providerId);
  }

  async getUser(userId) {
    const result = await this.client.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  async getUserByProvider(provider, providerId) {
    const result = await this.client.execute({ sql: 'SELECT * FROM users WHERE provider = ? AND provider_id = ?', args: [provider, providerId] });
    return result.rows[0] ? rowToUser(result.rows[0]) : null;
  }

  async createSession({ sessionId, userId, expiresAt }) {
    await this.client.execute({ sql: 'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', args: [sessionId, userId, expiresAt] });
    return this.getSession(sessionId);
  }

  async getSession(sessionId) {
    const result = await this.client.execute({
      sql: `SELECT sessions.id AS session_id, sessions.expires_at, users.*
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.id = ? AND sessions.expires_at > ?`,
      args: [sessionId, new Date().toISOString()],
    });
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.session_id,
      expiresAt: row.expires_at,
      user: rowToUser(row),
    };
  }

  async deleteSession(sessionId) {
    await this.client.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
  }

  async getProfile(babyId = defaultBabyId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({ sql: 'SELECT * FROM profiles WHERE baby_id = ? AND family_id = ?', args: [babyId, familyId] });
    const row = result.rows[0];
    if (!row) return createDefaultProfile({ babyId, familyId });
    return rowToProfile(row);
  }

  async saveProfile(profile) {
    const next = createDefaultProfile(profile);
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO profiles (
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
        updated_at = excluded.updated_at`,
      args: [
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
      ],
    });
    return this.getProfile(next.babyId, { familyId: next.familyId });
  }

  async saveGrowthRecord(record) {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO growth_records (
        id, family_id, baby_id, author_id, recorded_for, occurred_date, occurred_time,
        height_cm, head_cm, weight_g, apgar_percent, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
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
      ],
    });
    return this.getGrowthRecord(record.id, { familyId: record.familyId || defaultFamilyId });
  }

  async getGrowthRecord(id, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({ sql: 'SELECT * FROM growth_records WHERE id = ? AND family_id = ?', args: [id, familyId] });
    return result.rows[0] ? rowToGrowthRecord(result.rows[0]) : null;
  }

  async listGrowthRecords(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const limit = Number.isInteger(options.limit) ? options.limit : 100;
    const result = await this.client.execute({
      sql: `SELECT * FROM growth_records
        WHERE family_id = ? AND baby_id = ?
        ORDER BY occurred_date DESC, occurred_time DESC, created_at DESC
        LIMIT ?`,
      args: [familyId, babyId, limit],
    });
    return result.rows.map(rowToGrowthRecord);
  }

  async saveLogWithEvents(rawLog, events) {
    const statements = [{
      sql: 'INSERT INTO raw_logs (id, family_id, baby_id, author_id, raw_text, input_at, timezone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        rawLog.id,
        rawLog.familyId || defaultFamilyId,
        rawLog.babyId || defaultBabyId,
        rawLog.authorId || 'local-user',
        rawLog.rawText,
        rawLog.inputAt,
        rawLog.timezone || 'UTC',
        rawLog.createdAt || rawLog.inputAt,
      ],
    }];

    events.forEach((event) => {
      statements.push({
        sql: 'INSERT INTO baby_events (id, raw_log_id, family_id, baby_id, type, occurred_at, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          event.id,
          rawLog.id,
          event.familyId || rawLog.familyId || defaultFamilyId,
          event.babyId || rawLog.babyId || defaultBabyId,
          event.type,
          event.occurredAt?.value || event.startAt?.value || event.endAt?.value || rawLog.inputAt,
          serializeEvent(event),
          event.createdAt || rawLog.inputAt,
        ],
      });
    });

    await this.client.batch(statements, 'write');
    return this.getRawLog(rawLog.id);
  }

  async replaceRawLogWithEvents(rawLogId, patch, events, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const existing = await this.getRawLog(rawLogId);
    if (!existing || existing.familyId !== familyId || existing.babyId !== babyId) return null;
    const rawText = patch.rawText || existing.rawText;
    const timezone = patch.timezone || existing.timezone || 'UTC';
    const statements = [
      {
        sql: 'UPDATE raw_logs SET raw_text = ?, timezone = ? WHERE id = ? AND family_id = ? AND baby_id = ?',
        args: [rawText, timezone, rawLogId, familyId, babyId],
      },
      {
        sql: 'DELETE FROM baby_events WHERE raw_log_id = ? AND family_id = ? AND baby_id = ?',
        args: [rawLogId, familyId, babyId],
      },
    ];
    events.forEach((event) => {
      statements.push({
        sql: 'INSERT INTO baby_events (id, raw_log_id, family_id, baby_id, type, occurred_at, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [
          event.id,
          rawLogId,
          event.familyId || familyId,
          event.babyId || babyId,
          event.type,
          event.occurredAt?.value || event.startAt?.value || event.endAt?.value || existing.inputAt,
          serializeEvent(event),
          event.createdAt || existing.inputAt,
        ],
      });
    });
    await this.client.batch(statements, 'write');
    return this.getRawLog(rawLogId);
  }

  async deleteRawLog(rawLogId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const existing = await this.getRawLog(rawLogId);
    if (!existing || existing.familyId !== familyId || existing.babyId !== babyId) return false;
    await this.client.batch([
      { sql: 'DELETE FROM baby_events WHERE raw_log_id = ? AND family_id = ? AND baby_id = ?', args: [rawLogId, familyId, babyId] },
      { sql: 'DELETE FROM raw_logs WHERE id = ? AND family_id = ? AND baby_id = ?', args: [rawLogId, familyId, babyId] },
    ], 'write');
    return true;
  }

  async updateEvent(event) {
    await this.client.execute({
      sql: 'UPDATE baby_events SET occurred_at = ?, event_json = ? WHERE id = ?',
      args: [
        event.occurredAt?.value || event.startAt?.value || event.endAt?.value || event.createdAt || new Date().toISOString(),
        serializeEvent(event),
        event.id,
      ],
    });
    return this.getEvent(event.id);
  }

  async getEvent(eventId) {
    const result = await this.client.execute({ sql: 'SELECT * FROM baby_events WHERE id = ?', args: [eventId] });
    return result.rows[0] ? rowToEvent(result.rows[0]) : null;
  }

  async getRawLog(rawLogId) {
    const result = await this.client.execute({ sql: 'SELECT * FROM raw_logs WHERE id = ?', args: [rawLogId] });
    const row = result.rows[0];
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
      events: await this.listEvents({ rawLogId: row.id }),
    };
  }

  async listEvents(options = {}) {
    if (options.rawLogId) {
      const result = await this.client.execute({
        sql: 'SELECT * FROM baby_events WHERE raw_log_id = ? ORDER BY created_at ASC, rowid ASC',
        args: [options.rawLogId],
      });
      return result.rows.map(rowToEvent);
    }

    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const limit = Number.isInteger(options.limit) ? options.limit : 200;
    const result = await this.client.execute({
      sql: `SELECT * FROM baby_events
        WHERE family_id = ? AND baby_id = ?
        ORDER BY occurred_at DESC, created_at DESC, rowid DESC
        LIMIT ?`,
      args: [familyId, babyId, limit],
    });
    return result.rows.map(rowToEvent);
  }

  async listEventsForDay(day, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const { start, end } = utcRangeForLocalDay(day, options.timezone || 'UTC');
    const result = await this.client.execute({
      sql: `SELECT * FROM baby_events
        WHERE family_id = ? AND baby_id = ? AND occurred_at >= ? AND occurred_at < ?
        ORDER BY occurred_at ASC, created_at ASC, rowid ASC`,
      args: [familyId, babyId, start, end],
    });
    return result.rows.map(rowToEvent);
  }

  async ensureDefaultTaskAssignees(familyId = defaultFamilyId) {
    const now = new Date().toISOString();
    await this.dedupeTaskAssignees(familyId);
    let existing = await this.listTaskAssignees({ familyId });
    const insertStatements = [];
    for (const assignee of defaultTaskAssignees) {
      if (!existing.some((item) => normalizedAssigneeName(item.name) === normalizedAssigneeName(assignee.name))) {
        insertStatements.push({
          sql: `INSERT OR IGNORE INTO task_assignees (id, family_id, name, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
          args: [`assignee-${familyId}-${assignee.key}`, familyId, assignee.name, assignee.color, now, now],
        });
        existing = [...existing, { name: assignee.name }];
      }
    }
    if (insertStatements.length) await this.client.batch(insertStatements, 'write');
    await this.dedupeTaskAssignees(familyId);
    return this.listTaskAssignees({ familyId });
  }

  async dedupeTaskAssignees(familyId = defaultFamilyId) {
    const grouped = new Map();
    for (const assignee of await this.listTaskAssignees({ familyId })) {
      const key = normalizedAssigneeName(assignee.name);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(assignee);
    }
    const now = new Date().toISOString();
    const statements = [];
    for (const [key, assignees] of grouped.entries()) {
      const canonical = assignees[0];
      const defaultAssignee = defaultTaskAssignees.find((item) => normalizedAssigneeName(item.name) === key);
      if (defaultAssignee) {
        statements.push({
          sql: 'UPDATE task_assignees SET name = ?, color = ?, updated_at = ? WHERE id = ? AND family_id = ?',
          args: [defaultAssignee.name, defaultAssignee.color, now, canonical.id, familyId],
        });
      }
      for (const duplicate of assignees.slice(1)) {
        statements.push({
          sql: 'UPDATE task_items SET assignee_id = ?, updated_at = ? WHERE family_id = ? AND assignee_id = ?',
          args: [canonical.id, now, familyId, duplicate.id],
        });
        statements.push({
          sql: 'DELETE FROM task_assignees WHERE family_id = ? AND id = ?',
          args: [familyId, duplicate.id],
        });
      }
    }
    if (statements.length) await this.client.batch(statements, 'write');
  }

  async listTaskAssignees(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({
      sql: 'SELECT * FROM task_assignees WHERE family_id = ? ORDER BY created_at ASC, rowid ASC',
      args: [familyId],
    });
    return result.rows.map(rowToTaskAssignee);
  }



  async getSyncState(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const [babyActionVersion, rawLogVersion, babyEventVersion, taskActionVersion, taskVersion, assigneeVersion, profileVersion, growthVersion] = await Promise.all([
      this.getScalar('SELECT MAX(created_at) FROM action_logs WHERE family_id = ? AND module = ? AND baby_id = ?', [familyId, 'baby', babyId]),
      this.getScalar('SELECT MAX(created_at) FROM raw_logs WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
      this.getScalar('SELECT MAX(created_at) FROM baby_events WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
      this.getScalar('SELECT MAX(created_at) FROM action_logs WHERE family_id = ? AND module = ?', [familyId, 'task']),
      this.getScalar('SELECT MAX(updated_at) FROM task_items WHERE family_id = ?', [familyId]),
      this.getScalar('SELECT MAX(updated_at) FROM task_assignees WHERE family_id = ?', [familyId]),
      this.getScalar('SELECT MAX(updated_at) FROM profiles WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
      this.getScalar('SELECT MAX(created_at) FROM growth_records WHERE family_id = ? AND baby_id = ?', [familyId, babyId]),
    ]);
    return buildSyncState({
      babyVersion: maxIsoValue([babyActionVersion, rawLogVersion, babyEventVersion]),
      taskVersion: maxIsoValue([taskActionVersion, taskVersion, assigneeVersion]),
      profileVersion: maxIsoValue([profileVersion, growthVersion]),
    });
  }

  async getScalar(sql, args = []) {
    const result = await this.client.execute({ sql, args });
    const row = result.rows[0];
    if (!row) return '';
    return Object.values(row)[0] || '';
  }

  async getNotificationSettings(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const userId = options.userId || '';
    const result = await this.client.execute({
      sql: `SELECT * FROM notification_settings
        WHERE family_id = ? AND baby_id = ? AND user_id = ?`,
      args: [familyId, babyId, userId],
    });
    return result.rows[0] ? rowToNotificationSettings(result.rows[0]) : defaultNotificationSettings({ familyId, babyId, userId });
  }

  async saveNotificationSettings(settings, options = {}) {
    const familyId = options.familyId || settings.familyId || defaultFamilyId;
    const babyId = options.babyId || settings.babyId || defaultBabyId;
    const userId = options.userId || settings.userId || '';
    const now = new Date().toISOString();
    const id = settings.id || `notif-settings-${stableUserKey(userId)}-${stableUserKey(babyId)}`;
    await this.client.execute({
      sql: `INSERT INTO notification_settings (
        id, family_id, baby_id, user_id, milk_reminder_enabled, milk_reminder_offset_minutes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, baby_id) DO UPDATE SET
        milk_reminder_enabled = excluded.milk_reminder_enabled,
        milk_reminder_offset_minutes = excluded.milk_reminder_offset_minutes,
        updated_at = excluded.updated_at`,
      args: [
        id,
        familyId,
        babyId,
        userId,
        settings.milkReminderEnabled ? 1 : 0,
        settings.milkReminderOffsetMinutes || 30,
        now,
        now,
      ],
    });
    return this.getNotificationSettings({ familyId, babyId, userId });
  }

  async getCampingQueries(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const userId = options.userId || '';
    const result = await this.client.execute({
      sql: 'SELECT queries_json FROM camping_queries WHERE family_id = ? AND user_id = ?',
      args: [familyId, userId],
    });
    return parseJson(result.rows[0]?.queries_json, []);
  }

  async saveCampingQueries(queries = [], options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const userId = options.userId || '';
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO camping_queries (family_id, user_id, queries_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(family_id, user_id) DO UPDATE SET
          queries_json = excluded.queries_json,
          updated_at = excluded.updated_at`,
      args: [familyId, userId, JSON.stringify(Array.isArray(queries) ? queries : []), now],
    });
    return this.getCampingQueries({ familyId, userId });
  }

  async savePushSubscription(subscription, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const userId = options.userId || '';
    const now = new Date().toISOString();
    const id = options.id || `push-sub-${stableUserKey(userId)}-${stableUserKey(subscription.endpoint)}`;
    await this.client.execute({
      sql: `INSERT INTO push_subscriptions (
        id, family_id, user_id, endpoint, p256dh, auth, user_agent, disabled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(user_id, endpoint) DO UPDATE SET
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        disabled_at = NULL,
        updated_at = excluded.updated_at`,
      args: [
        id,
        familyId,
        userId,
        subscription.endpoint,
        subscription.keys?.p256dh || '',
        subscription.keys?.auth || '',
        options.userAgent || '',
        now,
        now,
      ],
    });
    const subscriptions = await this.listPushSubscriptionsForUser({ familyId, userId });
    return subscriptions.find((item) => item.endpoint === subscription.endpoint) || null;
  }

  async listPushSubscriptionsForUser(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const userId = options.userId || '';
    const result = await this.client.execute({
      sql: `SELECT * FROM push_subscriptions
        WHERE family_id = ? AND user_id = ? AND disabled_at IS NULL
        ORDER BY updated_at DESC`,
      args: [familyId, userId],
    });
    return result.rows.map(rowToPushSubscription);
  }

  async disablePushSubscription(endpoint, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const userId = options.userId || '';
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE push_subscriptions
        SET disabled_at = ?, updated_at = ?
        WHERE family_id = ? AND user_id = ? AND endpoint = ?`,
      args: [now, now, familyId, userId, endpoint],
    });
  }

  async disablePushSubscriptionByEndpoint(endpoint) {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE push_subscriptions
        SET disabled_at = ?, updated_at = ?
        WHERE endpoint = ?`,
      args: [now, now, endpoint],
    });
  }

  async replacePendingNotificationJob(job, options = {}) {
    const familyId = options.familyId || job.familyId || defaultFamilyId;
    const babyId = options.babyId || job.babyId || defaultBabyId;
    const userId = options.userId || job.userId || '';
    const type = options.type || job.type;
    const now = new Date().toISOString();
    await this.client.batch([
      {
        sql: `UPDATE notification_jobs
          SET status = 'canceled', updated_at = ?
          WHERE family_id = ? AND baby_id = ? AND user_id = ? AND type = ? AND status = 'pending' AND dedupe_key <> ?`,
        args: [now, familyId, babyId, userId, type, job.dedupeKey],
      },
      {
        sql: `INSERT INTO notification_jobs (
          id, family_id, baby_id, user_id, type, target_at, notify_at, title, body,
          dedupe_key, metadata_json, status, failure_reason, sent_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', NULL, ?, ?)
        ON CONFLICT(dedupe_key) DO UPDATE SET
          notify_at = excluded.notify_at,
          title = excluded.title,
          body = excluded.body,
          metadata_json = excluded.metadata_json,
          status = 'pending',
          failure_reason = '',
          sent_at = NULL,
          updated_at = excluded.updated_at`,
        args: [
          job.id,
          familyId,
          babyId,
          userId,
          type,
          job.targetAt,
          job.notifyAt,
          job.title,
          job.body,
          job.dedupeKey,
          JSON.stringify(job.metadata || {}),
          now,
          now,
        ],
      },
    ], 'write');
    return (await this.getNotificationJob(job.id)) || this.getNotificationJobByDedupeKey(job.dedupeKey);
  }

  async cancelPendingNotificationJobs(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const babyId = options.babyId || defaultBabyId;
    const userId = options.userId || '';
    const type = options.type || 'milk_reminder';
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE notification_jobs
        SET status = 'canceled', updated_at = ?
        WHERE family_id = ? AND baby_id = ? AND user_id = ? AND type = ? AND status = 'pending'`,
      args: [now, familyId, babyId, userId, type],
    });
  }

  async listDueNotificationJobs(options = {}) {
    const now = options.now || new Date().toISOString();
    const limit = Number.isInteger(options.limit) ? options.limit : 50;
    const result = await this.client.execute({
      sql: `SELECT * FROM notification_jobs
        WHERE status = 'pending' AND notify_at <= ?
        ORDER BY notify_at ASC, created_at ASC
        LIMIT ?`,
      args: [now, limit],
    });
    return result.rows.map(rowToNotificationJob);
  }

  async getNotificationJob(id) {
    const result = await this.client.execute({ sql: 'SELECT * FROM notification_jobs WHERE id = ?', args: [id] });
    return result.rows[0] ? rowToNotificationJob(result.rows[0]) : null;
  }

  async getNotificationJobByDedupeKey(dedupeKey) {
    const result = await this.client.execute({ sql: 'SELECT * FROM notification_jobs WHERE dedupe_key = ?', args: [dedupeKey] });
    return result.rows[0] ? rowToNotificationJob(result.rows[0]) : null;
  }

  async markNotificationJobSent(id, options = {}) {
    const now = options.sentAt || new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE notification_jobs
        SET status = 'sent', sent_at = ?, updated_at = ?
        WHERE id = ?`,
      args: [now, now, id],
    });
  }

  async markNotificationJobFailed(id, options = {}) {
    const now = options.failedAt || new Date().toISOString();
    await this.client.execute({
      sql: `UPDATE notification_jobs
        SET status = ?, failure_reason = ?, updated_at = ?
        WHERE id = ?`,
      args: [options.status || 'failed', String(options.failureReason || '').slice(0, 500), now, id],
    });
  }

  async appendActionLog(entry) {
    const now = entry.createdAt || new Date().toISOString();
    await this.client.execute({
      sql: 'INSERT INTO action_logs (id, family_id, module, baby_id, entity_type, entity_id, action, actor_id, message, metadata_json, undone_at, undone_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [entry.id, entry.familyId || defaultFamilyId, entry.module, entry.babyId || '', entry.entityType, entry.entityId, entry.action, entry.actorId || '', entry.message, JSON.stringify(entry.metadata || {}), entry.undoneAt || null, entry.undoneBy || null, now],
    });
    return this.getActionLog(entry.id, { familyId: entry.familyId || defaultFamilyId });
  }

  async getActionLog(id, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({ sql: 'SELECT * FROM action_logs WHERE id = ? AND family_id = ?', args: [id, familyId] });
    return result.rows[0] ? rowToActionLog(result.rows[0]) : null;
  }


  async markActionLogUndone(id, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const undoneAt = options.undoneAt || new Date().toISOString();
    const undoneBy = options.undoneBy || '';
    await this.client.execute({
      sql: 'UPDATE action_logs SET undone_at = ?, undone_by = ? WHERE id = ? AND family_id = ? AND undone_at IS NULL',
      args: [undoneAt, undoneBy, id, familyId],
    });
    return this.getActionLog(id, { familyId });
  }

  async listActionLogs(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const module = options.module || 'baby';
    const limit = Number.isInteger(options.limit) ? options.limit : 30;
    const result = await this.client.execute({
      sql: "SELECT * FROM action_logs WHERE family_id = ? AND module = ? AND (? != 'baby' OR baby_id = ?) ORDER BY created_at DESC, rowid DESC LIMIT ?",
      args: [familyId, module, module, options.babyId || defaultBabyId, limit],
    });
    return result.rows.map(rowToActionLog);
  }

  async createTaskAssignee(assignee) {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO task_assignees (id, family_id, name, color, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        assignee.id,
        assignee.familyId || defaultFamilyId,
        assignee.name,
        assignee.color || '#0066cc',
        now,
        now,
      ],
    });
    const assignees = await this.listTaskAssignees({ familyId: assignee.familyId || defaultFamilyId });
    return assignees.find((item) => item.id === assignee.id);
  }

  async createTask(task) {
    const now = new Date().toISOString();
    await this.client.execute({
      sql: `INSERT INTO task_items (
        id, family_id, title, assignee_id, status, due_date, due_mode, created_at, updated_at, completed_at, completed_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
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
      ],
    });
    return this.getTask(task.id, { familyId: task.familyId || defaultFamilyId });
  }

  async getTask(taskId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({
      sql: `SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
        FROM task_items
        LEFT JOIN task_assignees ON task_assignees.id = task_items.assignee_id
        WHERE task_items.id = ? AND task_items.family_id = ?`,
      args: [taskId, familyId],
    });
    return result.rows[0] ? rowToTask(result.rows[0]) : null;
  }

  async updateTask(taskId, patch, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const existing = await this.getTask(taskId, { familyId });
    if (!existing) return null;
    const now = new Date().toISOString();
    const status = patch.status || existing.status;
    const completedAt = status === 'done' ? patch.completedAt || existing.completedAt || now : null;
    const completedBy = status === 'done' ? patch.completedBy || existing.completedBy || null : null;
    await this.client.execute({
      sql: `UPDATE task_items
        SET title = ?, assignee_id = ?, status = ?, due_date = ?, due_mode = ?, updated_at = ?, completed_at = ?, completed_by = ?
        WHERE id = ? AND family_id = ?`,
      args: [
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
      ],
    });
    return this.getTask(taskId, { familyId });
  }


  async deleteTask(taskId, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const existing = await this.getTask(taskId, { familyId });
    if (!existing) return false;
    await this.client.execute({ sql: 'DELETE FROM task_items WHERE id = ? AND family_id = ?', args: [taskId, familyId] });
    return true;
  }

  async listTasksForDay(day, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const { start, end } = utcRangeForLocalDay(day, options.timezone || 'UTC');
    const result = await this.client.execute({
      sql: `SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
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
              (task_items.completed_at >= ? AND task_items.completed_at < ?)
              OR (task_items.due_mode = 'on_date' AND task_items.due_date = ?)
              OR (task_items.due_mode = 'before_date' AND task_items.due_date >= ?)
            ))
          )
        ORDER BY
          CASE task_items.status WHEN 'open' THEN 0 ELSE 1 END,
          task_items.created_at ASC,
          task_items.rowid ASC`,
      args: [familyId, day, day, start, end, day, day],
    });
    return result.rows.map(rowToTask);
  }

  async listAllTasks(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({
      sql: `SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
        FROM task_items LEFT JOIN task_assignees ON task_assignees.id = task_items.assignee_id
        WHERE task_items.family_id = ? ORDER BY task_items.created_at DESC`,
      args: [familyId],
    });
    return result.rows.map(rowToTask);
  }

  async clearTasksForFamily(familyId = defaultFamilyId) {
    await this.client.execute({ sql: 'DELETE FROM task_items WHERE family_id = ?', args: [familyId] });
  }

  async listTaskOverview(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const limit = Number.isInteger(options.limit) ? options.limit : 40;
    const today = localDateKeyFromIso(options.now || new Date(), options.timezone || 'UTC');
    const result = await this.client.execute({
      sql: `SELECT task_items.*, task_assignees.name AS assignee_name, task_assignees.color AS assignee_color
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
        LIMIT ?`,
      args: [familyId, today, limit],
    });
    return result.rows.map(rowToTask);
  }
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

function resolveLibsqlClient(url = '') {
  if (/^(libsql|https?):\/\//.test(url)) return createWebClient;
  return createNodeClient;
}

function rowToProfile(row) {
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

function defaultNotificationSettings({ familyId = defaultFamilyId, babyId = defaultBabyId, userId = '' } = {}) {
  return {
    id: '',
    familyId,
    babyId,
    userId,
    milkReminderEnabled: false,
    milkReminderOffsetMinutes: 30,
    createdAt: '',
    updatedAt: '',
  };
}

function rowToNotificationSettings(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    babyId: row.baby_id,
    userId: row.user_id,
    milkReminderEnabled: Boolean(row.milk_reminder_enabled),
    milkReminderOffsetMinutes: Number(row.milk_reminder_offset_minutes) || 30,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPushSubscription(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    userId: row.user_id,
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
    userAgent: row.user_agent || '',
    disabledAt: row.disabled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToNotificationJob(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    babyId: row.baby_id,
    userId: row.user_id,
    type: row.type,
    targetAt: row.target_at,
    notifyAt: row.notify_at,
    title: row.title,
    body: row.body,
    dedupeKey: row.dedupe_key,
    metadata: parseJson(row.metadata_json, {}),
    status: row.status,
    failureReason: row.failure_reason || '',
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

function normalizedAssigneeName(name = '') {
  return String(name).trim().toLowerCase();
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
