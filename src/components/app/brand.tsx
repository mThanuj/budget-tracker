import Link from "next/link";
import { cn } from "cn";
import { APP_NAME } from "@/config/app";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-7 text-primary", className)}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="currentColor" />
      <path
        d="M7.5 9h9M7.5 12.5h9M7.5 16h5"
        stroke="var(--primary-foreground)"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Brand({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg font-heading text-lg tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      <BrandMark />
      {APP_NAME}
    </Link>
  );
}
