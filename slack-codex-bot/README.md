# Family Tracker Slack Codex Bot

Thin Slack front door for a Slack command -> GitHub issue -> optional GitHub Actions dispatch workflow.

## What It Does

- Accepts a Slack slash command at `POST /slack/commands`.
- Verifies Slack request signatures.
- Creates a GitHub issue in `mhlee1215/family_tracker`.
- Optionally sends a `repository_dispatch` event for a future coding runner.
- Posts status back into Slack using the command response URL.

## Environment

```text
SLACK_SIGNING_SECRET=...
SLACK_BOT_TOKEN=xoxb-...
GITHUB_TOKEN=...
GITHUB_REPO=mhlee1215/family_tracker
GITHUB_DEFAULT_BRANCH=main
GITHUB_DISPATCH_EVENT=family_tracker_slack_request
PORT=8787
PUBLIC_BASE_URL=https://...
```

## Run

```bash
cp .env.example .env
npm start
```

For local Slack testing, expose this server with a tunnel and set the Slack slash command request URL to:

```text
https://your-public-url/slack/commands
```

