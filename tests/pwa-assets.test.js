import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

function assertPng(path) {
  assert.equal(existsSync(path), true, `${path} should exist`);
  assert.deepEqual([...readFileSync(path).subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
}

test('home screen and PWA artwork is linked and cacheable', () => {
  const html = read('app/index.html');
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/app\/icons\/family-tracker-icon-180\.png"/);
  assert.match(html, /class="home-hero-art" src="\/app\/assets\/family-tracker-illustration\.svg"/);

  const manifest = JSON.parse(read('app/manifest.webmanifest'));
  assert.deepEqual(manifest.icons.map((icon) => icon.src), [
    '/app/icons/family-tracker-icon-192.png',
    '/app/icons/family-tracker-icon-512.png',
  ]);
  assert.equal(manifest.icons[1].purpose, 'any maskable');

  const serviceWorker = read('app/sw.js');
  for (const asset of [
    '/app/assets/family-tracker-illustration.svg',
    '/app/icons/family-tracker-icon-180.png',
    '/app/icons/family-tracker-icon-192.png',
    '/app/icons/family-tracker-icon-512.png',
  ]) {
    assert.match(serviceWorker, new RegExp(asset.replace(/[/.]/g, '\\$&')));
  }

  assertPng('app/icons/family-tracker-icon-180.png');
  assertPng('app/icons/family-tracker-icon-192.png');
  assertPng('app/icons/family-tracker-icon-512.png');
});
