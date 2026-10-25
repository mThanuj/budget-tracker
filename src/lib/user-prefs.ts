import { DEFAULT_CURRENCY, DEFAULT_TIME_ZONE } from "@/config/defaults";
import { type ISODate, todayInTz } from "./dates";

// Signed-in users always have both settings (the columns are NOT NULL with
// these defaults), but the auth library types them as optional.
type Prefs = { currency?: string | null; timezone?: string | null };

export const userCurrency = (user: Prefs): string => user.currency ?? DEFAULT_CURRENCY;
export const userTimeZone = (user: Prefs): string => user.timezone ?? DEFAULT_TIME_ZONE;

/** Today's date where the user lives. */
export const userToday = (user: Prefs, now: Date = new Date()): ISODate => todayInTz(userTimeZone(user), now);
