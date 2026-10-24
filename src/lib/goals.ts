import { monthsBetween } from "./budgets";
import { type ISODate, monthOf } from "./dates";

export const GOAL_MILESTONES = [25, 50, 75, 100] as const;
export type GoalMilestone = (typeof GOAL_MILESTONES)[number];

export function goalProgress({
  targetMinor,
  savedMinor,
  targetDate,
  today,
}: {
  targetMinor: number;
  savedMinor: number;
  targetDate: ISODate | null;
  today: ISODate;
}) {
  const remainingMinor = Math.max(targetMinor - savedMinor, 0);
  const ratio = targetMinor > 0 ? Math.min(Math.max(savedMinor, 0) / targetMinor, 1) : 0;
  const reached = savedMinor >= targetMinor;

  let monthsLeft: number | null = null;
  let perMonthMinor: number | null = null;
  let overdue = false;
  if (targetDate && !reached) {
    if (targetDate < today) {
      overdue = true;
    } else {
      // Counts the current month and the target month.
      monthsLeft = monthsBetween(monthOf(today), monthOf(targetDate)) + 1;
      perMonthMinor = Math.ceil(remainingMinor / monthsLeft);
    }
  }
  return { remainingMinor, ratio, reached, monthsLeft, perMonthMinor, overdue };
}

/** The highest milestone (25/50/75/100%) a goal has passed, or null. */
export function highestMilestone(ratio: number): GoalMilestone | null {
  let reached: GoalMilestone | null = null;
  for (const m of GOAL_MILESTONES) if (ratio * 100 >= m) reached = m;
  return reached;
}
