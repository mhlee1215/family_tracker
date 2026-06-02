import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { parseBabyLogForSave } from './src/domain/log-parser-orchestrator.js';
import { applyInferences } from './src/domain/inference-engine.js';
import { getProviderModelOptions, normalizeLLMProvider } from './src/domain/llm-provider.js';
import { completedOpenSleepUpdate, createAutoWakeEvents, findOpenSleep, linkSleepSessions } from './src/domain/sleep-session.js';
import { answerSimpleQuestion, buildTodayContext, buildTodaySummary, buildWindowSummary, filterEventsForWindow } from './src/domain/summary-builder.js';
import { defaultAuthorId } from './src/domain/profile-defaults.js';
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  createGoogleAuthUrl,
  createOAuthStateCookie,
  createSessionCookie,
  exchangeGoogleCode,
  fetchGoogleUser,
  getDevAuthUser,
  getSessionIdFromRequest,
  isDevAdminUser,
  parseCookies,
} from './src/server/auth.js';
import { createBabyStore, getStorageConfig } from './src/server/db/store-factory.js';
import { getMediaStorageConfig, publicMediaStorageConfig } from './src/server/media-config.js';
import { createId } from './src/utils/ids.js';
import { colorForBabyEventType } from './src/utils/tracker-colors.js';

const port = Number(process.env.PORT || 4174);
const root = resolve('.');
loadEnv();
const storageConfig = getStorageConfig();
const mediaStorageConfig = getMediaStorageConfig();
const store = await createBabyStore();
const runtimeLLMConfig = {
  provider: normalizeLLMProvider(process.env.LLM_PROVIDER || 'mock'),
  model: process.env.LLM_MODEL || '',
  apiKeys: {
    openai: process.env.OPENAI_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
  },
};
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
  console.log(`Media storage provider: ${mediaStorageConfig.provider}${mediaStorageConfig.configured ? '' : ' (not configured)'}`);
});

