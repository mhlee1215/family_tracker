# LLM-First Baby Tracker Roadmap

This roadmap keeps Baby Tracker work aligned with the current product direction: do **not** clone BabyTime feature-for-feature. Build a low-friction recording assistant where natural-language input, deterministic inference, provenance, and fast correction make baby logs easier to trust.

## PR naming convention

Use the stage code in PR titles so follow-up work is easy to pick up:

1. `LLM-BABY-01 Recording Loop Foundation`
2. `LLM-BABY-02 Field Correction and Provenance`
3. `LLM-BABY-03 Sleep Session Feedback`
4. `LLM-BABY-04 Event Catalog and Note Foundation`
5. `LLM-BABY-05 Recent Suggestion Management`

Each PR should close one stage unless the PR explicitly says it is a partial spike. If a PR is split further, copy the unfinished checkboxes into the next PR description.

## Global guardrails

- [ ] Keep provider calls server-side only; browser code must not call OpenAI/Mistral/etc. directly.
- [ ] Preserve raw user text as first-class data on every log.
- [ ] Never mark inferred/default/system-generated values as `explicit`.
- [ ] Store user-edited structured fields as `user_corrected`.
- [ ] Do not add auth, family invitations, permissions, cloud sync, push notifications, OS widgets, photos, or community features in these stages.
- [ ] Update `docs/llm-contract.md` whenever event types, parser output shape, or field semantics change.
- [ ] Add or update at least one user-flow scenario test for each user-visible stage.

---

## LLM-BABY-01 Recording Loop Foundation

**Status:** Done in `Add Today Context, recent-suggestion buttons, and multi-activity heuristic parsing`.

**Purpose:** Close the first end-to-end recording loop: a caregiver can type a natural-language log, see multiple structured records when appropriate, understand parser/estimate metadata, see today's current context, and reuse successful phrases.

### Scope checklist

- [x] Keep browser/provider boundary unchanged: browser submits logs to the app server, server owns LLM/provider parsing.
- [x] Preserve raw text for logs and timeline display.
- [x] Keep controlled shortcut buttons on deterministic heuristic parsing.
- [x] Support multi-event provider results for free-form input through the existing LLM contract.
- [x] Support multi-event local heuristic parsing when clear connector words combine supported activities.
- [x] Add user feedback after save: `1 log saved` / `N logs saved`.
- [x] Show parser source in timeline badges (`LLM`, `Heuristic`, or `System`).
- [x] Show inferred field badges in the timeline, such as `Amount estimated`.
- [x] Add `Today Context` domain summary for last milk, last diaper, sleep state, inferred field count, and corrected field count.
- [x] Return `context` from `GET /api/logs/today`.
- [x] Render `Today Context` cards in the Baby Tracker UI.
- [x] Let context cards jump/filter to related timeline entries.
- [x] Persist successful natural-language phrases as local recent suggestions.
- [x] Render recent suggestions next to existing quick actions.
- [x] Suggestion click fills the input instead of immediately saving, so the caregiver can review or edit before submit.
- [x] Add domain tests for multi-event heuristic parsing.
- [x] Add domain tests for `buildTodayContext`.
- [x] Add UI tests for context rendering, parser/estimate badges, save feedback, and recent suggestions.
- [x] Add E2E coverage for saving a mixed natural-language log and seeing context/suggestion updates.
- [x] Update README/build metadata and LLM contract docs for this stage.

### Explicit non-goals for Stage 1

- [ ] Field-level correction UI.
- [ ] `user_corrected` write path.
- [ ] Sleep session explanation messages.
- [ ] Suggestion deletion/management.
- [ ] New event types such as `note`, `medicine`, or `temperature`.
- [ ] Timeline grouping for events produced from one raw log.

---

## LLM-BABY-02 Field Correction and Provenance

**Status:** Next recommended PR.

**Purpose:** Make the LLM-first flow trustworthy by letting caregivers correct structured fields without rewriting the original note and without re-parsing unrelated fields.

### Scope checklist

