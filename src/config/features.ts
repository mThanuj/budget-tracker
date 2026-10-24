// Payments and the Free/Pro plans. Off (the default): everyone is on Free and
// nothing about Pro or payments shows anywhere: no Billing page, pricing,
// upsells or refund policy. Turn on with BILLING_ENABLED="true" (and Razorpay
// keys). Some pages are static, so changing it needs a redeploy.
export function billingEnabled(env: Record<string, string | undefined> = process.env) {
  return env.BILLING_ENABLED?.trim() === "true";
}
