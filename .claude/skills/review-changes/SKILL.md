---
name: review-changes
description: Review a pull request or agent-made changes to ClearPaisa before merging - run the quality gates, check security-sensitive areas, and report findings.
---

# Review changes

An AI review supports a human one; it doesn't replace it. Changes in the
security-sensitive areas below need the owner's review.

## Gates

Mandatory for every change: `pnpm check` (`pnpm lint`, `pnpm format:check`,
`pnpm typecheck`, `pnpm db:check`, `pnpm docs:check`, `pnpm test`). CI runs these
plus `pnpm build` and `pnpm audit --audit-level=high` on every PR; run `pnpm build`
locally when config, routes, rendering or dependencies changed.
When relevant: `pnpm check:bundle` after a build (client code or env changes),
`pnpm test:e2e` (UI changes; needs the owner's environment),
`pnpm test:e2e:live` and `pnpm ai:*` (AI prompt or model changes; spend real quota, ask first).

## Steps

1. See what changed: `git status` and `git diff` for uncommitted work, or
   `git diff --stat main...HEAD` for a branch. Then read the full diff.
2. Run the gates above; record actual results.
3. Check each point:
   - **Access:** actions call `requireUser()` first; queries are scoped by
     `userId`; client ids are ownership-checked; new routes are in
     `tests/security/routes.test.ts` with a rule.
   - **Input:** every argument and external response is validated (Zod).
   - **Secrets and data:** no secrets in code, logs or the client; only
     `NEXT_PUBLIC_APP_NAME` is public; nothing user-specific cached or
     prerendered.
   - **Errors:** no swallowed errors or suppressed type/lint errors; expected
     failures use `UserError`.
   - **Tests:** new behaviour is tested; no test weakened or deleted without reason.
   - **Generated files:** `pnpm-lock.yaml` changes only with dependency changes;
     `drizzle/` changes only with `schema.ts` changes; `src/components/ui/`
     untouched unless regenerated; no `.next/`, logs or coverage committed.
   - **Scope:** nothing unrelated; behaviour changes match an approved request.
   - **Memory:** `docs/project-memory/` updated where the change needs it.
4. Security-sensitive areas, flag for the owner: `src/server/auth.ts`,
   `session.ts`, `admin.ts`, `action-utils.ts`, `src/proxy.ts`,
   `src/server/actions/**`, `src/app/api/**`, `src/server/billing/**`,
   `src/lib/security-headers.ts`, `src/config/limits.ts`, `src/env.ts`,
   `next.config.ts`, `vercel.json`, `scripts/vercel-build.mjs`,
   `.github/workflows/**`, `tests/security/**` (a change to the checks themselves),
   and agent permissions and tools: `.claude/settings.json`, `.mcp.json`, `.claude/skills/**`.

## Report

Findings ordered by severity, each with `file:line`, what's wrong and the
evidence; mark each as verified (reproduced or proven by a test) or suspected.
Then the gate results, and "approve", "approve with changes" or "needs changes".
