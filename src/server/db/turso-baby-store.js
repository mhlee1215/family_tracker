import { parseEvent, serializeEvent } from '../../domain/baby-events.js';
import { createDefaultProfile, defaultBabyId, defaultFamilyId } from '../../domain/profile-defaults.js';
import { utcRangeForLocalDay } from '../../utils/time.js';

export class TursoBabyStore {
  static async create(options = {}) {
    const { createClient } = await import('@libsql/client');
    if (!options.url) throw new Error('TURSO_DATABASE_URL is required.');
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
        milk_amount_ml_override INTEGER,
        nap_duration_minutes_override INTEGER,
        solid_amount_override TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      'CREATE INDEX IF NOT EXISTS idx_raw_logs_family_baby ON raw_logs(family_id, baby_id, input_at)',
      'CREATE INDEX IF NOT EXISTS idx_baby_events_family_baby ON baby_events(family_id, baby_id, occurred_at)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
    ], 'write');
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
        updated_at = excluded.updated_at`,
      args: [
        next.babyId,
        next.familyId,
        next.babyName,
        next.birthDate,
        next.milkAmountMlOverride,
        next.napDurationMinutesOverride,
        next.solidAmountOverride,
        now,
        now,
      ],
    });
    return this.getProfile(next.babyId, { familyId: next.familyId });
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
}

function rowToProfile(row) {
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
