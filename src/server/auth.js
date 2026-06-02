import { createId } from '../utils/ids.js';

export const defaultDevLoginId = 'admin-dev';
export const testDevLoginId = 'admin-test';

export const devAuthUsers = {
  'admin-dev': {
    provider: 'dev',
    providerId: 'admin-dev',
    email: 'admin-dev@local.dev',
    name: 'Admin Dev',
    familyId: 'family-admin-dev',
  },
  'admin-test': {
    provider: 'dev',
    providerId: 'admin-test',
    email: 'admin-test@local.dev',
    name: 'Admin Test',
    familyId: 'family-admin-test',
  },
};

export function getDevAuthUser(id) {
  return devAuthUsers[String(id || '').trim()] || null;
}

export function isDevAdminUser(user) {
  return Boolean(user && user.provider === 'dev' && devAuthUsers[user.providerId]);
}

export const sessionCookieName = 'ft_session';
export const oauthStateCookieName = 'ft_oauth_state';
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

export function parseCookies(header = '') {
  return Object.fromEntries(header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return [part, ''];
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }));
}

export function createSessionCookie(sessionId, request) {
  return serializeCookie(sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: sessionMaxAgeSeconds,
  });
}

export function clearSessionCookie(request) {
  return serializeCookie(sessionCookieName, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 0,
  });
}

export function createOAuthStateCookie(state, request) {
  return serializeCookie(oauthStateCookieName, state, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 600,
  });
}

export function clearOAuthStateCookie(request) {
  return serializeCookie(oauthStateCookieName, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureRequest(request),
    path: '/',
    maxAge: 0,
  });
}

export function getSessionIdFromRequest(request) {
  return parseCookies(request.headers.cookie || '')[sessionCookieName] || '';
}

export function createGoogleAuthUrl({ request, redirectUri }) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is required.');
  const state = createId('oauth');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri || googleRedirectUri(request));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return { url: url.toString(), state };
}

export async function exchangeGoogleCode({ request, code, redirectUri }) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.');
  }
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri || googleRedirectUri(request),
      grant_type: 'authorization_code',
    }),
  });
  const token = await response.json();
  if (!response.ok) {
    throw new Error(token.error_description || token.error || 'Google token exchange failed.');
  }
  return token;
}

export async function fetchGoogleUser(accessToken) {
  const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const user = await response.json();
  if (!response.ok) throw new Error(user.error_description || user.error || 'Google userinfo failed.');
  if (!user.email) throw new Error('Google account did not return an email.');
  return {
    provider: 'google',
    providerId: user.sub,
    email: user.email,
    name: user.name || user.email,
    picture: user.picture || '',
  };
}

export function googleRedirectUri(request) {
  return `${publicBaseUrl(request)}/api/auth/google/callback`;
}

export function publicBaseUrl(request) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const protocol = request.headers['x-forwarded-proto'] || (isSecureRequest(request) ? 'https' : 'http');
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return `${protocol}://${host}`;
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

function isSecureRequest(request) {
  return request.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
}

