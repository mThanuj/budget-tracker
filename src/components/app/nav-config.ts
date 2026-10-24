import {
  HouseIcon,
  ListIcon,
  type LucideIcon,
  Settings2Icon,
  TagsIcon,
  WalletIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: boolean };

// The mobile bottom bar shows the `mobile` items with the add button in the middle.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: HouseIcon, mobile: true },
  { href: "/transactions", label: "Transactions", icon: ListIcon, mobile: true },
  { href: "/wallets", label: "Wallets", icon: WalletIcon, mobile: true },
  { href: "/categories", label: "Categories", icon: TagsIcon, mobile: false },
  { href: "/settings", label: "Settings", icon: Settings2Icon, mobile: true },
];
