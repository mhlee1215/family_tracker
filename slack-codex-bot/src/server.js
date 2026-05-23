import http from 'node:http';
import { readConfig, validateConfig } from './config.js';
import { loadDotEnv } from './env.js';
import { handleCodexSlashCommand } from './jobs.js';
import { parseSlashCommand, verifySlackRequest } from './slack.js';

loadDotEnv();

const config = readConfig();
const missing = validateConfig(config);
if (missing.length) {
  console.warn(`Slack bot missing optional runtime config: ${missing.join(', ')}`);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && request.url === '/slack/commands') {
      const rawBody = await readRequestBody(request);
      const isValid = verifySlackRequest({
        signingSecret: config.slackSigningSecret,
        timestamp: request.headers['x-slack-request-timestamp'],
        signature: request.headers['x-slack-signature'],
        rawBody,
      });

      if (!isValid) {
        sendText(response, 401, 'Invalid Slack signature');
        return;
      }

      const command = parseSlashCommand(rawBody);
      sendJson(response, 200, {
        response_type: 'ephemeral',
        text: 'Family Tracker request received. I will create the GitHub task and report back here.',
      });

      handleCodexSlashCommand({ config, command }).catch((error) => {
        console.error('Failed to process Slack command:', error);
      });
      return;
    }

    sendText(response, 404, 'Not found');
  } catch (error) {
    console.error(error);
    sendText(response, 500, 'Internal server error');
  }
});

server.listen(config.port, () => {
  console.log(`Family Tracker Slack bot listening on http://localhost:${config.port}`);
});

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) request.destroy(new Error('Request body too large'));
    });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sendText(response, status, text) {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(text);
}

