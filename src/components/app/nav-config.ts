import {
  GaugeIcon,
  HouseIcon,
  ListIcon,
  type LucideIcon,
  MessageCircleQuestionIcon,
  RepeatIcon,
  Settings2Icon,
  TagsIcon,
  TargetIcon,
  WalletIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile: "bar" | "menu" };

// On mobile, "bar" items sit in the bottom bar around the add button (two on
// each side); the rest live in the header menu.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: HouseIcon, mobile: "bar" },
  { href: "/ask", label: "Ask", icon: MessageCircleQuestionIcon, mobile: "bar" },
  { href: "/transactions", label: "Entries", icon: ListIcon, mobile: "bar" },
  { href: "/budgets", label: "Budgets", icon: GaugeIcon, mobile: "bar" },
  { href: "/goals", label: "Goals", icon: TargetIcon, mobile: "menu" },
  { href: "/recurring", label: "Recurring", icon: RepeatIcon, mobile: "menu" },
  { href: "/wallets", label: "Wallets", icon: WalletIcon, mobile: "menu" },
  { href: "/categories", label: "Categories", icon: TagsIcon, mobile: "menu" },
  { href: "/settings", label: "Settings", icon: Settings2Icon, mobile: "menu" },
];

/** Bottom-bar order: Home, Entries | + | Budgets, Ask. */
export const BAR_ORDER = ["/dashboard", "/transactions", "/budgets", "/ask"];
