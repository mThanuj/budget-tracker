"use client";

import { Brand } from "@/components/app/brand";
import { ErrorView } from "@/components/app/error-view";

// Public pages (landing, welcome, setup, policies).
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 sm:px-8">
      <header className="flex h-16 items-center">
        <Brand />
      </header>
      <main>
        <ErrorView error={error} retry={retry} />
      </main>
    </div>
  );
}
