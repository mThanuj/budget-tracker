import {
  BabyIcon,
  BadgePercentIcon,
  BookOpenIcon,
  BriefcaseIcon,
  BusIcon,
  CarIcon,
  CircleEllipsisIcon,
  CirclePlusIcon,
  ClapperboardIcon,
  CoffeeIcon,
  DumbbellIcon,
  FuelIcon,
  Gamepad2Icon,
  GiftIcon,
  GraduationCapIcon,
  HeartHandshakeIcon,
  HeartPulseIcon,
  HouseIcon,
  LandmarkIcon,
  LaptopIcon,
  type LucideIcon,
  MusicIcon,
  PawPrintIcon,
  PiggyBankIcon,
  PillIcon,
  PlaneIcon,
  ReceiptIcon,
  RepeatIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  ShirtIcon,
  ShoppingBagIcon,
  ShoppingBasketIcon,
  SmartphoneIcon,
  SparklesIcon,
  StoreIcon,
  TagIcon,
  TrainFrontIcon,
  TrendingUpIcon,
  UtensilsIcon,
  WifiIcon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { cn } from "cn";
import type { CategoryIconName } from "@/lib/category-icons";

export const CATEGORY_ICONS: Record<CategoryIconName, LucideIcon> = {
  "shopping-basket": ShoppingBasketIcon,
  utensils: UtensilsIcon,
  coffee: CoffeeIcon,
  house: HouseIcon,
  receipt: ReceiptIcon,
  zap: ZapIcon,
  smartphone: SmartphoneIcon,
  wifi: WifiIcon,
  bus: BusIcon,
  car: CarIcon,
  fuel: FuelIcon,
  "train-front": TrainFrontIcon,
  "heart-pulse": HeartPulseIcon,
  pill: PillIcon,
  "shield-check": ShieldCheckIcon,
  clapperboard: ClapperboardIcon,
  "gamepad-2": Gamepad2Icon,
  music: MusicIcon,
  "shopping-bag": ShoppingBagIcon,
  shirt: ShirtIcon,
  repeat: RepeatIcon,
  plane: PlaneIcon,
  "graduation-cap": GraduationCapIcon,
  "book-open": BookOpenIcon,
  sparkles: SparklesIcon,
  dumbbell: DumbbellIcon,
  gift: GiftIcon,
  "heart-handshake": HeartHandshakeIcon,
  landmark: LandmarkIcon,
  "badge-percent": BadgePercentIcon,
  baby: BabyIcon,
  "paw-print": PawPrintIcon,
  wrench: WrenchIcon,
  briefcase: BriefcaseIcon,
  laptop: LaptopIcon,
  store: StoreIcon,
  "trending-up": TrendingUpIcon,
  "piggy-bank": PiggyBankIcon,
  "rotate-ccw": RotateCcwIcon,
  "circle-plus": CirclePlusIcon,
  "circle-ellipsis": CircleEllipsisIcon,
  tag: TagIcon,
};

/** A category's icon on a soft tint of its color. */
export function CategoryIcon({
  icon,
  color,
  size = "md",
  className,
}: {
  icon: string | null | undefined;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[(icon ?? "tag") as CategoryIconName] ?? TagIcon;
  const tint = color ?? "#8a7f72";
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        size === "sm" && "size-6 [&_svg]:size-3.5",
        size === "md" && "size-8 [&_svg]:size-4",
        size === "lg" && "size-10 [&_svg]:size-5",
        className,
      )}
      style={{ color: tint, backgroundColor: `color-mix(in oklab, ${tint} 14%, transparent)` }}
    >
      <Icon />
    </span>
  );
}
