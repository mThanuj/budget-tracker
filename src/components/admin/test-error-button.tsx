"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { callAction, NOT_SENT } from "@/lib/call-action";
import { sentryDsn } from "@/lib/monitoring";
import { reportClientError } from "@/lib/report-client-error";
import { sendTestError } from "@/server/actions/admin";

const OFF = "Not sent: error monitoring is off.";

/** Checks that errors reach Sentry (from the server, and from this browser with its replay) and that alerts reach the owner. */
export function TestErrorButton() {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function sendServer() {
    setNote(null);
    startTransition(async () => {
      const result = await callAction(() => sendTestError());
      if (result === NOT_SENT) return;
      setNote(result.sent ? "Sent. It shows up in Sentry within a minute; the alert email follows." : OFF);
    });
  }

  function sendBrowser() {
    if (!sentryDsn()) return setNote(OFF);
    reportClientError(new Error("Test browser error from the admin page (safe to ignore)"));
    setNote("Sent from this browser. It shows up in Sentry within a minute, with a masked replay of this page.");
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={sendServer}>
          {pending ? "Sending…" : "Send a test error"}
        </Button>
        <Button variant="outline" onClick={sendBrowser}>
          Send a test browser error
        </Button>
      </div>
      {note && (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
