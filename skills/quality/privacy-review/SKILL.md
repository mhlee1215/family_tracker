# Privacy Review Quality Skill

## When to use this skill
Changes involving user/baby/family data, auth, sync, secrets, or provider calls.

## Relevant files
- `server.js`
- `src/server/auth.js`
- `src/server/db/*.js`
- Provider files under `src/domain/`
- CI/deploy scripts and config

## Rules
- Treat baby/family data as sensitive.
- Never commit secrets.
- Keep provider calls server-side only.
- Avoid logging secrets or excessive sensitive raw data.
- Manage Render/GitHub/Slack/Turso/OpenAI/Mistral secrets only through environment variables.

## Checklist
- Review changed logs/errors for sensitive data leakage.
- Verify browser code has no provider secret access.
- Verify token handling paths avoid plaintext exposure.

## When to update this skill
- Privacy/security policy or secret-management process changes.
