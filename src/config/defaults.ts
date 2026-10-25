// A new user's money settings. The database column defaults and the auth
// config use these too, so they're changed in one place. No imports: the
// schema (which drizzle-kit loads on its own) depends on this file.
export const DEFAULT_CURRENCY = "INR";
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";
