# Meal Planner Feature Skill

## When to use this skill
Changes to meal planning UX, meal navigation/tab behavior, wish-menu flow, or meal local storage rendering.

## Relevant files
- `app/index.html`
- `app/main.js`
- `app/styles.css`
- `README.md`

## Rules
- Keep Meal as an independent top-level module tab/view; do not embed it inside Task screens.
- Preserve localStorage compatibility for `familyTracker.meals`.
- Keep meal actions client-side unless server API is explicitly added.

## Checklist
- Verify Meal tab appears in top navigation.
- Verify `/meals` route opens the Meal view.
- Verify Task view no longer includes meal panel content.
- Run `npm test`.

## When to update this skill
- Meal domain model, route contract, or persistence strategy changes.