async function handleApi(request, response) {
  try {
    const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);

    if (request.method === 'GET' && requestUrl.pathname === '/api/config') {
      const session = await currentSession(request);
      sendJson(response, 200, {
        ...buildLLMConfigPayload(),
        storageProvider: storageConfig.provider,
        storageConfigured: storageConfig.configured,
        storageMissing: storageConfig.missing,
        mediaStorage: publicMediaStorageConfig(mediaStorageConfig),
        googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
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
      const devUser = getDevAuthUser(body.id);
      if (!devUser) {
        sendJson(response, 403, { error: 'Dev login requires id=admin-dev or id=admin-test.' });
        return;
      }
      const user = await store.upsertUser(devUser);
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

      const familyId = String(process.env.ALEXA_FAMILY_ID || 'family-admin-dev');
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

    if (request.method === 'POST' && requestUrl.pathname === '/api/llm-config') {
      const body = await readJson(request);
      const provider = normalizeLLMProvider(body.provider || runtimeLLMConfig.provider);
      const providerConfig = getProviderModelOptions().find((item) => item.id === provider);
      const apiKey = String(body.apiKey || '').trim();
      const model = String(body.model || providerConfig?.defaultModel || '').trim();

      if (!providerConfig) {
        sendJson(response, 400, { error: 'Unknown LLM provider.' });
        return;
      }
      if (apiKey && apiKey.length > 500) {
        sendJson(response, 400, { error: 'API key is too long.' });
        return;
      }
      if (apiKey && providerConfig.requiresApiKey) runtimeLLMConfig.apiKeys[provider] = apiKey;
      if (providerConfig.requiresApiKey && !getProviderKey(provider)) {
        sendJson(response, 400, { error: `${providerConfig.label} needs an API key before it can be activated.` });
        return;
      }

      runtimeLLMConfig.provider = provider;
      runtimeLLMConfig.model = providerConfig.models.includes(model) ? model : providerConfig.defaultModel;
      sendJson(response, 200, buildLLMConfigPayload());
      return;
    }


    if (request.method === 'GET' && requestUrl.pathname === '/api/sync/state') {
      const syncState = typeof store.getSyncState === 'function'
        ? await store.getSyncState(scope)
        : { serverTime: new Date().toISOString(), modules: {} };
      sendJson(response, 200, syncState);
      return;
    }

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


    if (request.method === 'GET' && requestUrl.pathname === '/api/action-logs') {
      const module = ['baby', 'task'].includes(requestUrl.searchParams.get('module')) ? requestUrl.searchParams.get('module') : 'baby';
      const requestedLimit = Number(requestUrl.searchParams.get('limit'));
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 30;
      sendJson(response, 200, { logs: (await store.listActionLogs({ ...scope, module, limit })).map(publicActionLog) });
      return;
    }


    if (request.method === 'POST' && requestUrl.pathname.startsWith('/api/action-logs/') && requestUrl.pathname.endsWith('/undo')) {
      const parts = requestUrl.pathname.split('/');
      const actionLogId = decodeURIComponent(parts[3] || '');
      const result = await undoActionLog(store, scope, actionLogId, session.user.id || defaultAuthorId);
      sendJson(response, 200, { actionLog: publicActionLog(result.actionLog), undoLog: publicActionLog(result.undoLog) });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/logs/today') {
      const today = requestUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const timezone = requestUrl.searchParams.get('timezone') || 'UTC';
      const now = new Date();
      if (requestUrl.searchParams.get('range') === 'recent24h') {
        const allEvents = await store.listEvents({ ...scope, limit: 1000 });
        const windowStart = new Date(now.getTime() - 24 * 60 * 60000);
        const events = filterEventsForWindow(allEvents, { start: windowStart, end: now });
        sendJson(response, 200, {
          events,
          summary: buildWindowSummary(allEvents, { start: windowStart, end: now }),
          context: buildTodayContext(events, { selectedDay: localDateKeyFromIso(now.toISOString(), timezone), today: localDateKeyFromIso(now.toISOString(), timezone), now }),
          range: { kind: 'recent24h', start: windowStart.toISOString(), end: now.toISOString() },
        });
        return;
      }
      const events = await store.listEventsForDay(today, { ...scope, timezone });
      sendJson(response, 200, {
        events,
        summary: buildTodaySummary(events),
        context: buildTodayContext(events, { selectedDay: today, today: localDateKeyFromIso(now.toISOString(), timezone), now }),
      });
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
        const color = colorForBabyEventType(event.type);
        if (!days[day].includes(color)) days[day].push(color);
      }
      sendJson(response, 200, { days });
      return;
    }


    if (request.method === 'POST' && requestUrl.pathname === '/api/moments') {
      const body = await readJson(request);
      const title = String(body.title || '').trim();
      if (!title || title.length > 120) {
        sendJson(response, 400, { error: 'Moment title is required and must be <= 120 chars.' });
        return;
      }
      const note = String(body.note || '').trim().slice(0, 500);
      const occurredAt = validIsoOrNow(body.occurredAt);
      const rawText = note ? `${title} — ${note}` : title;
      const inputAt = new Date().toISOString();
      const rawLog = {
        id: createId('rawlog'),
        familyId: scope.familyId,
        babyId: scope.babyId,
        authorId: session.user.id || defaultAuthorId,
        rawText,
        inputAt,
        timezone: body.timezone || 'UTC',
        inputSource: 'moment',
        parserMode: 'system',
      };
      const event = {
        id: createId('event'),
        rawLogId: rawLog.id,
        familyId: scope.familyId,
        babyId: scope.babyId,
        authorId: session.user.id || defaultAuthorId,
        type: 'milestone',
        title,
        note,
        isFirst: Boolean(body.isFirst),
        occurredAt: { value: occurredAt, source: 'explicit', basis: 'moment form date', confidence: 1 },
        rawText,
        attachments: normalizeMomentAttachments(body.attachments),
        parserInfo: { kind: 'system', label: 'Moment form' },
        createdAt: inputAt,
      };
      const saved = await store.saveLogWithEvents(rawLog, [event]);
      await appendActionLog(store, scope, { module: 'baby', entityType: 'record', entityId: rawLog.id, action: 'add', actorId: session.user.id || defaultAuthorId, message: `added growth moment "${summarizeActionText(title)}"`, metadata: { after: { rawLog: saved } } });
      sendJson(response, 200, { rawLog: saved, events: saved.events });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/logs') {
      const body = await readJson(request);
      const now = body.now ? new Date(body.now) : new Date();
      const rawText = String(body.text || '').trim();
      if (!rawText) {
        sendJson(response, 400, { error: 'Record text is required.' });
        return;
      }

      const inputAt = now.toISOString();
      const rawLog = {
        id: createId('rawlog'),
        familyId: scope.familyId,
        babyId: scope.babyId,
        authorId: session.user.id || defaultAuthorId,
        rawText,
        inputAt,
        timezone: body.timezone || 'UTC',
        inputSource: body.inputSource || 'text',
        parserMode: body.parserMode || 'auto',
      };
      const result = await buildEventsForRawLog(rawLog, {
        now,
        scope,
        authorId: session.user.id || defaultAuthorId,
      });
      if (result.status === 'needs_clarification') {
        sendJson(response, 422, result);
        return;
      }
      const { events, openSleep } = result;
      const saved = await store.saveLogWithEvents(rawLog, events);
      await appendActionLog(store, scope, { module: 'baby', entityType: 'record', entityId: rawLog.id, action: 'add', actorId: session.user.id || defaultAuthorId, message: `added baby record "${summarizeActionText(rawText)}"`, metadata: { after: { rawLog: saved } } });
      await markLinkedSleepStartsCompleted(events, openSleep);
      sendJson(response, 200, { rawLog: saved, events: saved.events });
      return;
    }


    if ((request.method === 'PATCH' || request.method === 'DELETE') && requestUrl.pathname.startsWith('/api/logs/')) {
      const rawLogId = decodeURIComponent(requestUrl.pathname.split('/').pop() || '');
      const existing = await store.getRawLog(rawLogId);
      if (!existing || existing.familyId !== scope.familyId || existing.babyId !== scope.babyId) {
        sendJson(response, 404, { error: 'Record not found.' });
        return;
      }

      if (request.method === 'DELETE') {
        await store.deleteRawLog(rawLogId, scope);
        await appendActionLog(store, scope, { module: 'baby', entityType: 'record', entityId: rawLogId, action: 'delete', actorId: session.user.id || defaultAuthorId, message: `deleted baby record "${summarizeActionText(existing.rawText)}"`, metadata: { before: { rawLog: existing } } });
        sendJson(response, 200, { ok: true });
        return;
      }

      const body = await readJson(request);
      const rawText = String(body.text || '').trim();
      if (!rawText) {
        sendJson(response, 400, { error: 'Record text is required.' });
        return;
      }
      const rawLog = {
        ...existing,
        rawText,
        timezone: body.timezone || existing.timezone || 'UTC',
      };
      const now = new Date(existing.inputAt);
      const result = await buildEventsForRawLog(rawLog, {
        now,
        scope,
        authorId: session.user.id || defaultAuthorId,
        excludeRawLogId: rawLogId,
      });
      if (result.status === 'needs_clarification') {
        sendJson(response, 422, result);
        return;
      }
      const { events, openSleep } = result;
      const saved = await store.replaceRawLogWithEvents(rawLogId, { rawText, timezone: rawLog.timezone }, events, scope);
      await appendActionLog(store, scope, { module: 'baby', entityType: 'record', entityId: rawLogId, action: 'edit', actorId: session.user.id || defaultAuthorId, message: `edited baby record "${summarizeActionText(rawText)}"`, metadata: { before: { rawLog: existing }, after: { rawLog: saved } } });
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
      if (!isDevAdminUser(session.user)) {
        sendJson(response, 403, { error: 'Dev admin required.' });
        return;
      }
      await store.clearTasksForFamily(scope.familyId);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/dev/seed-tasks') {
      if (!isDevAdminUser(session.user)) {
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
      await appendActionLog(store, scope, { module: 'task', entityType: 'task', entityId: task.id, action: 'add', actorId: session.user.id || defaultAuthorId, message: `added task "${summarizeActionText(task.title)}"`, metadata: { after: { task } } });
      sendJson(response, 200, { task });
      return;
    }

    if (request.method === 'PATCH' && requestUrl.pathname.startsWith('/api/tasks/')) {
      const taskId = requestUrl.pathname.split('/').pop();
      const body = await readJson(request);
      const beforeTask = await store.getTask(taskId, scope);
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
      const action = body.status ? (task.status === 'done' ? 'complete' : 'reopen') : 'edit';
      const verb = action === 'complete' ? 'completed' : action === 'reopen' ? 'reopened' : 'edited';
      await appendActionLog(store, scope, { module: 'task', entityType: 'task', entityId: task.id, action, actorId: session.user.id || defaultAuthorId, message: `${verb} task "${summarizeActionText(task.title)}"`, metadata: { before: { task: beforeTask }, after: { task } } });
      sendJson(response, 200, { task });
      return;
    }

    sendJson(response, 404, { error: 'API route not found.' });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || 'Unexpected server error.' });
  }
}




