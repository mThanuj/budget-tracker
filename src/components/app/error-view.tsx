"use client";

import Link from "next/link";
import { useEffect } from "react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusView } from "./status-view";
import { reportClientError } from "@/lib/report-client-error";

/** Shown by the error boundaries. retry() re-fetches and re-renders the page. */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  // Errors from the server arrive with a generic message and a digest that
  // matches the server log entry, so the digest is safe to show for support.
  const digest = error instanceof Error && "digest" in error ? String(error.digest ?? "") : "";

  useEffect(() => {
    console.error(error);
    reportClientError(error);
  }, [error]);

  return (
    <StatusView
      eyebrow="Something went wrong"
      title="This page didn't load"
      actions={
        <>
          <Button size="lg" onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
            Go to Home
          </Link>
        </>
      }
    >
      <p>Your entries are safe. Try again in a moment; if it keeps happening, let us know.</p>
      {digest && <p className="mt-2 text-xs">Reference: {digest}</p>}
    </StatusView>
  );
}
