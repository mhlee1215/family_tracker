import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

test('build metadata is managed from app/build.json only', () => {
  const { build, metadata } = JSON.parse(read('app/build.json'));
  assert.match(build, /^\d{3}$/);
  assert.match(metadata, /^\d{3}$/);

  const main = read('app/main.js');
  assert.doesNotMatch(main, /const APP_BUILD = '\d{3}';/);
  assert.match(main, /readBuildFromMetadata/);
  assert.match(main, /dataset\.metadata/);

  const sw = read('app/sw.js');
  assert.doesNotMatch(sw, /family-tracker-\d{3}/);
  assert.match(sw, /readBuildFromMetadata/);

  const html = read('app/index.html');
  assert.doesNotMatch(html, /Build \d{3}/);

  const readme = read('README.md');
  assert.match(readme, new RegExp(`!\\[Build ${build}\\]\\(https://img.shields.io/badge/build-${build}-0066cc\\)`));
});
