// Icons and colors users can pick for categories. Names are lucide icon names;
// the component map lives in components/categories/category-icon.tsx.
export const CATEGORY_ICON_NAMES = [
  "shopping-basket",
  "utensils",
  "coffee",
  "house",
  "receipt",
  "zap",
  "smartphone",
  "wifi",
  "bus",
  "car",
  "fuel",
  "train-front",
  "heart-pulse",
  "pill",
  "shield-check",
  "clapperboard",
  "gamepad-2",
  "music",
  "shopping-bag",
  "shirt",
  "repeat",
  "plane",
  "graduation-cap",
  "book-open",
  "sparkles",
  "dumbbell",
  "gift",
  "heart-handshake",
  "landmark",
  "badge-percent",
  "baby",
  "paw-print",
  "wrench",
  "briefcase",
  "laptop",
  "store",
  "trending-up",
  "piggy-bank",
  "rotate-ccw",
  "circle-plus",
  "circle-ellipsis",
  "tag",
] as const;

export type CategoryIconName = (typeof CATEGORY_ICON_NAMES)[number];

export function isCategoryIcon(name: string): name is CategoryIconName {
  return (CATEGORY_ICON_NAMES as readonly string[]).includes(name);
}

export const SWATCHES = [
  "#3f9b74",
  "#2f8f9d",
  "#4a7fc1",
  "#6b6fc9",
  "#8a64b8",
  "#c0618d",
  "#c4605a",
  "#cc7a3e",
  "#b8923a",
  "#7d8f45",
  "#64748b",
  "#8a7f72",
] as const;
