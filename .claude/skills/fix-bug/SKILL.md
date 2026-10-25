---
name: fix-bug
description: Investigate and fix a bug in ClearPaisa - reproduce it with a failing test, fix the cause, and prove the fix.
---

# Fix a bug

## Read first

- `docs/project-memory/known-issues.md` (it may be known) and
  `implementation-notes.md` (it may be a known gotcha).
- The feature map in `architecture.md` to find the page, action, service and tests.

## Steps

1. **Reproduce.** Find where it happens and why. Don't guess from the symptom:
   read the code path and its callers.
2. **Write a failing test** at the lowest layer that shows the bug: `tests/unit`
   for pure logic, `tests/db` for queries, `tests/integration` for an action or
   route, `tests/component` for UI behaviour, `tests/e2e` only if nothing lower can.
   Run it and confirm it fails for the reason you think.
3. **Fix the cause** with the smallest change that does it, in the existing style.
4. Run the new test (passes), then the suite it's in, then `pnpm check`.
5. Look for the same bug elsewhere (similar code, the same pattern).

## Don't

- Change a test to match the buggy behaviour, or delete a failing test.
- Silence the error (`@ts-ignore`, empty `catch`, `eslint-disable`).
- Change a business rule as a "fix" without the owner's approval.

## Done when

- The new test fails without the fix and passes with it; `pnpm check` passes.
- The report says what the cause was and how the test proves the fix.
- Memory: remove it from `known-issues.md` if listed, add a gotcha to
  `implementation-notes.md` if it's one, a `changelog.md` line if significant.
