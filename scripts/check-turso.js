import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createClient } from '@libsql/client/web';

const root = resolve('.');
loadEnv();
ensureProxyAwareRerun();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  const missing = [
    url ? null : 'TURSO_DATABASE_URL',
    authToken ? null : 'TURSO_AUTH_TOKEN',
  ].filter(Boolean);
  console.error(`Missing Turso environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const client = createClient({ url, authToken });
try {
  const result = await client.execute('SELECT 1 AS ok');
  console.log(`Turso connection ok: ${result.rows[0]?.ok === 1 ? 'yes' : 'unknown'}`);
} finally {
  client.close?.();
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

function ensureProxyAwareRerun() {
  const hasProxyArg = process.execArgv.includes('--use-env-proxy');
  const hasDnsArg = process.execArgv.some((arg) => arg.startsWith('--dns-result-order='));
  if (hasProxyArg && hasDnsArg) return;

  const rerun = spawnSync(
    process.execPath,
    ['--use-env-proxy', '--dns-result-order=ipv4first', ...process.execArgv, ...process.argv.slice(1)],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || '1' },
    },
  );
  process.exit(rerun.status ?? 1);
}