function publicActionLog(entry) {
  if (!entry) return null;
  const { metadata, ...safeEntry } = entry;
  return safeEntry;
}

async function undoActionLog(store, scope, actionLogId, actorId) {
  const actionLog = await store.getActionLog(actionLogId, scope);
  if (!actionLog || actionLog.familyId !== scope.familyId) {
    const error = new Error('Action log not found.');
    error.status = 404;
    throw error;
  }
  if (actionLog.module === 'baby' && actionLog.babyId && actionLog.babyId !== scope.babyId) {
    const error = new Error('Action log not found.');
    error.status = 404;
    throw error;
  }
  if (actionLog.undoneAt || actionLog.action === 'undo') {
    const error = new Error('Action has already been undone.');
    error.status = 409;
    throw error;
  }

  await applyUndo(store, scope, actionLog);
  const undoneAt = new Date().toISOString();
  const marked = await store.markActionLogUndone(actionLog.id, { ...scope, undoneAt, undoneBy: actorId });
  const undoLog = await appendActionLog(store, scope, {
    module: actionLog.module,
    entityType: actionLog.entityType,
    entityId: actionLog.entityId,
    action: 'undo',
    actorId,
    message: `undid ${actionLog.message}`,
    metadata: { targetActionLogId: actionLog.id },
  });
  return { actionLog: marked, undoLog };
}

