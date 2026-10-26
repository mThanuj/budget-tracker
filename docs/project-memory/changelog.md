# Changelog

Significant changes to architecture, behaviour or the development workflow,
newest first. One line each, with the commit; `git log` has the rest. Add a line
when you merge something a future agent should know about.

## 2026-10-26

- Independent maintainability assessment: dismissed subscription suggestions now
  count toward the daily dismissal limit; writes after an ownership check also
  filter by `userId`; CI runs `pnpm audit --audit-level=high` (D-023); a settings
  drift test; agent worktrees ignored by git and ESLint; e2e cleanup removes AI
  usage counters; more ask rules in `.claude/settings.json`; docs corrected
  against the code (`97daa50`, docs in the next commit).

## 2026-10-25

- Agent tools: Next.js dev-server MCP (`.mcp.json`, pinned `next-devtools-mcp`)
  and Next's `next-bundle-optimizer` skill (decision D-022) (`8148e9b`).
- Agent instructions and this project memory (`AGENTS.md`, `CLAUDE.md`,
  `.claude/`, `docs/project-memory/`); `pnpm db:check` and `pnpm docs:check` in CI (`85300c0`).
- Dependabot: `react`/`react-dom` 19.3.1 (`cac5aa9`), `upload-artifact` v7 in the backup workflow (`004d025`).
- Team workflow: Prettier, CI on GitHub Actions, `pnpm check`, `typecheck` runs
  `next typegen`, exact dependency pins, README and architecture docs (`e69ba32`, reformat `b0b6836`).
- Per-account limits on how much one account can create (`12c24b3`).
- Security test suite `tests/security/` (`adaf604`).
- Review fixes: `/ask?q=` links no longer send questions; sign-out as a server
  action; faster money formatting (`8214053`).
- Integration and component tests, AI off by default in browser tests,
  `@live-ai` tag, focused test scripts (`6f11046`).
- Forms keep typed values after errors (`useFormAction`); only real currency
  codes accepted (`92dc43f`).
- Test runs write `test-<suite>.log` with live terminal output (`510bc77`).
- Reliability: `callAction`, validated external responses, safe config parsing (`30a7a15`).
- Error and 404 pages, tablet layout, accessibility pass (`f7eb35f`).
- Database pool timeouts (`68f9094`); shared logic centralised (`1b0ece5`).
- Security headers and CSP, Dependabot (`902bacc`).

## 2026-10-24

- Live on Vercel with payments switched off; nightly backups; restore guide (`480d15a`, `c641b3d`).
- Milestones 2–8: wallets, entries and categories; budgets, goals and the
  dashboard; recurring items and subscriptions; AI entry and categories; guided
  setup and the money chat; Pro plan, Razorpay and insights; legal pages,
  export, account deletion and admin (`1f856d6` … `71ed47a`).

## 2026-10-23

- Milestone 1: scaffold, Google sign-in, database and app shell (`30ca6e0`).
