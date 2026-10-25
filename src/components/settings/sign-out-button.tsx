"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { callAction } from "@/lib/call-action";
import { signOut } from "@/server/actions/account";

export function SignOutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={pending}
      // Goes to the landing page; if the request fails, a toast says so and the button comes back.
      onClick={() => startTransition(async () => void (await callAction(() => signOut())))}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
