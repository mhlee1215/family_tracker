export async function createIssue({ token, repo, title, body, labels = [] }) {
  const response = await githubFetch({
    token,
    repo,
    path: '/issues',
    method: 'POST',
    body: { title, body, labels },
  });

  return {
    number: response.number,
    title: response.title,
    url: response.html_url,
  };
}

export async function dispatchCodexRequest({ token, repo, eventType, payload }) {
  if (!eventType) return null;
  await githubFetch({
    token,
    repo,
    path: '/dispatches',
    method: 'POST',
    body: {
      event_type: eventType,
      client_payload: payload,
    },
  });
  return { eventType };
}

async function githubFetch({ token, repo, path, method = 'GET', body }) {
  if (!token) throw new Error('GITHUB_TOKEN is required.');
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'family-tracker-slack-codex-bot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status} ${json?.message || text || response.statusText}`);
  }
  return json;
}

