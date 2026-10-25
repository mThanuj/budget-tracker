# Business rules

Rules the code enforces today. Breaking one is a behaviour change: it needs the
owner's approval, a test, and an update here. Each links to where it's enforced.
Verified against the code on 2026-10-25.

## Money and dates

- Amounts are integer minor units; decimals come from the currency
  (`currencyExponent`). One entry is under 1 billion in major units, and an
  amount must be positive. `src/lib/money.ts`, `src/lib/validation.ts`.
- Each user has one tracking currency and one time zone (`user.currency`,
  `user.timezone`); only real currency codes and time zones are accepted.
  "Today" is the user's today. `src/lib/user-prefs.ts`, `src/server/actions/settings.ts`.
- Entry dates must be within the last 10 years and at most a year ahead.
  `transactionSchema` in `src/lib/validation.ts`.

## Wallets and entries

- Wallet balance = opening balance + income − spending − transfers out +
  transfers in. A credit card's balance is negative when money is owed; its
  opening amount is entered as "what you owe" and stored negated.
  `listWallets` in `src/server/services/wallets.ts`, `walletSchema`.
- **Transfers move money between two different wallets and never count as
  income or spending** (reports, budgets, insights, summaries). They have no
  category. Schema check `transaction_transfer_shape`, `src/server/services/reports.ts`.
- An entry's category must be of the same kind (income or spending).
  Archived wallets and categories can't receive new entries; existing entries
  keep theirs. `assertEntryReferences` in `src/server/services/transactions.ts`.
- A wallet with entries or recurring items, or a category with entries, can
  only be archived, not deleted. Archiving a wallet pauses its recurring items
  and clears it as the default wallet. `services/wallets.ts`, `services/categories.ts`.
- New accounts get the default categories and a Cash wallet (signup hook,
  repeated safely at the end of onboarding). `src/server/db/seed-defaults.ts`.

## Budgets, goals and alerts

- One budget per category plus one overall monthly limit (category null).
  Rollover applies only to category budgets. Unique key
  `budget_user_category_key`, check `budget_rollover_shape`.
- A budget warns at 80% used and is "over" when the remainder is negative.
  `WARNING_RATIO` in `src/lib/budgets.ts`.
- Goal contributions set money aside: they count as saved, not as spending,
  and don't change wallet balances. Withdrawals are negative contributions.
  Milestones at 25/50/75/100%. `src/lib/goals.ts`, `services/goals.ts`.
- Alerts are computed for the current month only; dismissing one hides that
  exact alert key. `src/server/services/alerts.ts`.

## Recurring items and subscriptions

- A recurring item records each occurrence at most once (unique
  `transaction_rule_occurrence_key` on rule + date). "Auto" items are recorded
  by the daily job and when the user opens the app; "ask first" items wait on
  the home page. `src/server/services/recurring.ts`, `src/server/recurring-sync.ts`.
- A merchant is suggested as a subscription after 4 weekly, 3 monthly or 2
  yearly charges at a steady interval. `src/lib/subscriptions.ts`.

## Plans, AI and payments

- With `BILLING_ENABLED` off, everyone is on Free and nothing about plans
  shows. `src/config/features.ts`, `getUserPlan` in `src/server/billing/plan.ts`.
- Pro = an active subscription (or Razorpay retrying a charge), or a cancelled
  one until its paid period ends. One more than 7 days past its period without
  an update isn't trusted. `planFromSubscriptions`.
- Daily limits (`src/config/plans.ts`): Free 10 chat questions and 50 other AI
  requests, Pro 100 and 200; a global daily cap protects the shared free
  providers. Days are counted in UTC. `src/server/ai/quota.ts`.
- The insights write-up is Pro only and needs at least 5 entries in the period;
  last month's first report is included, check-ins and rewrites use one of the
  month's rewrites (5 for Pro). `src/server/actions/insights.ts`.
- AI never saves anything itself: it fills forms or proposes rows that the user
  confirms. Chat tools are read-only and scoped to the user. A user can switch
  AI off (`aiEnabled`). `src/server/ai/`.
- Checkout and webhooks only trust what Razorpay's API returns, verified by
  signature; a subscription id only counts for the user it was created for.
  `src/server/actions/billing.ts`, `src/server/billing/subscriptions.ts`.

## Accounts and access

- Every page, action and route is scoped to the signed-in user; another user's
  id is refused as if it didn't exist ("That … doesn't exist."). Enforced by
  services and checked by `tests/security/access-control.test.ts`.
- Per-account caps: wallets 50, categories 150, goals 50, recurring items 200
  (archived count too); per 24 hours: 1,000 entries (recurring ones excluded),
  300 goal savings, 300 dismissed alerts. `src/config/limits.ts`.
- Deleting the account first cancels any Pro renewal at Razorpay; if that
  fails, nothing is deleted. Then all the user's rows and sign-in cookies go.
  `src/server/actions/account.ts`.
- Export is a CSV of all the user's entries, with spreadsheet formulas
  neutralised. `src/server/services/account.ts`.
- `/admin` is for Google-verified emails in `ADMIN_EMAILS`; everyone else gets
  a 404. `src/server/admin.ts`.
- A link can't trigger an action for the user (see design decision D-017).
