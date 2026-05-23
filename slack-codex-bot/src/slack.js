import crypto from 'node:crypto';

const FIVE_MINUTES_SECONDS = 60 * 5;

export function verifySlackRequest({ signingSecret, timestamp, signature, rawBody, now = Date.now() }) {
  if (!signingSecret || !timestamp || !signature || !rawBody) return false;

  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime)) return false;

  const ageSeconds = Math.abs(Math.floor(now / 1000) - requestTime);
  if (ageSeconds > FIVE_MINUTES_SECONDS) return false;

  const expected = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex')}`;

  return safeEqual(expected, signature);
}

export function parseSlashCommand(rawBody) {
  const params = new URLSearchParams(rawBody);
  return {
    teamId: params.get('team_id') || '',
    channelId: params.get('channel_id') || '',
    channelName: params.get('channel_name') || '',
    userId: params.get('user_id') || '',
    userName: params.get('user_name') || '',
    command: params.get('command') || '',
    text: (params.get('text') || '').trim(),
    responseUrl: params.get('response_url') || '',
  };
}

export async function postSlackResponse(responseUrl, text) {
  if (!responseUrl) return;
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  });
  if (!response.ok) {
    throw new Error(`Slack response_url failed: ${response.status} ${await response.text()}`);
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

