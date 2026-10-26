---
name: add-server-action
description: Add or change a feature that saves or reads user data in ClearPaisa - a new server action, a change to an existing one, or (rarely) a route handler. Use for new features and API changes.
---

# Add or change a server action

Server actions are this app's API (decision D-005). A route handler is only for
callers outside the app (webhooks, cron, downloads).

## Read first

- `docs/project-memory/architecture.md`: layers, the feature map row for your area.
- `docs/project-memory/business-rules.md` for the area.
- The existing files for the feature: `src/server/actions/<area>.ts`,
  `src/server/services/<area>.ts`, `src/lib/validation.ts`,
  `src/server/action-utils.ts`, and the component that will call it.
- A similar existing action, and its tests (`grep -rln "<actionName>" tests`).

## Steps

1. **Validation:** a Zod schema, in `src/lib/validation.ts` if forms share it
   (inline in the action for a small one-off), reusing the helpers
   (`moneyField`, `name`, `optionalId`, `idSchema` in `action-utils.ts`). Treat
   every argument as untrusted, including ones the UI never sends.
2. **Service:** a function in `src/server/services/<area>.ts` taking
   `(db, userId, …)`. Scope every query by `userId`; check ids from the client
   with the area's `getOwned*` helper; throw `UserError` for expected failures.
   Creating rows a user controls? Call `assertRoomFor` / `assertDailyRoomFor`
   (`services/limits.ts`). A new kind needs a number in `src/config/limits.ts`
   and an entry in `TOTALS` or `DAILY` in `services/limits.ts`.
3. **Action:** in `src/server/actions/<area>.ts` (`"use server"` file). First
   line `const user = await requireUser();`, then `runAction(async () => { …;
refresh(); })` for form-style results, or a typed result like the others.
4. **UI:** forms use `useFormAction` (`src/components/ui-extra/use-form-action.ts`);
   buttons and other calls use `callAction` and handle `NOT_SENT`.
5. **Tests:**
   - service behaviour: `tests/db/<area>.test.ts` (PGlite, `createTestDb`);
   - the action's results and validation: `tests/integration/actions.test.ts`;
   - if it takes an id: add a cross-user attempt to
     `tests/security/access-control.test.ts`, and raise the action count there;
   - UI flow: `tests/e2e/` or a component test.
6. **Route handler instead?** Add it to `REVIEWED` in
   `tests/security/routes.test.ts` with who may call it; check access first in
   the handler with `getSession()` and answer 401 (`requireUser()` redirects,
   which is wrong for an API caller), or a secret or signature; `Cache-Control: no-store` for user data; a `GET` that must run
   per request calls `await connection()` first.

## Don't

- Skip `requireUser()`, query without `userId`, or trust an id or field from the client.
- Add an env variable, a dependency or a database field without the owner's
  approval (schema changes: the `change-schema` skill).
- Put database code in components or `src/lib/`.

## Done when

- `pnpm vitest run <your test files>` passes, then `pnpm test:security` and `pnpm check`.
- `pnpm build` for a new route.
- Memory review done (`docs/project-memory/README.md`); feature map updated if
  you added an area.
