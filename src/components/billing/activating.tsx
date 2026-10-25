"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkPaymentStatus } from "@/server/actions/billing";
import { callAction } from "@/lib/call-action";

/** After paying, Razorpay takes a moment to confirm the first charge. */
export function Activating() {
  const router = useRouter();
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    let tries = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // One check at a time: the next is scheduled only after this one finishes,
    // so slow responses can't pile up. A failed check is simply retried.
    const check = async () => {
      tries++;
      const pro = await callAction(() => checkPaymentStatus(), { notify: false });
      if (stopped) return;
      if (pro === true) router.refresh();
      else if (tries >= 15) setGaveUp(true);
      else timer = setTimeout(check, 4_000);
    };
    timer = setTimeout(check, 4_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
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
