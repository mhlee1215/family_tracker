import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMediaStorageConfig,
  normalizeMediaStorageProvider,
  publicMediaStorageConfig,
} from '../src/server/media-config.js';

test('media storage defaults to local with safe upload limits', () => {
  const config = getMediaStorageConfig({});
  assert.equal(config.provider, 'local');
  assert.equal(config.configured, true);
  assert.deepEqual(config.missing, []);
  assert.deepEqual(config.invalid, []);
  assert.equal(config.publicBaseUrlConfigured, false);
  assert.equal(config.maxImageBytes, 10 * 1024 * 1024);
  assert.equal(config.maxVideoBytes, 100 * 1024 * 1024);
});


test('local media storage ignores unrelated R2 optional URL values', () => {
  const config = getMediaStorageConfig({ MEDIA_STORAGE_PROVIDER: 'local', R2_PUBLIC_BASE_URL: 'not a url' });
  assert.equal(config.provider, 'local');
  assert.equal(config.configured, true);
  assert.deepEqual(config.invalid, []);
  assert.equal(config.publicBaseUrlConfigured, false);
});

test('R2 media storage reports missing secrets without exposing secret values', () => {
  const config = getMediaStorageConfig({ MEDIA_STORAGE_PROVIDER: 'r2', R2_BUCKET: 'family-tracker-media' });
  assert.equal(config.provider, 'r2');
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
  assert.equal(config.bucket, 'family-tracker-media');

  const publicConfig = publicMediaStorageConfig(config);
  assert.equal(publicConfig.bucket, 'family-tracker-media');
  assert.equal(Object.hasOwn(publicConfig, 'publicBaseUrl'), false);
  assert.equal(Object.hasOwn(publicConfig, 'R2_SECRET_ACCESS_KEY'), false);
  assert.equal(JSON.stringify(publicConfig).includes('secret'), false);
});

test('R2 media storage accepts complete env and normalizes optional public base URL', () => {
  const config = getMediaStorageConfig({
    MEDIA_STORAGE_PROVIDER: 'r2',
    R2_ACCOUNT_ID: 'account-id',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: 'family-tracker-media',
    R2_PUBLIC_BASE_URL: 'https://media.example.com/',
    MEDIA_UPLOAD_MAX_IMAGE_BYTES: '12345',
    MEDIA_UPLOAD_MAX_VIDEO_BYTES: '67890',
  });
  assert.equal(config.provider, 'r2');
  assert.equal(config.configured, true);
  assert.deepEqual(config.missing, []);
  assert.deepEqual(config.invalid, []);
  assert.equal(config.publicBaseUrl, 'https://media.example.com');
  assert.equal(config.publicBaseUrlConfigured, true);
  assert.equal(config.maxImageBytes, 12345);
  assert.equal(config.maxVideoBytes, 67890);
});

test('R2 media storage flags invalid optional values and falls back to safe limits', () => {
  const config = getMediaStorageConfig({
    MEDIA_STORAGE_PROVIDER: 'r2',
    R2_ACCOUNT_ID: 'account-id',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: 'family-tracker-media',
    R2_PUBLIC_BASE_URL: 'not a url',
    MEDIA_UPLOAD_MAX_IMAGE_BYTES: '-1',
    MEDIA_UPLOAD_MAX_VIDEO_BYTES: 'many',
  });
  assert.equal(config.configured, false);
  assert.deepEqual(config.missing, []);
  assert.deepEqual(config.invalid, ['R2_PUBLIC_BASE_URL', 'MEDIA_UPLOAD_MAX_IMAGE_BYTES', 'MEDIA_UPLOAD_MAX_VIDEO_BYTES']);
  assert.equal(config.publicBaseUrl, '');
  assert.equal(config.maxImageBytes, 10 * 1024 * 1024);
  assert.equal(config.maxVideoBytes, 100 * 1024 * 1024);
});

test('R2 bucket alone opts into R2 checks for deployment environments', () => {
  assert.equal(normalizeMediaStorageProvider('', 'family-tracker-media'), 'r2');
  assert.equal(normalizeMediaStorageProvider('local', 'family-tracker-media'), 'local');
});
