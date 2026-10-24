"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkPaymentStatus } from "@/server/actions/billing";

/** After paying, Razorpay takes a moment to confirm the first charge. */
export function Activating() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let tries = 0;
    let stopped = false;
    const timer = setInterval(async () => {
      tries++;
      const pro = await checkPaymentStatus();
      if (stopped) return;
      if (pro) {
        clearInterval(timer);
        router.refresh();
      } else if (tries >= 15) {
        clearInterval(timer);
        setGaveUp(true);
      }
    }, 4_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  return (
    <div role="status" className="grid gap-1">
      <p className="font-medium">{gaveUp ? "Still confirming your payment" : "Confirming your payment…"}</p>
      <p className="text-sm text-muted-foreground">
        {gaveUp
          ? "Razorpay hasn't confirmed it yet. Pro switches on by itself once it does; you can leave this page."
          : "This usually takes under a minute. Pro switches on by itself."}
      </p>
    </div>
  );
}
