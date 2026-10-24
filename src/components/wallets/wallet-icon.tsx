import { BanknoteIcon, CreditCardIcon, LandmarkIcon, type LucideIcon, WalletIcon as WalletGlyph } from "lucide-react";
import { cn } from "cn";
import type { WalletKind } from "@/lib/wallets";

export const WALLET_KIND_ICON: Record<WalletKind, LucideIcon> = {
  cash: BanknoteIcon,
  bank: LandmarkIcon,
  credit_card: CreditCardIcon,
  other: WalletGlyph,
};

export function WalletIcon({
  kind,
  color,
  className,
}: {
  kind: WalletKind;
  color: string;
  className?: string;
}) {
  const Icon = WALLET_KIND_ICON[kind];
  return (
    <span
      aria-hidden
      className={cn("grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5", className)}
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      <Icon />
    </span>
  );
}
