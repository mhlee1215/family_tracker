#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getMediaStorageConfig } from '../src/server/media-config.js';

loadEnv();
const config = getMediaStorageConfig();

if (config.provider !== 'r2') {
  console.log('Media storage provider is local. Set MEDIA_STORAGE_PROVIDER=r2 to enable R2 config checks.');
  process.exit(0);
}

if (!config.configured) {
  const parts = [];
  if (config.missing.length) parts.push(`missing: ${config.missing.join(', ')}`);
  if (config.invalid.length) parts.push(`invalid: ${config.invalid.join(', ')}`);
  console.error(`R2 media storage is not configured (${parts.join('; ')}).`);
  process.exit(1);
}

console.log(`R2 media storage config OK for bucket "${config.bucket}".`);
console.log(`Public base URL: ${config.publicBaseUrlConfigured ? 'configured' : 'not configured (private/signed URLs expected)'}`);
console.log(`Upload limits: images ${config.maxImageBytes} bytes, videos ${config.maxVideoBytes} bytes.`);

function loadEnv() {
  const envPath = join(resolve('.'), '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}
