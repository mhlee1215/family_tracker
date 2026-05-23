export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT || env.SLACK_BOT_PORT || 8787),
    publicBaseUrl: env.PUBLIC_BASE_URL || '',
    slackSigningSecret: env.SLACK_SIGNING_SECRET || '',
    slackBotToken: env.SLACK_BOT_TOKEN || '',
    githubToken: env.GITHUB_TOKEN || '',
    githubRepo: env.GITHUB_REPO || 'mhlee1215/family_tracker',
    githubDefaultBranch: env.GITHUB_DEFAULT_BRANCH || 'main',
    githubDispatchEvent: env.GITHUB_DISPATCH_EVENT || '',
  };
}

export function validateConfig(config) {
  return [
    ['SLACK_SIGNING_SECRET', config.slackSigningSecret],
    ['GITHUB_TOKEN', config.githubToken],
    ['GITHUB_REPO', config.githubRepo],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

