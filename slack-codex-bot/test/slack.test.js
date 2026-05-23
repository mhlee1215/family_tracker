import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseSlashCommand, verifySlackRequest } from '../src/slack.js';

test('verifySlackRequest validates a signed body', () => {
  const signingSecret = 'secret';
  const timestamp = '1716420000';
  const rawBody = 'text=build+the+ui&user_name=min';
  const signature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest('hex')}`;

  assert.equal(verifySlackRequest({
    signingSecret,
    timestamp,
    signature,
    rawBody,
    now: Number(timestamp) * 1000,
  }), true);
});

test('parseSlashCommand returns normalized request text', () => {
  const command = parseSlashCommand('text=+make+timeline+better+&user_name=min&channel_name=dev');

  assert.equal(command.text, 'make timeline better');
  assert.equal(command.userName, 'min');
  assert.equal(command.channelName, 'dev');
});

