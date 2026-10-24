import { fetchSubscription, razorpayConfig } from "@/server/billing/razorpay";
import { handleRazorpayWebhook } from "@/server/billing/subscriptions";
import { db } from "@/server/db";

// Razorpay → Settings → Webhooks points here, with the subscription.* events
// ticked and the same secret as RAZORPAY_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const cfg = razorpayConfig();
  if (!cfg?.webhookSecret) return new Response("Billing isn't set up", { status: 503 });
  // The signature covers the exact bytes, so read the body as text before parsing.
  const rawBody = await request.text();
  const result = await handleRazorpayWebhook(
    db,
    cfg,
    { rawBody, signature: request.headers.get("x-razorpay-signature"), eventId: request.headers.get("x-razorpay-event-id") },
    (id) => fetchSubscription(cfg, id),
  );
  return new Response(result.body, { status: result.status });
}
