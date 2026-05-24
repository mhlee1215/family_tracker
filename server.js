import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { parseBabyLogText } from './src/domain/baby-log-parser.js';
import { applyInferences } from './src/domain/inference-engine.js';
import { getProviderModelOptions, normalizeLLMProvider } from './src/domain/llm-provider.js';
import { completedOpenSleepUpdate, createAutoWakeEvents, findOpenSleep, linkSleepSessions } from './src/domain/sleep-session.js';
import { answerSimpleQuestion, buildTodaySummary } from './src/domain/summary-builder.js';
import { defaultAuthorId } from './src/domain/profile-defaults.js';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createGoogleAuthUrl,
  createOAuthStateCookie,
  createSessionCookie,
  exchangeGoogleCode,
  fetchGoogleUser,
  getSessionIdFromRequest,
  parseCookies,
} from './src/server/auth.js';
import { createBabyStore } from './src/server/db/store-factory.js';
import { createId } from './src/utils/ids.js';

const port = Number(process.env.PORT || 4174);
const root = resolve('.');
loadEnv();
const store = await createBabyStore();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  if (request.url?.startsWith('/api/')) {
    await handleApi(request, response);
    return;
  }

  const filePath = resolveRequestPath(request.url || '/');
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Family Tracker running at http://localhost:${port}`);
  console.log(`Storage provider: ${getStorageProvider()}`);
});

