import { SQLiteBabyStore } from './sqlite-baby-store.js';
import { TursoBabyStore } from './turso-baby-store.js';

export async function createBabyStore() {
  if (process.env.DATABASE_PROVIDER === 'turso' || process.env.TURSO_DATABASE_URL) {
    return TursoBabyStore.create({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return new SQLiteBabyStore();
}

