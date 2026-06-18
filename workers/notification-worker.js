import webpush from 'web-push';
import { createClient } from '@libsql/client/web';

const BATCH_LIMIT = 50;
const PUSH_TTL_SECONDS = 60 * 60;

export default {
  async fetch() {
    return Response.json({ ok: true, service: 'family-tracker-notifications' });
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDueNotifications(env));
  },
};

async function sendDueNotifications(env) {
  validateEnv(env);
  configureVapid(env);
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
  try {
    const jobs = await listDueJobs(client, new Date().toISOString());
    for (const job of jobs) {
      await sendJob(client, job, env);
    }
  } finally {
    client.close?.();
  }
}

async function sendJob(client, job, env) {
  const subscriptions = await listSubscriptions(client, job.family_id, job.user_id);
  if (!subscriptions.length) {
    await markJobFailed(client, job.id, 'No active push subscriptions.', 'canceled');
    return;
  }

  const payload = JSON.stringify({
    title: job.title,
    body: job.body,
    data: {
      url: `/baby?day=${String(job.target_at || '').slice(0, 10)}`,
      jobId: job.id,
      type: job.type,
      targetAt: job.target_at,
    },
  });

  let successCount = 0;
  const failures = [];
  for (const subscription of subscriptions) {
    try {
      const response = await sendPush(subscription, payload, env);
      if (response.status === 404 || response.status === 410) {
        await disableSubscription(client, subscription.endpoint);
      }
      if (response.ok) {
        successCount += 1;
      } else {
        failures.push(`${response.status} ${response.statusText}`.trim());
      }
    } catch (error) {
      failures.push(String(error?.message || error));
    }
  }

  if (successCount > 0) {
    await markJobSent(client, job.id);
  } else {
    await markJobFailed(client, job.id, failures.slice(0, 3).join('; ') || 'Push delivery failed.');
  }
}

async function sendPush(row, payload, env) {
  const subscription = {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
  const request = webpush.generateRequestDetails(subscription, payload, {
    TTL: PUSH_TTL_SECONDS,
    urgency: 'normal',
    vapidDetails: vapidDetails(env),
  });
  return fetch(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
}

function configureVapid(env) {
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:family-tracker@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}

function vapidDetails(env) {
  return {
    subject: env.VAPID_SUBJECT || 'mailto:family-tracker@example.com',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
}

function validateEnv(env) {
  const missing = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']
    .filter((key) => !env[key]);
  if (missing.length) throw new Error(`Missing notification worker env: ${missing.join(', ')}`);
}

async function listDueJobs(client, now) {
  const result = await client.execute({
    sql: `SELECT * FROM notification_jobs
      WHERE status = 'pending' AND notify_at <= ?
      ORDER BY notify_at ASC, created_at ASC
      LIMIT ?`,
    args: [now, BATCH_LIMIT],
  });
  return result.rows;
}

async function listSubscriptions(client, familyId, userId) {
  const result = await client.execute({
    sql: `SELECT * FROM push_subscriptions
      WHERE family_id = ? AND user_id = ? AND disabled_at IS NULL
      ORDER BY updated_at DESC`,
    args: [familyId, userId],
  });
  return result.rows;
}

async function markJobSent(client, id) {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE notification_jobs
      SET status = 'sent', sent_at = ?, updated_at = ?
      WHERE id = ?`,
    args: [now, now, id],
  });
}

async function markJobFailed(client, id, reason, status = 'failed') {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE notification_jobs
      SET status = ?, failure_reason = ?, updated_at = ?
      WHERE id = ?`,
    args: [status, String(reason || '').slice(0, 500), now, id],
  });
}

async function disableSubscription(client, endpoint) {
  const now = new Date().toISOString();
  await client.execute({
    sql: `UPDATE push_subscriptions
      SET disabled_at = ?, updated_at = ?
      WHERE endpoint = ?`,
    args: [now, now, endpoint],
  });
}
