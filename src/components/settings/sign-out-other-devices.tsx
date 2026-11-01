"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { callAction, NOT_SENT } from "@/lib/call-action";
import { signOutOtherDevices } from "@/server/actions/account";

export function SignOutOtherDevices() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      className="justify-self-start"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await callAction(() => signOutOtherDevices());
          if (result !== NOT_SENT) toast.success("Signed out of your other devices");
        })
      }
    >
      {pending ? "Signing out…" : "Sign out other devices"}
    </Button>
  );
}
