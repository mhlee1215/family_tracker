import { readFileSync } from 'node:fs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const payload = event.client_payload || {};
const issueNumber = Number(payload.issue_number);
const status = process.env.SLACK_STATUS || 'started';
const runUrl = process.env.RUN_URL || '';

if (!issueNumber) {
  console.log('No issue_number in repository_dispatch payload.');
  process.exit(0);
}

const message = statusMessage(status, { request: payload.request, runUrl });
await createIssueComment(issueNumber, message);
await postSlackStatus(payload.slack?.response_url, message);

function statusMessage(nextStatus, { request, runUrl: url }) {
  if (nextStatus === 'completed') {
    return [
      'Family Tracker Slack request check completed.',
      '',
      `Request: ${request || 'No request text provided.'}`,
      `Run: ${url}`,
      '',
      'Current runner scope: intake acknowledgement plus syntax/tests. Code-changing PR automation is the next pipeline layer.',
    ].join('\n');
  }

  if (nextStatus === 'failed') {
    return [
      'Family Tracker Slack request check failed.',
      '',
      `Request: ${request || 'No request text provided.'}`,
      `Run: ${url}`,
    ].join('\n');
  }

  return [
    'Family Tracker Slack request received by GitHub Actions.',
    '',
    `Request: ${request || 'No request text provided.'}`,
    `Run: ${url}`,
  ].join('\n');
}

async function createIssueComment(issue, body) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issue}/comments`, {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'family-tracker-slack-dispatch-status',
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    throw new Error(`Failed to comment on issue: ${response.status} ${await response.text()}`);
  }
}

async function postSlackStatus(responseUrl, text) {
  if (!responseUrl) return;
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      response_type: 'ephemeral',
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to post Slack status: ${response.status} ${await response.text()}`);
  }
}