async function applyUndo(store, scope, actionLog) {
  if (actionLog.module === 'baby') {
    await undoBabyAction(store, scope, actionLog);
    return;
  }
  if (actionLog.module === 'task') {
    await undoTaskAction(store, scope, actionLog);
    return;
  }
  const error = new Error('Action cannot be undone.');
  error.status = 400;
  throw error;
}

async function undoBabyAction(store, scope, actionLog) {
  const beforeRawLog = actionLog.metadata?.before?.rawLog;
  if (actionLog.action === 'add') {
    await store.deleteRawLog(actionLog.entityId, scope);
    return;
  }
  if (actionLog.action === 'delete') {
    if (!beforeRawLog) throwUndoUnavailable();
    const existing = await store.getRawLog(actionLog.entityId);
    if (existing && existing.familyId === scope.familyId && existing.babyId === scope.babyId) {
      await store.replaceRawLogWithEvents(actionLog.entityId, { rawText: beforeRawLog.rawText, timezone: beforeRawLog.timezone }, beforeRawLog.events || [], scope);
    } else {
      await store.saveLogWithEvents(beforeRawLog, beforeRawLog.events || []);
    }
    return;
  }
  if (actionLog.action === 'edit') {
    if (!beforeRawLog) throwUndoUnavailable();
    const existing = await store.getRawLog(actionLog.entityId);
    if (existing && existing.familyId === scope.familyId && existing.babyId === scope.babyId) {
      await store.replaceRawLogWithEvents(actionLog.entityId, { rawText: beforeRawLog.rawText, timezone: beforeRawLog.timezone }, beforeRawLog.events || [], scope);
    } else {
      await store.saveLogWithEvents(beforeRawLog, beforeRawLog.events || []);
    }
    return;
  }
  throwUndoUnavailable();
}

async function undoTaskAction(store, scope, actionLog) {
  const beforeTask = actionLog.metadata?.before?.task;
  if (actionLog.action === 'add') {
    if (typeof store.deleteTask !== 'function') throwUndoUnavailable();
    await store.deleteTask(actionLog.entityId, scope);
    return;
  }
  if (['complete', 'reopen', 'edit'].includes(actionLog.action)) {
    if (!beforeTask) throwUndoUnavailable();
    await store.updateTask(actionLog.entityId, taskSnapshotPatch(beforeTask), scope);
    return;
  }
  throwUndoUnavailable();
}

function taskSnapshotPatch(task) {
  return {
    title: task.title,
    assigneeId: task.assigneeId,
    status: task.status,
    dueDate: task.dueDate,
    dueMode: task.dueMode,
    completedAt: task.completedAt,
    completedBy: task.completedBy,
  };
}

function throwUndoUnavailable() {
  const error = new Error('Action cannot be undone.');
  error.status = 400;
  throw error;
}

async function appendActionLog(store, scope, entry) {
  if (typeof store.appendActionLog !== 'function') return null;
  return store.appendActionLog({
    id: createId('actionlog'),
    familyId: scope.familyId,
    babyId: entry.module === 'baby' ? scope.babyId : '',
    ...entry,
  });
}

