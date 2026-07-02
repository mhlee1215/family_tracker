# Camping Feature Skill

## When to use
National or state campsite search, availability monitoring, alerts, or assisted reservation launch.

## Relevant files
- `src/domain/national-camping.js`
- `src/server/api/handler.js`
- `app/index.html`
- `app/main.js`
- `app/styles.css`
- `tests/national-camping.test.js`
- `tests/e2e/specs/core-flows.spec.js`

## Rules
- Keep provider calls server-side; browser code must not call Recreation.gov directly.
- Do not store campground login, password, or payment card data in browser storage.
- Auto-confirm may launch the official reservation page, but must not bypass CAPTCHA or submit final payment.
- Prefer official Recreation.gov URLs and thin parsing over reservation-site scraping.

## Checklist
- Validate date ranges before availability checks.
- Keep final reservation review on the official site.
- Add one domain test for availability matching and one user-flow test for the visible Camping flow.
