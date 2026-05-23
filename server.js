import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { parseBabyLogText } from './src/domain/baby-log-parser.js';
import { applyInferences } from './src/domain/inference-engine.js';
import { getProviderModelOptions, normalizeLLMProvider } from './src/domain/llm-provider.js';
import { linkSleepSessions } from './src/domain/sleep-session.js';
import { answerSimpleQuestion, buildTodaySummary } from './src/domain/summary-builder.js';
import { defaultAuthorId, defaultBabyId, defaultFamilyId } from './src/domain/profile-defaults.js';
import { SQLiteBabyStore } from './src/server/db/sqlite-baby-store.js';
import { createId } from './src/utils/ids.js';

const port = Number(process.env.PORT || 4174);
const root = resolve('.');
const store = new SQLiteBabyStore();
loadEnv();

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
});

async function handleApi(request, response) {
  try {
    const requestUrl = new URL(request.url || '/', `http://localhost:${port}`);

    if (request.method === 'GET' && requestUrl.pathname === '/api/config') {
      sendJson(response, 200, {
        provider: getLLMProvider(),
        configured: Boolean(getProviderKey(getLLMProvider())),
        providers: getProviderModelOptions(),
      });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/profile') {
      sendJson(response, 200, { profile: store.getProfile(defaultBabyId) });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/profile') {
      const body = await readJson(request);
      sendJson(response, 200, { profile: store.saveProfile(body.profile || body) });
      return;
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/logs/today') {
      const today = requestUrl.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const events = store.listEventsForDay(today);
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

      const profile = store.getProfile(defaultBabyId);
      const recentEvents = store.listEvents({ limit: 100 }).reverse();
      const parsed = parseBabyLogText(rawText, {
        now,
        profile,
        familyId: defaultFamilyId,
        babyId: defaultBabyId,
        authorId: defaultAuthorId,
      });
      const linked = linkSleepSessions(parsed, recentEvents);
      const inferred = applyInferences(linked, { now, profile, recentEvents });
      const inputAt = now.toISOString();
      const rawLog = {
        id: createId('rawlog'),
        familyId: defaultFamilyId,
        babyId: defaultBabyId,
        authorId: defaultAuthorId,
        rawText,
        inputAt,
        timezone: body.timezone || 'UTC',
      };
      const events = inferred.map((event) => ({
        ...event,
        id: createId('event'),
        rawLogId: rawLog.id,
        createdAt: inputAt,
      }));
      const saved = store.saveLogWithEvents(rawLog, events);
      sendJson(response, 200, { rawLog: saved, events: saved.events });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/ask') {
      const body = await readJson(request);
      const day = body.day || new Date().toISOString().slice(0, 10);
      const events = store.listEventsForDay(day);
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

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
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

