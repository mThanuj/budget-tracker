// How much one account can create. Far above what a person typing things in
// ever needs; they exist so one scripted account can't fill the shared
// database's storage and stop saves for everyone. Totals count archived items
// too (archiving keeps the row). Daily limits are over the last 24 hours, and
// recurring entries the app records itself don't count. Server action calls
// are counted per minute (about 8 times the busiest normal use, the payment
// check every 4 seconds), so a script can't flood the database either.

export const LIMITS = {
  wallets: 50,
  categories: 150,
  goals: 50,
  recurringItems: 200,
  entriesPerDay: 1_000,
  goalContributionsPerDay: 300,
  alertDismissalsPerDay: 300,
  actionsPerMinute: 120,
} as const;
