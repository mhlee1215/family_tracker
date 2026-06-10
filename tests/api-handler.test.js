import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('Cloudflare Pages web API adapter preserves auth session flow', async () => {
  const originalCwd = process.cwd();
  const originalEnv = {
    DATABASE_PROVIDER: process.env.DATABASE_PROVIDER,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
  };
  const tempCwd = mkdtempSync(join(tmpdir(), 'family-tracker-pages-api-'));

  process.chdir(tempCwd);
  process.env.DATABASE_PROVIDER = 'sqlite';
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.NODE_ENV = 'production';

  try {
    const { handleWebApiRequest } = await import(`../src/server/api/handler.js?test=${Date.now()}`);
    const loginResponse = await handleWebApiRequest(new Request('https://family.test/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'admin-test' }),
    }));

    assert.equal(loginResponse.status, 200);
    const sessionCookie = loginResponse.headers.get('set-cookie');
    assert.match(sessionCookie, /ft_session=/);
    assert.match(sessionCookie, /Secure/);

    const meResponse = await handleWebApiRequest(new Request('https://family.test/api/auth/me', {
      headers: { cookie: sessionCookie },
    }));
    const me = await meResponse.json();

    assert.equal(meResponse.status, 200);
    assert.equal(me.user.providerId, 'admin-test');
    assert.equal(me.user.familyId, 'family-admin-test');
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('POST /api/logs preserves button input source through API responses', async () => {
  const originalCwd = process.cwd();
  const originalEnv = {
    DATABASE_PROVIDER: process.env.DATABASE_PROVIDER,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
  };
  const tempCwd = mkdtempSync(join(tmpdir(), 'family-tracker-button-source-api-'));

  process.chdir(tempCwd);
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.LLM_PROVIDER = 'mock';
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.NODE_ENV = 'production';

  try {
    const { handleWebApiRequest } = await import(`../src/server/api/handler.js?test=button-source-${Date.now()}`);
    const loginResponse = await handleWebApiRequest(new Request('https://family.test/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'admin-test' }),
    }));
    const sessionCookie = loginResponse.headers.get('set-cookie');

    const createResponse = await handleWebApiRequest(new Request('https://family.test/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({
        text: 'wet diaper',
        parserMode: 'heuristic',
        inputSource: 'button',
        timezone: 'UTC',
        now: '2026-06-09T10:00:00.000Z',
      }),
    }));
    const created = await createResponse.json();

    assert.equal(createResponse.status, 200, JSON.stringify(created));
    assert.equal(created.events.length, 1);
    assert.equal(created.events[0].inputSource, 'button');
    assert.equal(created.events[0].parserInfo.kind, 'heuristic');

    const todayResponse = await handleWebApiRequest(new Request('https://family.test/api/logs/today?day=2026-06-09&timezone=UTC', {
      headers: { cookie: sessionCookie },
    }));
    const today = await todayResponse.json();

    assert.equal(todayResponse.status, 200, JSON.stringify(today));
    assert.equal(today.events.length, 1);
    assert.equal(today.events[0].inputSource, 'button');
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('POST and PATCH /api/logs use the selected day as the parser default date', async () => {
  const originalCwd = process.cwd();
  const originalEnv = {
    DATABASE_PROVIDER: process.env.DATABASE_PROVIDER,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    NODE_ENV: process.env.NODE_ENV,
  };
  const tempCwd = mkdtempSync(join(tmpdir(), 'family-tracker-selected-day-api-'));

  process.chdir(tempCwd);
  process.env.DATABASE_PROVIDER = 'sqlite';
  process.env.LLM_PROVIDER = 'mock';
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.NODE_ENV = 'production';

  try {
    const { handleWebApiRequest } = await import(`../src/server/api/handler.js?test=selected-day-${Date.now()}`);
    const loginResponse = await handleWebApiRequest(new Request('https://family.test/api/auth/dev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'admin-test' }),
    }));
    const sessionCookie = loginResponse.headers.get('set-cookie');

    const createResponse = await handleWebApiRequest(new Request('https://family.test/api/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({
        text: 'breast milk 80 ml at 8:25 pm today',
        parserMode: 'heuristic',
        inputSource: 'button',
        timezone: 'America/Los_Angeles',
        day: '2026-06-08',
        now: '2026-06-10T18:00:00.000Z',
      }),
    }));
    const created = await createResponse.json();

    assert.equal(createResponse.status, 200, JSON.stringify(created));
    assert.equal(created.events[0].occurredAt.value, '2026-06-09T03:25:00.000Z');

    const createdDayResponse = await handleWebApiRequest(new Request('https://family.test/api/logs/today?day=2026-06-08&timezone=America%2FLos_Angeles', {
      headers: { cookie: sessionCookie },
    }));
    const createdDay = await createdDayResponse.json();
    assert.equal(createdDay.events.length, 1);
    assert.equal(createdDay.events[0].inputSource, 'button');

    const patchResponse = await handleWebApiRequest(new Request(`https://family.test/api/logs/${created.rawLog.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify({
        text: 'fed breastmilk 85 ml at 4:00 am',
        timezone: 'America/Los_Angeles',
        day: '2026-06-07',
      }),
    }));
    const patched = await patchResponse.json();

    assert.equal(patchResponse.status, 200, JSON.stringify(patched));
    assert.equal(patched.events[0].occurredAt.value, '2026-06-07T11:00:00.000Z');

    const oldDayResponse = await handleWebApiRequest(new Request('https://family.test/api/logs/today?day=2026-06-08&timezone=America%2FLos_Angeles', {
      headers: { cookie: sessionCookie },
    }));
    const oldDay = await oldDayResponse.json();
    assert.equal(oldDay.events.length, 0);

    const patchedDayResponse = await handleWebApiRequest(new Request('https://family.test/api/logs/today?day=2026-06-07&timezone=America%2FLos_Angeles', {
      headers: { cookie: sessionCookie },
    }));
    const patchedDay = await patchedDayResponse.json();
    assert.equal(patchedDay.events.length, 1);
    assert.equal(patchedDay.events[0].amountMl.value, 85);
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
