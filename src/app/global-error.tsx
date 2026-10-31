"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

// Last resort when the root layout itself fails. It replaces the whole
// document, so it can't rely on the app's stylesheet: inline styles only,
// using the app's paper/ink/primary colours.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f6f7f4", color: "#18211e", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong · ClearPaisa</title>
        <main style={{ maxWidth: 420, margin: "0 auto", padding: "96px 20px" }}>
          <p style={{ margin: 0, fontSize: 14, color: "#5b6661" }}>Something went wrong</p>
          <h1 style={{ margin: "8px 0", fontSize: 30, fontWeight: 600 }}>ClearPaisa didn&rsquo;t load</h1>
          <p style={{ color: "#5b6661" }}>Your entries are safe. Try again in a moment.</p>
          {/* A link, so it still works if this page's scripts can't run: Next may
              serve the prebuilt copy, which has no CSP nonce (D-027). */}
          <a
            href=""
            onClick={(event) => {
              event.preventDefault();
              retry();
            }}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "10px 16px",
              borderRadius: 8,
              background: "#0f6e66",
              color: "#f4fbf9",
              fontSize: 15,
              textDecoration: "none",
            }}
          >
            Try again
          </a>
        </main>
      </body>
    </html>
  );
}
