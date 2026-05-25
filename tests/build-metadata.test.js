import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('build metadata stays in sync across app surfaces', () => {
  const { build } = JSON.parse(read('app/build.json'));
  assert.match(build, /^\d{3}$/);

  const main = read('app/main.js');
  assert.match(main, new RegExp(`const APP_BUILD = '${build}';`));

  const sw = read('app/sw.js');
  assert.match(sw, new RegExp(`const CACHE_NAME = 'family-tracker-${build}';`));

  const html = read('app/index.html');
  assert.match(html, new RegExp(`Build ${build}`));

  const readme = read('README.md');
  assert.match(readme, new RegExp(`!\\[Build ${build}\\]\\(https://img.shields.io/badge/build-${build}-0066cc\\)`));
});
