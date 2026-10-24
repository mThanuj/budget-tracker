"use client";

import { useSearchParams } from "next/navigation";

/** Confirms a deleted account after the redirect back to the landing page. */
export function DeletedNotice() {
  const params = useSearchParams();
  if (params.get("deleted") !== "1") return null;
  return (
    <p role="status" className="mt-2 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
      Your account and everything in it has been deleted.
    </p>
  );
}
