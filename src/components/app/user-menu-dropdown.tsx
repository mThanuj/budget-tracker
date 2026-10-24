"use client";

import { CreditCardIcon, LogOutIcon, Settings2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenuDropdown({
  name,
  email,
  image,
  compact = false,
}: {
  name: string;
  email: string;
  image: string | null;
  compact?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "flex items-center gap-3 rounded-lg text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          compact ? "p-0.5" : "w-full p-2 hover:bg-sidebar-accent/60",
        )}
      >
        <Avatar>
          {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
        {!compact && (
          <span className="min-w-0">
            <span className="block truncate font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">{email}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? "end" : "start"} side={compact ? "bottom" : "top"} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings2Icon aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/billing" />}>
          <CreditCardIcon aria-hidden />
          Plan & billing
        </DropdownMenuItem>
        <DropdownMenuItem onClick={signOut}>
          <LogOutIcon aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
