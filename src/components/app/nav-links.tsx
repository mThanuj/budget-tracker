"use client";

import { EllipsisIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { AddEntryFab } from "@/components/transactions/add-entry-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function MoreMenu({ pathname }: { pathname: string }) {
  const items = NAV_ITEMS.filter((i) => i.mobile === "more");
  const active = items.some((i) => isActive(pathname, i.href));
  return (
    <li className="flex-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex w-full flex-col items-center gap-1 py-2.5 text-[0.7rem] outline-none focus-visible:bg-muted",
            active ? "font-medium text-primary" : "text-muted-foreground",
          )}
        >
          <EllipsisIcon className="size-5" aria-hidden />
          More
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-48">
          {items.map(({ href, label, icon: Icon }) => (
            <DropdownMenuItem key={href} render={<Link href={href} />} aria-current={isActive(pathname, href) ? "page" : undefined}>
              <Icon aria-hidden />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const bar = NAV_ITEMS.filter((i) => i.mobile === "bar");
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around">
        {bar.slice(0, 2).map((item) => (
          <BottomLink key={item.href} item={item} pathname={pathname} />
        ))}
        <li className="flex flex-1 justify-center">
          <AddEntryFab className="-mt-5" />
        </li>
        {bar.slice(2).map((item) => (
          <BottomLink key={item.href} item={item} pathname={pathname} />
        ))}
        <MoreMenu pathname={pathname} />
      </ul>
    </nav>
  );
}
