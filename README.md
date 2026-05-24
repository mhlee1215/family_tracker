# Family Tracker

![Build 002](https://img.shields.io/badge/build-002-285b4c)

A local-first web/PWA prototype for logging baby and family activity with almost no input friction.

Live app: <https://family-tracker-fex9.onrender.com/>

The MVP focuses on baby tracking:

- sleep
- milk feeding
- solid feeding
- diaper

The product goal is to let parents enter very short natural-language logs such as `낮잠`, `깸`, `분유 먹음`, or `고구마 먹음`. The app stores the original text, extracts explicit facts, fills missing fields from context/defaults, and marks inferred values separately from user-provided values.

## Roadmap

1. Local web/PWA with SQLite.
2. Cloud accounts and sync.
3. Capacitor packaging for iOS and Android.

## Run Locally

```bash
cp .env.example .env
npm start
```

If the local shell does not have `npm`, bootstrap the project-local npm CLI:

```bash
sh scripts/bootstrap-npm.sh
node .tools/npm/bin/npm-cli.js install
node .tools/npm/bin/npm-cli.js test
```

Open:

```text
http://localhost:4174
```

The app runs in mock parsing mode unless a provider key is configured.

## Test

```bash
npm test
```

The tests use Node's built-in test runner.

## API

```text
GET  /api/config
GET  /api/logs/today
POST /api/logs
POST /api/ask
GET  /api/profile
POST /api/profile
```

## Pipeline

GitHub, Render, and Slack automation are prepared but secrets stay outside the repo.

- GitHub CI: `.github/workflows/ci.yml`
- Render blueprint: `render.yaml`
- Slack task intake bot: `slack-codex-bot/`

Render should be connected to `mhlee1215/family_tracker` with `autoDeploy` enabled. Add runtime secrets in the Render dashboard rather than committing them:

```text
OPENAI_API_KEY
MISTRAL_API_KEY
DATABASE_PROVIDER=turso
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APP_BASE_URL=https://family-tracker-fex9.onrender.com
```

Slack command setup needs:

```text
SLACK_SIGNING_SECRET
SLACK_BOT_TOKEN
GITHUB_TOKEN
GITHUB_REPO=mhlee1215/family_tracker
GITHUB_DISPATCH_EVENT=family_tracker_slack_request
```

When `GITHUB_DISPATCH_EVENT` is configured, the Slack bot sends a `repository_dispatch` event. `.github/workflows/slack-request.yml` receives that event, comments on the created issue, runs syntax/tests, and posts a status update back through Slack's `response_url`.

The current GitHub Actions runner is intentionally an intake verifier. A later runner can add the code-changing layer: create a `codex/*` branch, implement the issue, open a draft PR, and post the PR link back to Slack.

## Structure

```text
app/                  Browser UI
src/domain/           Parsing, inference, sleep-session logic, summaries
src/server/db/        SQLite persistence adapter
tests/                Node unit tests
docs/                 Architecture and LLM contract notes
server.js             Local static server and API
slack-codex-bot/      Slack command to GitHub issue intake
```
