import { parseEvent, serializeEvent } from '../../domain/baby-events.js';
import { createDefaultProfile, defaultBabyId, defaultFamilyId } from '../../domain/profile-defaults.js';
import { utcRangeForLocalDay } from '../../utils/time.js';

export class TursoBabyStore {
  static async create(options = {}) {
    if (!options.url) throw new Error('TURSO_DATABASE_URL is required.');
    const { createClient } = await import(resolveLibsqlClientModule(options.url));
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
      'CREATE INDEX IF NOT EXISTS idx_growth_records_family_baby ON growth_records(family_id, baby_id, occurred_date)',
      'CREATE INDEX IF NOT EXISTS idx_raw_logs_family_baby ON raw_logs(family_id, baby_id, input_at)',
      'CREATE INDEX IF NOT EXISTS idx_baby_events_family_baby ON baby_events(family_id, baby_id, occurred_at)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_task_assignees_family ON task_assignees(family_id, name)',
      'CREATE INDEX IF NOT EXISTS idx_task_items_family_day ON task_items(family_id, due_date, status)',
    ], 'write');
    await this.ensureTaskDueModeColumn();
    await this.ensureProfileBirthDetailColumns();
  }

  async ensureTaskDueModeColumn() {
    try {
      await this.client.execute("ALTER TABLE task_items ADD COLUMN due_mode TEXT NOT NULL DEFAULT 'on_date'");
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('duplicate column name') && !message.includes('already exists')) throw error;
    }
  }

  async ensureProfileBirthDetailColumns() {
    await this.ignoreDuplicateColumn(`ALTER TABLE profiles ADD COLUMN birth_time TEXT NOT NULL DEFAULT ''`);
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
        baby_id, family_id, baby_name, birth_date, birth_time, height_cm, head_cm, weight_g, apgar_percent,
        milk_amount_ml_override, nap_duration_minutes_override, solid_amount_override, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(baby_id) DO UPDATE SET
        family_id = excluded.family_id,
        baby_name = excluded.baby_name,
        birth_date = excluded.birth_date,
        birth_time = excluded.birth_time,
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
    const existing = await this.listTaskAssignees({ familyId });
    if (existing.length) return existing;
    const now = new Date().toISOString();
    await this.client.batch([
      {
        sql: `INSERT OR IGNORE INTO task_assignees (id, family_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: [`assignee-${familyId}-mom`, familyId, 'Mom', '#0066cc', now, now],
      },
      {
        sql: `INSERT OR IGNORE INTO task_assignees (id, family_id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: [`assignee-${familyId}-dad`, familyId, 'Dad', '#34a853', now, now],
      },
    ], 'write');
    return this.listTaskAssignees({ familyId });
  }

  async listTaskAssignees(options = {}) {
    const familyId = options.familyId || defaultFamilyId;
    const result = await this.client.execute({
      sql: 'SELECT * FROM task_assignees WHERE family_id = ? ORDER BY created_at ASC, rowid ASC',
      args: [familyId],
    });
    return result.rows.map(rowToTaskAssignee);
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
        patch.title || existing.title,
        patch.assigneeId || existing.assigneeId,
        status,
        patch.dueDate || existing.dueDate,
        patch.dueMode || existing.dueMode || 'on_date',
        now,
        completedAt,
        completedBy,
        taskId,
        familyId,
      ],
    });
    return this.getTask(taskId, { familyId });
  }

  async listTasksForDay(day, options = {}) {
    const familyId = options.familyId || defaultFamilyId;
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
              substr(task_items.completed_at, 1, 10) = ?
              OR (task_items.due_mode = 'on_date' AND task_items.due_date = ?)
              OR (task_items.due_mode = 'before_date' AND task_items.due_date >= ?)
            ))
          )
        ORDER BY
          CASE task_items.status WHEN 'open' THEN 0 ELSE 1 END,
          task_items.created_at ASC,
          task_items.rowid ASC`,
      args: [familyId, day, day, day, day, day],
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
    const today = new Date().toISOString().slice(0, 10);
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

function resolveLibsqlClientModule(url = '') {
  if (/^(libsql|https?):\/\//.test(url)) return '@libsql/client/web';
  return '@libsql/client';
}

function rowToProfile(row) {
  return {
    familyId: row.family_id,
    babyId: row.baby_id,
    babyName: row.baby_name,
    birthDate: row.birth_date,
    birthTime: row.birth_time,
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
