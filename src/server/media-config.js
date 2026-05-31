const defaultMaxImageBytes = 10 * 1024 * 1024;
const defaultMaxVideoBytes = 100 * 1024 * 1024;

export function getMediaStorageConfig(env = process.env) {
  const provider = normalizeMediaStorageProvider(env.MEDIA_STORAGE_PROVIDER, env.R2_BUCKET);
  const missing = [];
  const invalid = [];

  if (provider === 'r2') {
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) {
      if (!String(env[key] || '').trim()) missing.push(key);
    }
  }

  const publicBaseUrl = normalizeOptionalUrl(env.R2_PUBLIC_BASE_URL, invalid, 'R2_PUBLIC_BASE_URL');
  const maxImageBytes = positiveInteger(env.MEDIA_UPLOAD_MAX_IMAGE_BYTES, defaultMaxImageBytes, invalid, 'MEDIA_UPLOAD_MAX_IMAGE_BYTES');
  const maxVideoBytes = positiveInteger(env.MEDIA_UPLOAD_MAX_VIDEO_BYTES, defaultMaxVideoBytes, invalid, 'MEDIA_UPLOAD_MAX_VIDEO_BYTES');

  return {
    provider,
    configured: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    bucket: provider === 'r2' ? String(env.R2_BUCKET || '').trim() : '',
    publicBaseUrl,
    publicBaseUrlConfigured: Boolean(publicBaseUrl),
    maxImageBytes,
    maxVideoBytes,
  };
}

export function publicMediaStorageConfig(config = getMediaStorageConfig()) {
  return {
    provider: config.provider,
    configured: config.configured,
    missing: config.missing,
    invalid: config.invalid,
    bucket: config.bucket,
    publicBaseUrlConfigured: config.publicBaseUrlConfigured,
    maxImageBytes: config.maxImageBytes,
    maxVideoBytes: config.maxVideoBytes,
  };
}

export function normalizeMediaStorageProvider(provider, r2Bucket = '') {
  const value = String(provider || '').trim().toLowerCase();
  if (value === 'r2' || value === 'local') return value;
  return String(r2Bucket || '').trim() ? 'r2' : 'local';
}

function positiveInteger(value, fallback, invalid, key) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    invalid.push(key);
    return fallback;
  }
  return number;
}

function normalizeOptionalUrl(value, invalid, key) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.toString().replace(/\/$/, '');
  } catch {
    invalid.push(key);
    return '';
  }
}
