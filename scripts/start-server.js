import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
loadEnv();
ensureProxyAwareServerRerun();
await import('../server.js');

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

function ensureProxyAwareServerRerun() {
  if (!shouldUseProxyAwareNode()) return;
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

function shouldUseProxyAwareNode() {
  const provider = process.env.DATABASE_PROVIDER || (process.env.TURSO_DATABASE_URL ? 'turso' : 'sqlite');
  if (provider !== 'turso') return false;
  const hasProxyArg = process.execArgv.includes('--use-env-proxy');
  const hasDnsArg = process.execArgv.some((arg) => arg.startsWith('--dns-result-order='));
  return !(hasProxyArg && hasDnsArg);
}
