import { SQLiteBabyStore } from './sqlite-baby-store.js';
import { TursoBabyStore } from './turso-baby-store.js';

export async function createBabyStore() {
  const config = getStorageConfig();
  if (config.provider === 'turso') {
    if (!config.configured) {
      throw new Error(`Turso storage is missing environment variable(s): ${config.missing.join(', ')}`);
    }
    return TursoBabyStore.create({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return new SQLiteBabyStore();
}

export function getStorageConfig() {
  const provider = normalizeStorageProvider(process.env.DATABASE_PROVIDER, process.env.TURSO_DATABASE_URL);
  const missing = [];
  if (provider === 'turso') {
    if (!process.env.TURSO_DATABASE_URL) missing.push('TURSO_DATABASE_URL');
    if (!process.env.TURSO_AUTH_TOKEN) missing.push('TURSO_AUTH_TOKEN');
  }
  return {
    provider,
    configured: missing.length === 0,
    missing,
  };
}

function normalizeStorageProvider(provider, tursoUrl) {
  if (provider === 'turso' || provider === 'sqlite') return provider;
  return tursoUrl ? 'turso' : 'sqlite';
}
