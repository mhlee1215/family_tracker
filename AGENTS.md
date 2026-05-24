# Agent Instructions

This repository is Family Tracker, a local-first baby and family activity tracker prototype.

## Always Read First

- `docs/continuation-summary.md` for current product state and scope.
- `docs/architecture.md` for system boundaries and persistence/provider architecture.
- `docs/llm-contract.md` before changing parsing, inference, or question-answering behavior.
- `README.md` for local setup and endpoints.

## Product Direction

- The first product focus is the baby tracker.
- Input fatigue must stay low: short and incomplete entries such as `낮잠`, `깸`, `분유`, and `고구마 먹음` are first-class inputs.
- Store raw user text, explicit fields, system context, inferred fields, and later user corrections separately.
- Keep LLM calls server-side. Browser code must never read provider API keys.
- Favor local-first development with a clear path to cloud account sync and later Capacitor packaging.

## Frontend Design Direction

- Read `DESIGN.md` before substantial frontend layout, visual styling, UI polish, or interaction-state work.
- Treat `DESIGN.md` as the source of truth for the visual language: Apple-inspired, photography-first surfaces, SF Pro/system typography, Action Blue `#0066cc` as the single interactive accent, quiet chrome, tile-based rhythm, and no decorative gradients or UI shadows.
- Keep operational UI dense enough for repeated family tracking, but express it using the `DESIGN.md` tokens and component grammar.

## Implementation Rules

- Keep app rendering in `app/`.
- Keep product logic in `src/domain/` and cover it with `tests/*.test.js`.
- Keep server-side persistence adapters in `src/server/db/`.
- Do not add medical/health event types to the MVP unless explicitly requested.

## Verification

Run the relevant checks before finalizing when possible:

```bash
node --check app/main.js
node --check app/sw.js
node --test tests/*.test.js
```
