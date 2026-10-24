import {
  GaugeIcon,
  HouseIcon,
  ListIcon,
  type LucideIcon,
  Settings2Icon,
  TagsIcon,
  TargetIcon,
  WalletIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: "bar" | "more" };

// On mobile, "bar" items sit in the bottom bar around the add button; the rest
// live under "More".
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: HouseIcon, mobile: "bar" },
  { href: "/transactions", label: "Transactions", icon: ListIcon, mobile: "bar" },
  { href: "/budgets", label: "Budgets", icon: GaugeIcon, mobile: "bar" },
  { href: "/goals", label: "Goals", icon: TargetIcon, mobile: "more" },
  { href: "/wallets", label: "Wallets", icon: WalletIcon, mobile: "more" },
  { href: "/categories", label: "Categories", icon: TagsIcon, mobile: "more" },
  { href: "/settings", label: "Settings", icon: Settings2Icon, mobile: "more" },
];
