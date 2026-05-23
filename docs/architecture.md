# Architecture

Family Tracker separates browser UI from product logic.

## Layers

```text
app/
  Browser rendering and event handling.

src/domain/
  Baby log parsing, field inference, sleep-session linking, summaries, and LLM provider boundaries.

src/server/db/
  SQLite-backed local persistence for profiles, raw logs, and structured events.

tests/
  Unit tests for product logic and persistence hydration.
```

## Local-First Path

The MVP stores data in SQLite under `.family-tracker/family-tracker.sqlite`.

The server talks to a store interface so a hosted database can later replace SQLite without rewriting the browser UI:

```text
sqlite-baby-store.js now
postgres-baby-store.js later
```

## Cloud Path

Schema objects already include family/user-friendly boundaries:

- `family_id`
- `baby_id`
- `author_id`

The local MVP uses default IDs. Cloud sync can later attach those IDs to real accounts.

## LLM Boundary

Provider calls stay server-side:

```text
browser -> /api/logs -> server -> llm-provider -> parser/inference -> store
```

The first implementation uses deterministic local parsing for development. The provider abstraction exists so OpenAI or another provider can be added without changing route or UI code.

## Platform Path

1. Web/PWA first.
2. Add cloud auth and sync.
3. Wrap the same web app with Capacitor for iOS and Android when native distribution, push notifications, camera, or voice integrations become useful.

