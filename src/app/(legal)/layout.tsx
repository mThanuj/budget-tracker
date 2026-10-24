import { Brand } from "@/components/app/brand";
import { LegalLinks } from "@/components/legal/legal-links";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex h-16 items-center justify-between border-b border-border">
        <Brand />
      </header>
      <main className="flex-1">{children}</main>
      <footer className="grid gap-3 border-t border-border py-6 text-sm text-muted-foreground sm:flex sm:items-center sm:justify-between">
        <Brand className="text-base" />
        <LegalLinks />
      </footer>
    </div>
  );
}
