"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { AddEntryFab } from "@/components/transactions/add-entry-button";
import { NAV_ITEMS, type NavItem } from "./nav-config";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { href, label, icon: Icon } = item;
  const active = isActive(pathname, href);
  return (
    <li className="flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-1 py-2.5 text-[0.7rem] outline-none focus-visible:bg-muted",
          active ? "font-medium text-primary" : "text-muted-foreground",
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    </li>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => i.mobile);
  const half = Math.ceil(items.length / 2);
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around">
        {items.slice(0, half).map((item) => (
          <BottomLink key={item.href} item={item} pathname={pathname} />
        ))}
        <li className="flex flex-1 justify-center">
          <AddEntryFab className="-mt-5" />
        </li>
        {items.slice(half).map((item) => (
          <BottomLink key={item.href} item={item} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}
