## What and why

<!-- What changes for users or developers, and why. Link the issue or request. -->

## Checks

<!-- Actual results, not intentions. CI runs the first line on every PR. -->

- [ ] `pnpm check` (lint, formatting, types, migrations, docs, all Vitest suites) and `pnpm build`
- [ ] `pnpm test:e2e` for UI changes (or: not needed because …)
- [ ] Touches a security-sensitive area (auth, actions, API routes, billing, headers, limits, CI, `tests/security/`)? If so, say which; the owner reviews it.

## Project memory

<!-- From docs/project-memory/README.md: which files you updated, or "memory review: no durable changes". -->
