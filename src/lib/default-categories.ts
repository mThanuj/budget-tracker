export type DefaultCategory = {
  name: string;
  kind: "income" | "expense";
  icon: string; // lucide icon name
  color: string;
};

// Muted, calm hues that read well on light and dark backgrounds.
const C = {
  green: "#3f9b74",
  teal: "#2f8f9d",
  blue: "#4a7fc1",
  indigo: "#6b6fc9",
  violet: "#8a64b8",
  pink: "#c0618d",
  red: "#c4605a",
  orange: "#cc7a3e",
  amber: "#b8923a",
  olive: "#7d8f45",
  slate: "#64748b",
  stone: "#8a7f72",
};

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { kind: "expense", name: "Groceries", icon: "shopping-basket", color: C.green },
  { kind: "expense", name: "Dining Out", icon: "utensils", color: C.orange },
  { kind: "expense", name: "Rent & Housing", icon: "house", color: C.indigo },
  { kind: "expense", name: "Bills & Utilities", icon: "receipt", color: C.blue },
  { kind: "expense", name: "Transport", icon: "bus", color: C.teal },
  { kind: "expense", name: "Fuel", icon: "fuel", color: C.amber },
  { kind: "expense", name: "Health", icon: "heart-pulse", color: C.red },
  { kind: "expense", name: "Insurance", icon: "shield-check", color: C.slate },
  { kind: "expense", name: "Entertainment", icon: "clapperboard", color: C.violet },
  { kind: "expense", name: "Shopping", icon: "shopping-bag", color: C.pink },
  { kind: "expense", name: "Subscriptions", icon: "repeat", color: C.indigo },
  { kind: "expense", name: "Travel", icon: "plane", color: C.teal },
  { kind: "expense", name: "Education", icon: "graduation-cap", color: C.blue },
  { kind: "expense", name: "Personal Care", icon: "sparkles", color: C.pink },
  { kind: "expense", name: "Gifts & Donations", icon: "gift", color: C.red },
  { kind: "expense", name: "EMI & Loans", icon: "landmark", color: C.stone },
  { kind: "expense", name: "Fees & Charges", icon: "badge-percent", color: C.slate },
  { kind: "expense", name: "Other", icon: "circle-ellipsis", color: C.stone },
  { kind: "income", name: "Salary", icon: "briefcase", color: C.green },
  { kind: "income", name: "Freelance", icon: "laptop", color: C.teal },
  { kind: "income", name: "Business", icon: "store", color: C.blue },
  { kind: "income", name: "Investments", icon: "trending-up", color: C.olive },
  { kind: "income", name: "Refunds & Cashback", icon: "rotate-ccw", color: C.amber },
  { kind: "income", name: "Gifts Received", icon: "gift", color: C.pink },
  { kind: "income", name: "Other Income", icon: "circle-plus", color: C.stone },
];
