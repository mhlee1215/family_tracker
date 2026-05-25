import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const buildFile = resolve(root, 'app/build.json');
const { build } = JSON.parse(readFileSync(buildFile, 'utf8'));

if (!/^\d{3}$/.test(build)) {
  throw new Error(`Invalid build format in app/build.json: "${build}" (expected 3-digit string)`);
}

const readmeFile = resolve(root, 'README.md');
const source = readFileSync(readmeFile, 'utf8');
const pattern = /!\[Build \d{3}\]\(https:\/\/img\.shields\.io\/badge\/build-\d{3}-0066cc\)/;
if (!pattern.test(source)) {
  throw new Error('Build badge pattern not found in README.md');
}

const updated = source.replace(
  pattern,
  `![Build ${build}](https://img.shields.io/badge/build-${build}-0066cc)`,
);

writeFileSync(readmeFile, updated, 'utf8');
console.log(`Synced README build badge to ${build}`);
