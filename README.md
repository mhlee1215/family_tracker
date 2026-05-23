# Family Tracker

A local-first web/PWA prototype for logging baby and family activity with almost no input friction.

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

## Structure

```text
app/                  Browser UI
src/domain/           Parsing, inference, sleep-session logic, summaries
src/server/db/        SQLite persistence adapter
tests/                Node unit tests
docs/                 Architecture and LLM contract notes
server.js             Local static server and API
```

