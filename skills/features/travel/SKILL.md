# Travel Feature Skill

## When to use
Travel flight search, fare/deal watches, provider status, and travel notification surfaces.

## Rules
- Do not add booking, payment, or reservation mutation unless explicitly requested.
- Keep travel provider keys server-side through environment variables.
- Label fare, cached deal, and flight-status results separately so status APIs do not look bookable.
- Prefer configured free-tier APIs first; show missing providers as unavailable instead of failing the whole search.
- Keep saved deal watches local unless cloud sync is explicitly requested.

## Checks
- Add domain tests for provider normalization and result merging.
- Add one user-flow test for the Travel tab search/watch path.
