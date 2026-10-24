"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { APP_NAME } from "@/config/app";
import { type BillingInterval, PRICES } from "@/config/plans";
import { Segmented } from "@/components/ui-extra/segmented";
import { Button } from "@/components/ui/button";
import { confirmCheckout, startCheckout } from "@/server/actions/billing";
import { openCheckout } from "./checkout";

export function UpgradePanel() {
  const router = useRouter();
  const [period, setPeriod] = useState<BillingInterval>("monthly");
  const [busy, setBusy] = useState(false);
  const [confirming, startConfirming] = useTransition();
  const price = PRICES[period];

  async function upgrade() {
    setBusy(true);
    const start = await startCheckout(period);
    if (!start.ok) {
      toast.error(start.error);
      setBusy(false);
      router.refresh(); // e.g. Pro turned out to be on already
      return;
    }
    try {
      await openCheckout(
        { key: start.keyId, subscription_id: start.subscriptionId, name: APP_NAME, description: start.description, prefill: start.prefill },
        {
          paid: (response) =>
            startConfirming(async () => {
              const result = await confirmCheckout(response);
              setBusy(false);
              if (!result.ok) toast.error(result.error);
              else toast.success(result.active ? "Pro is on. Thank you!" : "Payment received. Switching Pro on…");
            }),
          closed: () => setBusy(false),
          failed: (message) => toast.error(message),
        },
      );
    } catch {
      toast.error("Couldn't open the payment window. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Segmented
        className="justify-self-start"
        label="Billing period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "monthly", label: "Monthly" },
          { value: "yearly", label: "Yearly" },
        ]}
      />
      <p>
        <span className="font-heading text-3xl">{price.amount}</span> <span className="text-muted-foreground">{price.per}</span>
        {price.note && <span className="ml-2 text-sm text-primary">{price.note}</span>}
      </p>
      <Button size="lg" className="justify-self-start" disabled={busy || confirming} onClick={upgrade}>
        {confirming ? "Confirming payment…" : busy ? "Opening payment…" : "Get Pro"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Pay with UPI Autopay or a card through Razorpay. It renews automatically; cancel any time and Pro stays until the end of
        the period you paid for.
      </p>
    </div>
  );
}
