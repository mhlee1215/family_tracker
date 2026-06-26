import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);

  const html = read('app/index.html');
  assert.doesNotMatch(html, /Build \d{3}/);
  assert.match(html, new RegExp(`src="/app/main\\.js\\?build=${build}"`));

  const readme = read('README.md');
  assert.match(readme, new RegExp(`!\\[Build ${build}\\]\\(https://img.shields.io/badge/build-${build}-0066cc\\)`));
});

test('recovery page clears stale app service worker caches', () => {
  const recovery = read('app/recover.html');
  assert.match(recovery, /navigator\.serviceWorker\.getRegistrations/);
  assert.match(recovery, /registration\.unregister/);
  assert.match(recovery, /key\.startsWith\('family-tracker'\)/);
  assert.match(recovery, /cache-reset=/);

  const sw = read('app/sw.js');
  assert.match(sw, /'\/app\/recover\.html'/);
});

test('Cloudflare Pages build exposes service worker at root scope', () => {
  execFileSync(process.execPath, ['scripts/build-cloudflare-pages.js']);

  assert.equal(existsSync('.cloudflare-pages/sw.js'), true);
  assert.equal(read('.cloudflare-pages/sw.js'), read('app/sw.js'));
  assert.equal(existsSync('.cloudflare-pages/fund/index.html'), true);
  assert.equal(read('.cloudflare-pages/fund/index.html'), read('app/index.html'));
});

test('npm start uses the proxy-aware server launcher for Turso environments', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.start, 'npm run sync:build && node scripts/start-server.js');

  const launcher = read('scripts/start-server.js');
  assert.match(launcher, /DATABASE_PROVIDER/);
  assert.match(launcher, /TURSO_DATABASE_URL/);
  assert.match(launcher, /--use-env-proxy/);
  assert.match(launcher, /--dns-result-order=ipv4first/);
  assert.match(launcher, /import\('\.\.\/server\.js'\)/);

  const render = read('render.yaml');
  assert.match(render, /startCommand: \"npm start\"/);
});
