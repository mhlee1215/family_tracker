# Mock Task Seeding Skill

## When to use this skill
- Creating or updating demo/mock task data for local development.
- Rebalancing due-mode distribution for realistic product demos.

## Environment policy (project-specific)
- For all data-modification requests, treat **Turso** as the source of truth.
- Default target family scope for task data operations is **`family-admin`**.
- Seeded/mock task titles and text content must be written in **English**.

## Target profile
- Total task count: **about 100** (default exactly 100).
- Daily volume: **10 tasks/day** for the last 10 days.
- Assignee split per day: **Mom 5 + Dad 5**.
- Due-mode ratio across all seeded tasks:
  - `on_date`: **60%**
  - `before_date`: **30%**
  - `asap`: **5%**
  - `someday`: **5%**

## Content quality rules
- Use meaningful, action-oriented titles (avoid generic placeholders like `Task #12`).
- Keep titles realistic for household/baby-care workflows.
- Mix repeated routines with lightly varied wording.
- Do not append date strings to titles unless explicitly requested.

## Implementation hints
- Seed in deterministic order so screenshots/tests remain stable.
- Build due-mode buckets by exact counts first, then assign sequentially.
- For `asap`/`someday`, prefer `dueDate: null`.
- For `on_date`/`before_date`, set `dueDate` to the target day.

## Validation checklist
- Confirm total created tasks is 100.
- Confirm per-day Mom/Dad split is 5/5.
- Confirm due-mode counts are 60/30/5/5.
- Spot-check titles for readability and non-random naming.
