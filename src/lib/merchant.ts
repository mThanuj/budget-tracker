// Words that appear in bank/UPI descriptions but don't identify the merchant.
const NOISE = new Set([
  "upi", "pos", "imps", "neft", "nach", "ecs", "ach", "txn", "ref", "payment", "paid", "pay",
  "to", "for", "the", "at", "via", "by", "on", "india", "pvt", "ltd", "private", "limited",
  "subscription", "monthly", "renewal", "auto", "debit", "bill", "online", "com", "www",
]);

/**
 * A stable key for "who was paid", so "Netflix 649", "NETFLIX.COM" and
 * "UPI/netflix/ref 8812" all group together. Empty if nothing meaningful is left.
 */
export function normalizeMerchant(description: string): string {
  const words = description
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE.has(w));
  return words.slice(0, 3).join(" ");
}