- [ ] Add a field-level edit entry point from each timeline item.
- [ ] Keep the existing raw-text edit/re-parse flow available as a separate action or clearly named mode.
- [ ] Support editing `feeding_milk.amountMl`.
- [ ] Support editing `feeding_milk.feedingKind`.
- [ ] Support editing `diaper.diaperKind`.
- [ ] Support editing `occurredAt` for milk, solids, and diaper events.
- [ ] Support editing sleep `startAt` and `endAt` for completed sleep sessions.
- [ ] Recompute sleep `durationMinutes` when sleep start/end fields change.
- [ ] Save each edited structured field with `source: "user_corrected"`.
- [ ] Preserve original `rawText`, `rawLogId`, `parser`, and `parserInfo` after structured-field edits.
- [ ] Add or reuse an event-level API route for structured event updates.
- [ ] Validate event ownership/scope before updating event data.
- [ ] Refresh summary, Today Context, and timeline after a correction.
- [ ] Show corrected fields distinctly from inferred fields, for example `Amount corrected`.
- [ ] Add store tests for structured event update/hydration.
- [ ] Add domain/provenance tests confirming corrected fields are not marked `explicit`.
- [ ] Add UI tests for correcting amount and diaper kind.
- [ ] Add E2E scenario: save an inferred milk log, correct amount, verify summary/context/timeline update.
- [ ] Update `docs/llm-contract.md` if stored correction semantics are clarified.

### Done means

- [ ] A caregiver can fix a wrong amount/kind/time in under one dialog flow.
- [ ] Corrected values survive refresh.
- [ ] Corrected values affect summaries and Today Context.
- [ ] Provenance distinguishes `inferred`, `explicit`, and `user_corrected` in UI and stored events.

---

## LLM-BABY-03 Sleep Session Feedback

**Status:** Not started.

**Purpose:** Make natural-language sleep start/end/session linking understandable so caregivers trust auto-linked naps.

### Scope checklist

- [ ] On `낮잠` / `nap`, show clear open-sleep state: `Sleeping now`, start time, elapsed time.
- [ ] On `깸` / `woke up`, show feedback such as `Sleep saved · 35m`.
- [ ] When a wake log links to an open sleep, show which open sleep was closed.
- [ ] When feeding/solid/diaper auto-closes open sleep, show a non-alarming message such as `Open nap was closed at feeding time`.
- [ ] Keep hidden auto-wake events out of the visible timeline.
- [ ] Avoid double-counting linked sleep start/end events in summary and Today Context.
- [ ] Add UI tests for wake feedback and auto-close feedback.
- [ ] Add E2E scenario: `nap` -> `woke up` -> verify duration feedback and summary.
- [ ] Add E2E scenario: `nap` -> `formula` -> verify auto-close explanation.

### Done means

- [ ] Natural-language sleep start/end works without requiring the caregiver to understand linked internal events.
- [ ] The UI explains automatic linking and auto-close decisions.

---

## LLM-BABY-04 Event Catalog and Note Foundation

**Status:** Not started.

**Purpose:** Prepare future feature additions without randomly expanding parser/storage contracts.

### Scope checklist

- [ ] Create an event catalog table in docs for current and proposed event types.
- [ ] Document current event types: `sleep`, `feeding_milk`, `feeding_solid`, `diaper`.
- [ ] Document proposed `note` event with minimal fields.
- [ ] Document proposed `temperature` event with units and provenance expectations.
- [ ] Document proposed `medicine` event with name/dose/time fields.
- [ ] Document proposed `pumping` event and why it is or is not part of feeding.
- [ ] Document proposed `milestone` event and timeline/summary behavior.
- [ ] For each proposed type, list parser impact, summary impact, timeline filter impact, storage migration impact, and privacy considerations.
- [ ] Decide whether `note` should be the first expansion event.
- [ ] Update `docs/llm-contract.md` only when an event actually becomes supported by parser/provider output.

### Done means

- [ ] A follow-up implementer can add the next event type from a written contract rather than improvising.

---

## LLM-BABY-05 Recent Suggestion Management

**Status:** Not started.

**Purpose:** Keep suggestions useful without turning the UI into a cluttered button board.

### Scope checklist

- [ ] Label the suggestion area separately from fixed quick actions.
- [ ] Add delete/hide control for individual suggestions.
- [ ] Add clear-all suggestions control in baby settings or the suggestion area.
- [ ] Truncate long suggestion labels visually while preserving full text in title/accessible label.
- [ ] Prevent saving sensitive or overly long raw text as suggestions.
- [ ] Consider ranking by successful use count and recency.
- [ ] Add UI tests for delete and clear-all.
- [ ] Add E2E scenario for creating, using, and deleting a suggestion.

### Done means

- [ ] Suggestions remain caregiver-controlled and easy to remove.

---

## Backlog beyond these stages

- [ ] Timeline grouping for multiple events from one raw log.
- [ ] Parse result preview before saving.
- [ ] Weekly/monthly trend charts.
- [ ] Feeding timer or duration chips.
- [ ] Cloud sync, multi-caregiver auth/permissions, and native notifications.
