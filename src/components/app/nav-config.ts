import { HouseIcon, Settings2Icon, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

// Grows as features land; the bottom bar on mobile shows these in order.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: HouseIcon },
  { href: "/settings", label: "Settings", icon: Settings2Icon },
];