async function handleApi(request, response) {
  try {
    const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);

    if (request.method === 'GET' && requestUrl.pathname === '/api/config') {
      const session = await currentSession(request);
      sendJson(response, 200, {
        provider: getLLMProvider(),
        configured: Boolean(getProviderKey(getLLMProvider())),
        storageProvider: getStorageProvider(),
        googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        providers: getProviderModelOptions(),
        user: session?.user || null,
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/auth/me') {
      const session = await currentSession(request);
      sendJson(response, 200, { user: session?.user || null });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/auth/google/start') {
      const auth = createGoogleAuthUrl({ request });
      response.writeHead(302, {
        location: auth.url,
        'set-cookie': createOAuthStateCookie(auth.state, request),
      });
      response.end();
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/auth/google/callback') {
      const cookies = parseCookies(request.headers.cookie || '');
      const expectedState = cookies.ft_oauth_state || '';
      const actualState = requestUrl.searchParams.get('state') || '';
      const code = requestUrl.searchParams.get('code') || '';
      if (!expectedState || expectedState !== actualState) throw new Error('Invalid Google OAuth state.');
      const token = await exchangeGoogleCode({ request, code });
      const googleUser = await fetchGoogleUser(token.access_token);
      const user = await store.upsertUser(googleUser);
      const session = await createSessionForUser(user.id);
      response.writeHead(302, {
        location: '/',
        'set-cookie': [
          createSessionCookie(session.id, request),
          clearOAuthStateCookie(request),
        ],
      });
      response.end();
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/auth/dev') {
      const body = await readJson(request);
      if (String(body.id || '').trim() !== 'admin') {
        sendJson(response, 403, { error: 'Dev login requires id=admin.' });
        return;
      }
      const user = await store.upsertUser({
        provider: 'dev',
        providerId: 'admin',
        email: 'admin@local.dev',
        name: 'Admin Dev',
        familyId: 'family-admin',
      });
      const session = await createSessionForUser(user.id);
      sendJson(response, 200, { user }, { 'set-cookie': createSessionCookie(session.id, request) });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
      const sessionId = getSessionIdFromRequest(request);
      if (sessionId) await store.deleteSession(sessionId);
      sendJson(response, 200, { ok: true }, { 'set-cookie': clearSessionCookie(request) });
      return;
    }

    const session = await requireSession(request, response);
    if (!session) return;
    const scope = scopeForUser(session.user);

    if (request.method === 'GET' && requestUrl.pathname === '/api/profile') {
      sendJson(response, 200, { profile: await store.getProfile(scope.babyId, { familyId: scope.familyId }) });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/profile') {
      const body = await readJson(request);
      sendJson(response, 200, {
        profile: await store.saveProfile({
          ...(body.profile || body),
          familyId: scope.familyId,
          babyId: scope.babyId,
        }),
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/logs/today') {
      const today = requestUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const timezone = requestUrl.searchParams.get('timezone') || 'UTC';
      const events = await store.listEventsForDay(today, { ...scope, timezone });
      sendJson(response, 200, { events, summary: buildTodaySummary(events) });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/logs') {
      const body = await readJson(request);
      const now = body.now ? new Date(body.now) : new Date();
      const rawText = String(body.text || '').trim();
      if (!rawText) {
        sendJson(response, 400, { error: 'Log text is required.' });
        return;
      }

      const profile = await store.getProfile(scope.babyId, { familyId: scope.familyId });
      const recentEvents = (await store.listEvents({ ...scope, limit: 100 })).reverse();
      const parsed = parseBabyLogText(rawText, {
        now,
        profile,
        familyId: scope.familyId,
        babyId: scope.babyId,
        authorId: session.user.id || defaultAuthorId,
      });
      const autoWakeEvents = createAutoWakeEvents(parsed, recentEvents, {
        now: now.toISOString(),
        authorId: session.user.id || defaultAuthorId,
      });
      const linked = linkSleepSessions([...autoWakeEvents, ...parsed], recentEvents);
      const inferred = applyInferences(linked, { now, profile, recentEvents });
      const openSleep = findOpenSleep(recentEvents);
      const inputAt = now.toISOString();
      const rawLog = {
        id: createId('rawlog'),
        familyId: scope.familyId,
        babyId: scope.babyId,
        authorId: session.user.id || defaultAuthorId,
        rawText,
        inputAt,
        timezone: body.timezone || 'UTC',
      };
      const events = inferred.map((event) => ({
        ...event,
        familyId: scope.familyId,
        babyId: scope.babyId,
        id: createId('event'),
        rawLogId: rawLog.id,
        createdAt: inputAt,
      }));
      const saved = await store.saveLogWithEvents(rawLog, events);
      await markLinkedSleepStartsCompleted(events, openSleep);
      sendJson(response, 200, { rawLog: saved, events: saved.events });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/ask') {
      const body = await readJson(request);
      const day = body.day || new Date().toISOString().slice(0, 10);
      const events = await store.listEventsForDay(day, { ...scope, timezone: body.timezone || 'UTC' });
      sendJson(response, 200, {
        answer: answerSimpleQuestion(body.question, events),
        summary: buildTodaySummary(events),
      });
      return;
    }

    sendJson(response, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || 'Unexpected server error.' });
  }
}

async function currentSession(request) {
  const sessionId = getSessionIdFromRequest(request);
  return sessionId ? store.getSession(sessionId) : null;
}

async function requireSession(request, response) {
  const session = await currentSession(request);
  if (!session) {
    sendJson(response, 401, { error: 'Authentication required.' });
    return null;
  }
  return session;
}

async function createSessionForUser(userId) {
  const sessionId = createId('session');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  return store.createSession({ sessionId, userId, expiresAt });
}

function scopeForUser(user) {
  const familyId = user.familyId;
  return {
    familyId,
    babyId: `${familyId}-baby`,
  };
}

async function markLinkedSleepStartsCompleted(events, openSleep) {
  if (!openSleep) return;
  const endEvent = events.find((event) => event.type === 'sleep' && event.linkedStartEventId === openSleep.id);
  const update = completedOpenSleepUpdate(endEvent, openSleep);
  if (update) await store.updateEvent(update);
}

function resolveRequestPath(url) {
  const parsedUrl = new URL(url, `http://localhost:${port}`);
  const pathname = parsedUrl.pathname === '/' ? '/app/index.html' : parsedUrl.pathname;
  const filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

function readJson(request) {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extraHeaders });
  response.end(JSON.stringify(payload));
}

function loadEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function getLLMProvider() {
  return normalizeLLMProvider(process.env.LLM_PROVIDER || 'mock');
}

function getProviderKey(provider) {
  return provider === 'openai' ? process.env.OPENAI_API_KEY || '' : '';
}

function getStorageProvider() {
  return process.env.DATABASE_PROVIDER || (process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite');
}
