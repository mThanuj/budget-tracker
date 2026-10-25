"use client";

import { ErrorView } from "@/components/app/error-view";

// A page inside the app failed: keep the navigation so people can move on.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
