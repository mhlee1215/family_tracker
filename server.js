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
import { createBabyStore, getStorageConfig } from './src/server/db/store-factory.js';
import { createId } from './src/utils/ids.js';

const port = Number(process.env.PORT || 4174);
const root = resolve('.');
loadEnv();
const storageConfig = getStorageConfig();
const store = await createBabyStore();
const processedAlexaRequestIds = new Set();

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

  const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);
  const requestedPath = requestUrl.pathname;
  const filePath = resolveRequestPath(request.url || '/');
  const isClientRoute = !extname(requestedPath);
  if ((!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) && isClientRoute) {
    const indexPath = resolveRequestPath('/');
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    createReadStream(indexPath).pipe(response);
    return;
  }
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
}).listen(port, () => {
  console.log(`Family Tracker running at http://localhost:${port}`);
  console.log(`Storage provider: ${storageConfig.provider}`);
});

async function handleApi(request, response) {
  try {
    const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);

    if (request.method === 'GET' && requestUrl.pathname === '/api/config') {
      const session = await currentSession(request);
      sendJson(response, 200, {
        provider: getLLMProvider(),
        configured: Boolean(getProviderKey(getLLMProvider())),
        storageProvider: storageConfig.provider,
        storageConfigured: storageConfig.configured,
        storageMissing: storageConfig.missing,
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

    if (request.method === 'POST' && requestUrl.pathname === '/api/integrations/alexa/task') {
      const token = String(process.env.ALEXA_INTEGRATION_TOKEN || '');
      const authHeader = String(request.headers.authorization || '');
      if (!token || authHeader !== `Bearer ${token}`) {
        sendJson(response, 401, { error: 'Unauthorized integration request.' });
        return;
      }

      const body = await readJson(request);
      const text = String(body.text || '').trim();
      const requestId = String(body.requestId || '').trim();
      if (!text || text.length > 300) {
        sendJson(response, 400, { error: 'Field \"text\" is required and must be <= 300 chars.' });
        return;
      }
      if (!requestId || requestId.length > 200) {
        sendJson(response, 400, { error: 'Field \"requestId\" is required and must be <= 200 chars.' });
        return;
      }
      if (processedAlexaRequestIds.has(requestId)) {
        sendJson(response, 409, { error: 'Duplicate requestId.' });
        return;
      }

      const familyId = String(process.env.ALEXA_FAMILY_ID || 'family-admin');
      const assignees = await store.ensureDefaultTaskAssignees(familyId);
      const assigneeId = assignees[0]?.id;
      if (!assigneeId) {
        sendJson(response, 500, { error: 'No task assignee available for Alexa integration.' });
        return;
      }

      const task = await store.createTask({
        id: createId('task'),
        familyId,
        title: text,
        assigneeId,
        dueMode: 'asap',
        dueDate: null,
      });
      processedAlexaRequestIds.add(requestId);
      if (processedAlexaRequestIds.size > 5000) processedAlexaRequestIds.clear();
      sendJson(response, 200, { ok: true, task });
      return;
    }

    const session = await requireSession(request, response);
    if (!session) return;
    const scope = scopeForUser(session.user);

    if (request.method === 'GET' && requestUrl.pathname === '/api/profile') {
      sendJson(response, 200, {
        profile: await store.getProfile(scope.babyId, { familyId: scope.familyId }),
        growthRecords: await store.listGrowthRecords({ ...scope, limit: 100 }),
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/meal-thumbnail') {
      const target = String(requestUrl.searchParams.get('url') || '').trim();
      if (!target) {
        sendJson(response, 400, { error: 'url query is required.' });
        return;
      }
      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        sendJson(response, 400, { error: 'url must be a valid absolute URL.' });
        return;
      }
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        sendJson(response, 400, { error: 'url must be http or https.' });
        return;
      }

      let thumbnail = '';
      try {
        thumbnail = await resolveMealThumbnail(target);
      } catch {
        thumbnail = '';
      }
      sendJson(response, 200, { thumbnail });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/profile') {
      const body = await readJson(request);
      const profile = await store.saveProfile({
        ...(body.profile || body),
        familyId: scope.familyId,
        babyId: scope.babyId,
      });
      if (body.growthRecord && hasGrowthMeasurement(body.growthRecord)) {
        const growthRecord = normalizeGrowthRecord(body.growthRecord, {
          ...scope,
          authorId: session.user.id || defaultAuthorId,
          birthDate: profile.birthDate,
          birthTime: profile.birthTime,
        });
        await store.saveGrowthRecord(growthRecord);
      }
      sendJson(response, 200, {
        profile,
        growthRecords: await store.listGrowthRecords({ ...scope, limit: 100 }),
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/growth') {
      sendJson(response, 200, { growthRecords: await store.listGrowthRecords({ ...scope, limit: 100 }) });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/logs/today') {
      const today = requestUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const timezone = requestUrl.searchParams.get('timezone') || 'UTC';
      const events = await store.listEventsForDay(today, { ...scope, timezone });
      sendJson(response, 200, { events, summary: buildTodaySummary(events) });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/api/logs/calendar') {
      const month = requestUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7);
      const timezone = requestUrl.searchParams.get('timezone') || 'UTC';
      const events = await store.listEvents({ ...scope, limit: 2000 });
      const days = {};
      for (const event of events) {
        const value = event.occurredAt?.value || event.startAt?.value || event.endAt?.value;
        if (!value) continue;
        const day = localDateKeyFromIso(value, timezone);
        if (!day.startsWith(month)) continue;
        if (!days[day]) days[day] = [];
        const color = event.type === 'sleep' ? '#6366f1'
          : event.type === 'feeding_milk' ? '#0ea5e9'
            : event.type === 'feeding_solid' ? '#f59e0b'
              : event.type === 'diaper' ? '#22c55e' : '#9ca3af';
        if (!days[day].includes(color)) days[day].push(color);
      }
      sendJson(response, 200, { days });
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

    if (request.method === 'GET' && requestUrl.pathname === '/api/task-assignees') {
      sendJson(response, 200, { assignees: await store.ensureDefaultTaskAssignees(scope.familyId) });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/task-assignees') {
      const body = await readJson(request);
      const name = String(body.name || '').trim();
      if (!name) {
        sendJson(response, 400, { error: 'Assignee name is required.' });
        return;
      }
      const assignee = await store.createTaskAssignee({
        id: createId('assignee'),
        familyId: scope.familyId,
        name,
        color: body.color || '#0066cc',
      });
      sendJson(response, 200, { assignee });
      return;
    }



    if (request.method === 'POST' && requestUrl.pathname === '/api/dev/clear-tasks') {
      if (session.user.provider !== 'dev' || session.user.providerId !== 'admin') {
        sendJson(response, 403, { error: 'Dev admin required.' });
        return;
      }
      await store.clearTasksForFamily(scope.familyId);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/dev/seed-tasks') {
      if (session.user.provider !== 'dev' || session.user.providerId !== 'admin') {
        sendJson(response, 403, { error: 'Dev admin required.' });
        return;
      }
      await store.clearTasksForFamily(scope.familyId);
      const assignees = await store.ensureDefaultTaskAssignees(scope.familyId);
      const mom = assignees.find((item) => item.name === 'Mom') || assignees[0];
      const dad = assignees.find((item) => item.name === 'Dad') || assignees[1] || assignees[0];
      const momTaskPool = [
        'Defrost baby food ingredients', 'Review nap records', 'Label pumped milk storage bags', 'Pack snacks for stroller bag',
        'Set bath towels for evening routine', 'Check night light batteries', 'Refill diaper pouch', 'Organize overnight feeding logs',
        'Portion baby food containers', 'Sort weekly growth photos', 'Update daycare notes', 'Sort freshly laundered baby clothes'
      ];
      const dadTaskPool = [
        'Refill formula kettle', 'Empty bottle sterilizer', 'Inspect stroller wheel condition', 'Dust and clean play mat',
        'Check thermometer charge level', 'Set evening routine timer', 'Refill travel wipes pack', 'Tidy baby crib sheets',
        'Adjust sleep camera angle', 'Run bib laundry cycle', 'Check weekly diaper stock', 'Clean nursery humidifier'
      ];
      const dueModeCounts = { on_date: 50, before_date: 20, asap: 3, someday: 2 };
      const dueModeOrder = Object.entries(dueModeCounts).flatMap(([mode, count]) => Array.from({ length: count }, () => mode));
      const base = new Date('2026-05-25T12:00:00.000Z');
      const totalTasks = dueModeOrder.length;
      let created = 0;
      for (let dayOffset = 0; created < totalTasks; dayOffset += 1) {
        const dayDate = new Date(base);
        dayDate.setUTCDate(base.getUTCDate() - dayOffset);
        const day = dayDate.toISOString().slice(0, 10);
        for (let i = 0; i < 10 && created < totalTasks; i += 1) {
          const assignee = i < 5 ? mom : dad;
          const roleIndex = i % 5;
          const titleBase = i < 5
            ? momTaskPool[(dayOffset * 5 + roleIndex) % momTaskPool.length]
            : dadTaskPool[(dayOffset * 5 + roleIndex) % dadTaskPool.length];
          const title = titleBase;
          const dueMode = dueModeOrder[created % dueModeOrder.length];
          const task = await store.createTask({
            id: createId('task'),
            familyId: scope.familyId,
            title,
            assigneeId: assignee.id,
            dueMode,
            dueDate: dueMode === 'asap' || dueMode === 'someday' ? null : day,
          });
          if ((dayOffset + i) % 4 === 0) {
            const completedAt = new Date(`${day}T${String((i % 8) + 9).padStart(2, '0')}:00:00.000Z`).toISOString();
            await store.updateTask(task.id, { status: 'done', completedAt, completedBy: session.user.id }, scope);
          }
          created += 1;
        }
      }
      sendJson(response, 200, { ok: true, created });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/tasks/today') {
      const day = requestUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      await store.ensureDefaultTaskAssignees(scope.familyId);
      sendJson(response, 200, { tasks: await store.listTasksForDay(day, scope) });
      return;
    }


    if (request.method === 'GET' && requestUrl.pathname === '/api/events/summary') {
      const period = requestUrl.searchParams.get('period') || 'week';
      const day = requestUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const tasks = await store.listAllTasks(scope);
      const events = await store.listEvents({ ...scope, limit: 1000 });
      const summary = buildEventSummary(period, day, tasks, events);
      sendJson(response, 200, { summary });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/tasks/overview') {
      sendJson(response, 200, { tasks: await store.listTaskOverview({ ...scope, limit: 40 }) });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/tasks/calendar') {
      const month = requestUrl.searchParams.get('month') || new Date().toISOString().slice(0, 7);
      const tasks = await store.listAllTasks(scope);
      const days = {};
      for (const task of tasks) {
        const dueDate = String(task.dueDate || '');
        if (!dueDate.startsWith(month)) continue;
        if (!days[dueDate]) days[dueDate] = [];
        const color = task.assigneeColor || '#0066cc';
        if (!days[dueDate].includes(color)) days[dueDate].push(color);
      }
      sendJson(response, 200, { days });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/tasks') {
      const body = await readJson(request);
      const title = String(body.title || '').trim();
      const assigneeId = String(body.assigneeId || '').trim();
      if (!title || !assigneeId) {
        sendJson(response, 400, { error: 'Task title and assignee are required.' });
        return;
      }
      const dueMode = ['on_date','before_date','asap','someday'].includes(body.dueMode) ? body.dueMode : 'on_date';
      const task = await store.createTask({
        id: createId('task'),
        familyId: scope.familyId,
        title,
        assigneeId,
        dueMode,
        dueDate: body.dueDate || new Date().toISOString().slice(0, 10),
      });
      sendJson(response, 200, { task });
      return;
    }

    if (request.method === 'PATCH' && requestUrl.pathname.startsWith('/api/tasks/')) {
      const taskId = requestUrl.pathname.split('/').pop();
      const body = await readJson(request);
      const task = await store.updateTask(taskId, {
        title: body.title,
        assigneeId: body.assigneeId,
        dueDate: body.dueDate,
        status: body.status,
        completedBy: session.user.id,
      }, scope);
      if (!task) {
        sendJson(response, 404, { error: 'Task not found.' });
        return;
      }
      sendJson(response, 200, { task });
      return;
    }

    sendJson(response, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || 'Unexpected server error.' });
  }
}

async function resolveMealThumbnail(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'family-tracker-thumbnail-bot/1.0',
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!response.ok) return '';
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return '';
  const html = await response.text();
  return extractFirstImageFromHtml(html, response.url) || '';
}

function extractFirstImageFromHtml(html, baseUrl) {
  const candidates = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
    /<img[^>]+src=["']([^"']+)["'][^>]*>/i,
  ];

  for (const regex of candidates) {
    const match = html.match(regex);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (['http:', 'https:'].includes(resolved.protocol)) return resolved.toString();
    } catch {
      continue;
    }
  }
  return '';
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

function normalizeGrowthRecord(record, context) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const recordedFor = ['birth', 'now', 'custom'].includes(record.recordedFor) ? record.recordedFor : 'custom';
  const occurredDate = recordedFor === 'birth' ? (context.birthDate || record.occurredDate || today)
    : String(record.occurredDate || today).slice(0, 10);
  const occurredTime = recordedFor === 'birth' ? (context.birthTime || record.occurredTime || '')
    : String(record.occurredTime || (recordedFor === 'now' ? now.toISOString().slice(11, 16) : '')).slice(0, 5);
  return {
    id: createId('growth'),
    familyId: context.familyId,
    babyId: context.babyId,
    authorId: context.authorId,
    recordedFor,
    occurredDate,
    occurredTime,
    heightCm: optionalNumber(record.heightCm),
    headCm: optionalNumber(record.headCm),
    weightG: optionalNumber(record.weightG),
    apgarPercent: optionalNumber(record.apgarPercent),
  };
}

