import { Brand } from "@/components/app/brand";
import { NotFoundView } from "@/components/app/status-view";

export const metadata = { title: "Page not found" };

// Unmatched URLs (outside the app shell).
export default function NotFound() {
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-5 sm:px-8">
      <header className="flex h-16 items-center">
        <Brand />
      </header>
      <main>
        <NotFoundView />
      </main>
    </div>
  );
}