function summarizeActionText(value) {
  const compact = String(value || '').replace(/\s+/g, ' ').trim();
  if (compact.length <= 80) return compact;
  return `${compact.slice(0, 77)}...`;
}


function validIsoOrNow(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeMomentAttachments(attachments) {
  return Array.isArray(attachments) ? attachments.slice(0, 10).map((item, index) => {
    const mediaType = item?.mediaType === 'video' ? 'video' : 'image';
    const thumb = String(item?.thumbnailDataUrl || '');
    return {
      id: String(item?.id || createId('media')),
      name: String(item?.name || `${mediaType}-${index + 1}`).slice(0, 120),
      mediaType,
      mimeType: String(item?.mimeType || '').slice(0, 80),
      byteSize: Number.isFinite(Number(item?.byteSize)) ? Number(item.byteSize) : 0,
      thumbnailDataUrl: thumb.startsWith('data:image/') && thumb.length < 250_000 ? thumb : '',
      status: 'uploaded',
      sortOrder: index,
    };
  }) : [];
}

async function buildEventsForRawLog(rawLog, { now, scope, authorId, excludeRawLogId = '' }) {
  const profile = await store.getProfile(scope.babyId, { familyId: scope.familyId });
  const recentEvents = (await store.listEvents({ ...scope, limit: 100 }))
    .filter((event) => event.rawLogId !== excludeRawLogId)
    .reverse();
  const parsedResult = await parseBabyLogForSave(rawLog.rawText, {
    now,
    profile,
    recentEvents,
    timezone: rawLog.timezone || 'UTC',
    familyId: scope.familyId,
    babyId: scope.babyId,
    authorId,
  }, {
    provider: getLLMProvider(),
    model: getLLMModel(getLLMProvider()),
    apiKey: getProviderKey(getLLMProvider()),
    parserMode: rawLog.inputSource === 'button' || rawLog.parserMode === 'heuristic' ? 'heuristic' : 'auto',
  });
  if (parsedResult.status === 'needs_clarification') return parsedResult;
  const parsed = parsedResult.events;
  const autoWakeEvents = createAutoWakeEvents(parsed, recentEvents, {
    now: now.toISOString(),
    authorId,
  });
  const linked = linkSleepSessions([...autoWakeEvents, ...parsed], recentEvents);
  const inferred = applyInferences(linked, { now, profile, recentEvents });
  const openSleep = findOpenSleep(recentEvents);
  const events = inferred.map((event) => ({
    ...event,
    familyId: scope.familyId,
    babyId: scope.babyId,
    id: createId('event'),
    rawLogId: rawLog.id,
    rawText: rawLog.rawText,
    createdAt: rawLog.inputAt,
  }));
  return { events, openSleep };
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
  const provider = normalizeLLMProvider(runtimeLLMConfig.provider || 'mock');
  return isLLMProviderConfigured(provider) ? provider : 'mock';
}

function getProviderKey(provider) {
  if (provider === 'openai') return runtimeLLMConfig.apiKeys.openai || process.env.OPENAI_API_KEY || '';
  if (provider === 'mistral') return runtimeLLMConfig.apiKeys.mistral || process.env.MISTRAL_API_KEY || '';
  return '';
}

function getLLMModel(provider = getLLMProvider()) {
  const configured = getProviderModelOptions().find((item) => item.id === provider);
  const providerModel = provider === 'openai' ? process.env.OPENAI_MODEL : provider === 'mistral' ? process.env.MISTRAL_MODEL : '';
  const model = runtimeLLMConfig.model || process.env.LLM_MODEL || providerModel || configured?.defaultModel;
  return configured?.models.includes(model) ? model : configured?.defaultModel;
}

function isLLMProviderConfigured(provider) {
  const configured = getProviderModelOptions().find((item) => item.id === provider);
  if (!configured) return false;
  return !configured.requiresApiKey || Boolean(getProviderKey(provider));
}

function buildLLMConfigPayload() {
  const provider = getLLMProvider();
  return {
    provider,
    model: getLLMModel(provider),
    configured: isLLMProviderConfigured(provider),
    providers: getProviderModelOptions().map((item) => ({
      ...item,
      configured: isLLMProviderConfigured(item.id),
      active: item.id === provider,
    })),
  };
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
