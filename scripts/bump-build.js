import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const buildFile = resolve(import.meta.dirname, '..', 'app/build.json');
const payload = JSON.parse(readFileSync(buildFile, 'utf8'));

if (!/^\d{3}$/.test(payload.build)) {
  throw new Error(`Invalid current build "${payload.build}". Expected 3-digit string.`);
}

const current = Number.parseInt(payload.build, 10);
if (!Number.isFinite(current) || current >= 999) {
  throw new Error(`Cannot bump build from "${payload.build}"`);
}

const next = String(current + 1).padStart(3, '0');
payload.build = next;

writeFileSync(buildFile, `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Bumped build ${String(current).padStart(3, '0')} -> ${next}`);