function hasGrowthMeasurement(record = {}) {
  return ['heightCm', 'headCm', 'weightG', 'apgarPercent'].some((key) => optionalNumber(record[key]) !== null);
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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

function localDateKeyFromIso(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function buildEventSummary(period, day, tasks, events) {
  const end = new Date(`${day}T23:59:59Z`);
  const start = new Date(end);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - 6);
  else if (period === 'month') start.setUTCMonth(start.getUTCMonth() - 1);
  else if (period === 'quarter') start.setUTCMonth(start.getUTCMonth() - 3);
  else start.setUTCFullYear(start.getUTCFullYear() - 1);
  const inRangeEvents = events.filter((e) => {
    const t = e.occurredAt?.value || e.startAt?.value || e.endAt?.value;
    if (!t) return false;
    const d = new Date(t);
    return d >= start && d <= end;
  });
  const openTasks = tasks.filter((t) => t.status === 'open');
  const overdueTasks = openTasks.filter((t) => (t.dueMode === 'on_date' || t.dueMode === 'before_date') && t.dueDate < day).length;
  const riskTasks = openTasks.filter((t) => {
    if (t.dueMode === 'asap' || t.dueMode === 'someday') return Math.floor((end - new Date(t.createdAt)) / 86400000) >= 3;
    return t.dueDate <= day;
  }).length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const total = Math.max(1, openTasks.length + doneTasks + riskTasks);
  return { period, start: start.toISOString().slice(0,10), end: day, totalEvents: inRangeEvents.length, openTasks: openTasks.length, overdueTasks, riskTasks, doneTasks, chart: { open: Math.round(openTasks.length/total*100), done: Math.round(doneTasks/total*100), risk: Math.round(riskTasks/total*100) } };
}
