import Link from "next/link";
import { cn } from "cn";

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/refund", label: "Refunds & cancellation" },
  { href: "/contact", label: "Contact" },
] as const;

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Policies" className={cn("flex flex-wrap gap-x-5 gap-y-2", className)}>
      {LEGAL_LINKS.map((l) => (
        <Link key={l.href} href={l.href} className="rounded underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
