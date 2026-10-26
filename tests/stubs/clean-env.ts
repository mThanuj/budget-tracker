// Tests must never use real keys or reach real services (AI providers,
// Razorpay, Neon), even when the shell has the app's settings exported.
// The app's name too, so tests always see the default ("ClearPaisa").
// tests/security/settings.test.ts checks this covers every setting in .env.example.
export const APP_SETTINGS =
  /^(LLM_|AI_|RAZORPAY_|BILLING_|DATABASE_URL|BETTER_AUTH_|GOOGLE_CLIENT_|CRON_SECRET$|ADMIN_EMAILS$|LEGAL_|SUPPORT_|BUSINESS_|NEXT_PUBLIC_APP_NAME$|NEXT_PUBLIC_SENTRY_DSN$|SENTRY_)/;
for (const key of Object.keys(process.env)) {
  if (APP_SETTINGS.test(key)) delete process.env[key];
}
// Plans and payments on, so the Pro paths are tested; "off" is tested with explicit env.
process.env.BILLING_ENABLED = "true";
