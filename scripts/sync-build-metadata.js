import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const buildFile = resolve(root, 'app/build.json');

const { build } = JSON.parse(readFileSync(buildFile, 'utf8'));

if (!/^\d{3}$/.test(build)) {
  throw new Error(`Invalid build format in app/build.json: "${build}" (expected 3-digit string)`);
}

const replacements = [
  {
    file: resolve(root, 'app/main.js'),
    pattern: /const APP_BUILD = '\d{3}';/,
    next: `const APP_BUILD = '${build}';`,
  },
  {
    file: resolve(root, 'app/sw.js'),
    pattern: /const CACHE_NAME = 'family-tracker-\d{3}';/,
    next: `const CACHE_NAME = 'family-tracker-${build}';`,
  },
  {
    file: resolve(root, 'app/index.html'),
    pattern: /Build \d{3}/,
    next: `Build ${build}`,
  },
  {
    file: resolve(root, 'README.md'),
    pattern: /!\[Build \d{3}\]\(https:\/\/img\.shields\.io\/badge\/build-\d{3}-0066cc\)/,
    next: `![Build ${build}](https://img.shields.io/badge/build-${build}-0066cc)`,
  },
];

for (const { file, pattern, next } of replacements) {
  const source = readFileSync(file, 'utf8');
  if (!pattern.test(source)) {
    throw new Error(`Pattern not found while syncing build in ${file}`);
  }
  const updated = source.replace(pattern, next);
  writeFileSync(file, updated, 'utf8');
}

console.log(`Synced build ${build} to app/main.js, app/sw.js, app/index.html, and README.md`);
