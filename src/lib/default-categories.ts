export type DefaultCategory = {
  name: string;
  kind: "income" | "expense";
  icon: string; // lucide icon name
  color: string;
};

// Picked from the category colors (src/lib/category-colors.ts) so that each
// kind's defaults look different from each other (D-028), each staying near
// the hue it had before. tests/unit/category-colors.test.ts checks them.
export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { kind: "expense", name: "Groceries", icon: "shopping-basket", color: "#399e78" },
  { kind: "expense", name: "Dining Out", icon: "utensils", color: "#f55e07" },
  { kind: "expense", name: "Rent & Housing", icon: "house", color: "#8d7bc5" },
  { kind: "expense", name: "Bills & Utilities", icon: "receipt", color: "#0e6ee6" },
  { kind: "expense", name: "Transport", icon: "bus", color: "#047e67" },
  { kind: "expense", name: "Fuel", icon: "fuel", color: "#79720e" },
  { kind: "expense", name: "Health", icon: "heart-pulse", color: "#a24b39" },
  { kind: "expense", name: "Insurance", icon: "shield-check", color: "#894e7c" },
  { kind: "expense", name: "Entertainment", icon: "clapperboard", color: "#9f50b7" },
  { kind: "expense", name: "Shopping", icon: "shopping-bag", color: "#c2337c" },
  { kind: "expense", name: "Subscriptions", icon: "repeat", color: "#795de7" },
  { kind: "expense", name: "Travel", icon: "plane", color: "#1a8c26" },
  { kind: "expense", name: "Education", icon: "graduation-cap", color: "#3d91dd" },
  { kind: "expense", name: "Personal Care", icon: "sparkles", color: "#c467a4" },
  { kind: "expense", name: "Gifts & Donations", icon: "gift", color: "#ce585b" },
  { kind: "expense", name: "EMI & Loans", icon: "landmark", color: "#8c9425" },
  { kind: "expense", name: "Fees & Charges", icon: "badge-percent", color: "#4c72ab" },
  { kind: "expense", name: "Other", icon: "circle-ellipsis", color: "#ad753f" },
  { kind: "income", name: "Salary", icon: "briefcase", color: "#03875b" },
  { kind: "income", name: "Freelance", icon: "laptop", color: "#1c989f" },
  { kind: "income", name: "Business", icon: "store", color: "#497fc3" },
  { kind: "income", name: "Investments", icon: "trending-up", color: "#74964b" },
  { kind: "income", name: "Refunds & Cashback", icon: "rotate-ccw", color: "#e16d08" },
  { kind: "income", name: "Gifts Received", icon: "gift", color: "#bf6290" },
  { kind: "income", name: "Other Income", icon: "circle-plus", color: "#a57636" },
];

/**
 * The default colors before D-028 ("kind:name"), so the one-time recolor
 * (recolorCategories) can tell a default its owner never recolored.
 */
export const PREVIOUS_DEFAULT_COLORS: Record<string, string> = {
  "expense:Groceries": "#3f9b74",
  "expense:Dining Out": "#cc7a3e",
  "expense:Rent & Housing": "#6b6fc9",
  "expense:Bills & Utilities": "#4a7fc1",
  "expense:Transport": "#2f8f9d",
  "expense:Fuel": "#b8923a",
  "expense:Health": "#c4605a",
  "expense:Insurance": "#64748b",
  "expense:Entertainment": "#8a64b8",
  "expense:Shopping": "#c0618d",
  "expense:Subscriptions": "#6b6fc9",
  "expense:Travel": "#2f8f9d",
  "expense:Education": "#4a7fc1",
  "expense:Personal Care": "#c0618d",
  "expense:Gifts & Donations": "#c4605a",
  "expense:EMI & Loans": "#8a7f72",
  "expense:Fees & Charges": "#64748b",
  "expense:Other": "#8a7f72",
  "income:Salary": "#3f9b74",
  "income:Freelance": "#2f8f9d",
  "income:Business": "#4a7fc1",
  "income:Investments": "#7d8f45",
  "income:Refunds & Cashback": "#b8923a",
  "income:Gifts Received": "#c0618d",
  "income:Other Income": "#8a7f72",
};
