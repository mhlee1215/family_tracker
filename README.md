# Family Tracker

![Build 124](https://img.shields.io/badge/build-124-0066cc)

Family Tracker is a local-first web/PWA for busy families.
It supports three everyday workflows with low-friction logging and review:

- **Baby tracking** (sleep, feeding, diaper, and timeline history)
- **Task tracking** (household/family task capture and management)
- **Meal tracking/planning** (meal ideas, meal state, and daily planning)
- **Home dashboard** (landing summary for today across Baby, Task, and Meal)
- **Shared daily context** (Home, Baby, Task, and Meal views stay on the same selected day)

Live app: <https://family-tracker-9f9.pages.dev/>

---

## Core Features

### 0) Home Dashboard

A landing dashboard at `/` summarizes the selected day before diving into a module.

- Baby timeline markers for today
- Due/open task attention chips plus completed-task rhythm
- Breakfast/lunch/dinner planning dots
- Deep links to `/baby`, `/tasks`, and `/meals` for detailed work

### 1) Baby Tracking

Designed for very short natural-language input such as `낮잠`, `깸`, `분유 먹음`, or `고구마 먹음`.

- Captures original user text
- Extracts explicit facts from the message
- Fills missing fields from context/defaults when possible
- Stores practical baby profile fields including birth time, weight, and height
- Saves dated growth records for birth, current, or custom dates and shows growth history summaries with a Chart.js-powered trend chart
- Marks inferred values separately from user-provided values
- Shows Baby status for last milk, diaper, and sleep state in a compact strip with a Recent 24h/Today toggle
- Estimates next milk timing, typical milk amount, and next diaper timing from selectable day/week/month history windows with expandable basis details and a time-vs-interval prediction plot
- Adds a Baby menu Patterns panel with selectable day/week/month-style periods, 24-hour activity lanes, interval insight cards, and comparison statistics
- Reuses successful natural-language logs as smart recent suggestions
- Tracks staged LLM-first baby work in `docs/llm-first-baby-tracker-roadmap.md`
- Supports core baby event types:
  - sleep
  - milk feeding
  - solid feeding
  - diaper
  - growth moments / milestones with photo or short-video thumbnail attachments

#### Growth moments and media

Baby tracking includes a `Moments` flow for memories such as first outings, rolling over, and first smiles. The current local-first MVP stores the moment as a structured `milestone` event and saves small generated thumbnails with the event so the Moments gallery can show a photo-first browsing card without forcing timeline thumbnail loads. Original photo/video object storage should be configured with private Cloudflare R2 before production media uploads. Keep R2 credentials in server environment variables only; browser code must never receive storage secrets. `R2_PUBLIC_BASE_URL` is optional and should stay blank for private buckets that use signed view URLs.

Recommended R2 environment variables for the production upload provider:

```bash
MEDIA_STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=family-tracker-media
# Optional. Leave blank for private buckets that use signed GET URLs.
R2_PUBLIC_BASE_URL=
MEDIA_UPLOAD_MAX_IMAGE_BYTES=10485760
MEDIA_UPLOAD_MAX_VIDEO_BYTES=104857600
```

Validate local R2 environment variables without printing secrets:

```bash
npm run check:r2
```

### 2) Task Tracking

Track family and household tasks in one place.

- Create/manage task items
- Keep local-first task state for quick daily updates
- Optional seeded/demo task flow for development and testing

### 3) Meal Tracking & Planning

Plan and track meals alongside baby/task workflows.

- Meal-planner navigation and local meal state
- Daily meal organization and review
- Built to fit into the same lightweight family routine UI

### 4) Alexa Interface (MVP)

Capture voice record text through Alexa and forward it to Family Tracker via a secured server-to-server endpoint.

- Unified record endpoint: `POST /api/integrations/alexa/record`
- Task-only compatibility endpoint: `POST /api/integrations/alexa/task`
- Lambda adapter example included at `integrations/alexa/lambda-handler.mjs`
- Parsing/NLU remains inside Family Tracker domain pipeline

---

## Product Direction

1. Local web/PWA with SQLite
2. Cloud accounts and sync
3. Capacitor packaging for iOS and Android

---

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

The app uses the server-side LLM provider for baby-log parsing when `LLM_PROVIDER` is set to a non-mock provider (`openai` or `mistral`) and the matching key is configured. The provider prompt stays minimal and the JSON schema carries the expected compact `{ "events": [...] }` format, including multiple events from one input when needed. Otherwise it uses the local heuristic parser; failed provider parses fall back to the heuristic parser and keep parser metadata on each event for debugging.

---

## Test

```bash
npm test
```

`npm test` runs the core Node unit suite. For browserless UI tests:

```bash
npm run test:unit
```

---

## Turso Sync

Set these values in `.env` locally and in Render or Cloudflare Pages environment variables:

```text
DATABASE_PROVIDER=turso
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...
```

Verify credentials without printing secrets:

```bash
npm run check:turso
npm run seed:turso:tasks
```

---

## API

```text
GET  /api/config
GET  /api/sync/state
GET  /api/logs/today?day=YYYY-MM-DD&timezone=Area/City
GET  /api/logs/today?range=recent24h&timezone=Area/City
GET  /api/action-logs?module=baby|task
POST /api/action-logs/:id/undo
POST /api/logs
POST /api/integrations/alexa/record
POST /api/integrations/alexa/task
POST /api/ask
GET  /api/profile
POST /api/profile
GET  /api/growth
```

Date-based endpoints use the request `timezone` when supplied, then the saved
profile timezone, and fall back to `UTC` only when neither is available. Stored
timestamps remain UTC ISO instants.

---

## CI/CD & Integrations

Pipeline automation exists for GitHub, Render, Cloudflare Pages, and Slack while keeping secrets outside the repo.

- GitHub CI: `.github/workflows/ci.yml`
- Render blueprint: `render.yaml`
- Cloudflare Pages config: `wrangler.toml`
- Slack task intake bot: `slack-codex-bot/`

Cloudflare Pages serves static files from `app/` and routes `/api/*` through
`functions/api/[[path]].js`, which calls the shared API handler in
`src/server/api/handler.js`. Production Cloudflare deployments must use Turso;
SQLite remains a Node-local development and test backend.

Local Cloudflare Pages runtime smoke:

```bash
cp .env .dev.vars # local only; never commit .dev.vars
npm run pages:dev
```

Required Cloudflare Pages environment variables:

```text
DATABASE_PROVIDER=turso
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
LLM_PROVIDER=mock # or openai/mistral
LLM_MODEL
OPENAI_MODEL
MISTRAL_MODEL
OPENAI_API_KEY
MISTRAL_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APP_BASE_URL=https://family-tracker-9f9.pages.dev
```

Render should be connected to `mhlee1215/family_tracker` with `autoDeploy` enabled.
Set runtime secrets in the Render dashboard:

```text
LLM_PROVIDER=openai
LLM_MODEL=gpt-5.4-mini # or mistral-small-latest when LLM_PROVIDER=mistral
OPENAI_MODEL=gpt-5.4-mini
MISTRAL_MODEL=mistral-small-latest
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

When `GITHUB_DISPATCH_EVENT` is configured, the Slack bot sends a `repository_dispatch` event.
`.github/workflows/slack-request.yml` receives it, comments on the issue, runs checks, and posts a status back via Slack `response_url`.

---

## Project Structure

```text
app/                  Browser UI
src/domain/           Parsing, inference, sleep-session logic, summaries
src/server/db/        SQLite and Turso persistence adapters
tests/                Node unit tests
docs/                 Architecture and LLM contract notes
server.js             Local static server and API
slack-codex-bot/      Slack command to GitHub issue intake
```

---

## E2E Test (Playwright)

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

Artifacts are saved under `test-results/e2e/` (HTML report, trace, and video on failures).
Each E2E spec also attaches a `scenario-steps` markdown narrative for PR review.
