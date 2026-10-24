// Checks how well each configured AI provider turns notes into entries.
// Run it whenever you change a model or provider:  pnpm ai:eval
// Uses a fixed "today" (Saturday 24 Oct 2026) so results are repeatable.
// Sends only these test sentences; never touches the database.
import { DEFAULT_CATEGORIES } from "../src/lib/default-categories";
import { providerChain } from "../src/server/ai/config";
import { type EntryContext, extractEntryWithModel, toPrefill } from "../src/server/ai/parse-entry";
import { lanesFor } from "../src/server/ai/providers";

const ctx: EntryContext = {
  today: "2026-10-24",
  timeZone: "Asia/Kolkata",
  currency: "INR",
  wallets: [
    { id: "Cash", name: "Cash" },
    { id: "SBI Debit", name: "SBI Debit" },
    { id: "ICICI Credit Card", name: "ICICI Credit Card" },
  ],
  defaultWalletId: "Cash",
  categories: DEFAULT_CATEGORIES.map((c) => ({ id: c.name, name: c.name, kind: c.kind })),
};

type Expect = {
  type: "expense" | "income" | "transfer";
  amount: number;
  date?: string; // default: today
  wallet?: string;
  toWallet?: string;
  category?: string | string[];
};

const CASES: [string, Expect][] = [
  ["spent 240 on chai yesterday, paid cash", { type: "expense", amount: 240, date: "2026-10-23", wallet: "Cash", category: "Dining Out" }],
  ["uber to office 180", { type: "expense", amount: 180, category: "Transport" }],
  ["got salary 42k in SBI", { type: "income", amount: 42000, wallet: "SBI Debit", category: "Salary" }],
  ["paid 1.5L rent", { type: "expense", amount: 150000, category: "Rent & Housing" }],
  ["moved 5000 from SBI to cash", { type: "transfer", amount: 5000, wallet: "SBI Debit", toWallet: "Cash" }],
  ["ATM withdrawal 2000 from SBI", { type: "transfer", amount: 2000, wallet: "SBI Debit", toWallet: "Cash" }],
  ["netflix 649 on icici card", { type: "expense", amount: 649, wallet: "ICICI Credit Card", category: ["Subscriptions", "Entertainment"] }],
  ["groceries at big bazaar 2,380 on 21st", { type: "expense", amount: 2380, date: "2026-10-21", category: "Groceries" }],
  ["petrol 1150 last thursday on card", { type: "expense", amount: 1150, date: "2026-10-22", wallet: "ICICI Credit Card", category: "Fuel" }],
  ["refund from amazon 499", { type: "income", amount: 499, category: "Refunds & Cashback" }],
  ["paid credit card bill 15000 from sbi", { type: "transfer", amount: 15000, wallet: "SBI Debit", toWallet: "ICICI Credit Card" }],
  ["electricity bill 1,480", { type: "expense", amount: 1480, category: "Bills & Utilities" }],
  ["medicines 320 yesterday", { type: "expense", amount: 320, date: "2026-10-23", category: "Health" }],
  ["movie tickets 600", { type: "expense", amount: 600, category: "Entertainment" }],
  ["bought shoes for 2.5k", { type: "expense", amount: 2500, category: "Shopping" }],
  ["gift for mom 1000", { type: "expense", amount: 1000, category: "Gifts & Donations" }],
  ["freelance payment 18000 received", { type: "income", amount: 18000, category: "Freelance" }],
  ["emi 8500 home loan", { type: "expense", amount: 8500, category: "EMI & Loans" }],
  ["day before yesterday dinner 900", { type: "expense", amount: 900, date: "2026-10-22", category: "Dining Out" }],
  ["₹350 auto", { type: "expense", amount: 350, category: "Transport" }],
  ["cashback 50 on paytm", { type: "income", amount: 50, category: "Refunds & Cashback" }],
  ["spent 1200 on books", { type: "expense", amount: 1200, category: ["Education", "Shopping"] }],
  ["haircut 250", { type: "expense", amount: 250, category: "Personal Care" }],
  ["insurance premium 12,000", { type: "expense", amount: 12000, category: "Insurance" }],
  ["gym membership 1500", { type: "expense", amount: 1500, category: ["Health", "Personal Care", "Subscriptions"] }],
];

function check(expect: Expect, got: ReturnType<typeof toPrefill>) {
  if (!got) return ["no usable answer"];
  const wrong: string[] = [];
  const want = (field: string, ok: boolean, detail: string) => ok || wrong.push(`${field}: ${detail}`);
  want("type", got.type === expect.type, got.type);
  want("amount", got.amountMinor === expect.amount * 100, String(got.amountMinor / 100));
  want("date", got.occurredOn === (expect.date ?? ctx.today), got.occurredOn);
  if (expect.wallet) want("wallet", got.walletId === expect.wallet, String(got.walletId));
  if (expect.toWallet) want("toWallet", got.toWalletId === expect.toWallet, String(got.toWalletId));
  if (expect.category) {
    const ok = [expect.category].flat().includes(got.categoryId ?? "");
    want("category", ok, String(got.categoryId));
  }
  return wrong;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Free tiers limit tokens per minute: space requests out and wait out a 429 once.
async function withPacing<T>(call: () => Promise<T>, timing: { ms: number }): Promise<T> {
  await sleep(Number(process.env.AI_EVAL_DELAY_MS ?? 3000));
  const start = performance.now();
  try {
    const value = await call();
    timing.ms = performance.now() - start;
    return value;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status !== 429) throw err;
    const retryAfter = Number((err as { responseHeaders?: Record<string, string> }).responseHeaders?.["retry-after"]);
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 30) * 1000);
    return call();
  }
}

async function main() {
  const chain = providerChain();
  if (chain.length === 0) {
    console.log("No AI providers configured. Add keys in .env.local (see .env.example).");
    process.exit(1);
  }
  for (const p of chain) {
    console.log(`\n${p.name} · ${p.fastModel}`);
    const [lane] = lanesFor(p, "fast");
    let passed = 0;
    const times: number[] = [];
    for (const [text, expect] of CASES) {
      const timing = { ms: 0 };
      try {
        const got = toPrefill(ctx, await withPacing(() => extractEntryWithModel(lane, ctx, text), timing));
        if (timing.ms) times.push(timing.ms);
        const wrong = check(expect, got);
        if (wrong.length === 0) passed++;
        console.log(`  ${wrong.length === 0 ? "✓" : "✗"} ${text}${wrong.length ? `   → ${wrong.join(", ")}` : ""}`);
      } catch (err) {
        console.log(`  ✗ ${text}   → error: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    }
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0;
    console.log(`  ${passed}/${CASES.length} fully correct · median ${Math.round(median)} ms`);
  }
}

void main();
