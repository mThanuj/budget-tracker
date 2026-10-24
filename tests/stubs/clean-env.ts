// Tests must never use real keys or reach real services (AI providers,
// Razorpay, Neon), even when the shell has the app's settings exported.
const APP_SETTINGS = /^(LLM_|AI_|RAZORPAY_|DATABASE_URL|BETTER_AUTH_|GOOGLE_CLIENT_|CRON_SECRET$|ADMIN_EMAILS$|LEGAL_|SUPPORT_|BUSINESS_)/;
for (const key of Object.keys(process.env)) {
  if (APP_SETTINGS.test(key)) delete process.env[key];
}
