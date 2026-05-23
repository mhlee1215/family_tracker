import { createIssue, dispatchCodexRequest } from './github.js';
import { postSlackResponse } from './slack.js';

export async function handleCodexSlashCommand({ config, command }) {
  const request = command.text || 'No request text provided.';
  const issue = await createIssue({
    token: config.githubToken,
    repo: config.githubRepo,
    title: createIssueTitle(request),
    labels: ['slack-request'],
    body: createIssueBody({ request, command }),
  });

  await dispatchCodexRequest({
    token: config.githubToken,
    repo: config.githubRepo,
    eventType: config.githubDispatchEvent,
    payload: {
      issue_number: issue.number,
      issue_url: issue.url,
      request,
      slack: {
        team_id: command.teamId,
        channel_id: command.channelId,
        channel_name: command.channelName,
        user_id: command.userId,
        user_name: command.userName,
        response_url: command.responseUrl,
      },
    },
  });

  await postSlackResponse(command.responseUrl, `Created Family Tracker task: ${issue.url}`);
  return issue;
}

function createIssueTitle(request) {
  const clean = request.replace(/\s+/g, ' ').trim();
  return clean.length > 64 ? `${clean.slice(0, 64)}...` : clean || 'Slack request';
}

function createIssueBody({ request, command }) {
  return [
    'Slack request for Family Tracker.',
    '',
    `Request: ${request}`,
    '',
    `User: ${command.userName || command.userId || 'unknown'}`,
    `Channel: ${command.channelName || command.channelId || 'unknown'}`,
  ].join('\n');
}

