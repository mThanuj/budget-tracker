"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { callAction, NOT_SENT } from "@/lib/call-action";
import { sendTestError } from "@/server/actions/admin";

/** Checks that an error reaches Sentry and its alert reaches the owner. */
export function TestErrorButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function send() {
    setNote(null);
    startTransition(async () => {
      const result = await callAction(() => sendTestError());
      if (result === NOT_SENT) return;
      setNote(
        result.sent
          ? "Sent. It shows up in Sentry within a minute; the alert email follows."
          : "Not sent: error monitoring is off.",
      );
    });
  }

  return (
    <div className="grid gap-2">
      <Button variant="outline" className="justify-self-start" disabled={pending} onClick={send}>
        {pending ? "Sending…" : "Send a test error"}
      </Button>
      {note && (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
