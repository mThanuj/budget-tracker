"use client";

import { ArrowLeftIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { BrandMark } from "@/components/app/brand";
import { CategoryIcon } from "@/components/categories/category-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatMonth } from "@/lib/date-format";
import { goalProgress } from "@/lib/goals";
import { formatMoney, minorToInput, parseMoney } from "@/lib/money";
import { buildPlan } from "@/lib/setup-plan";
import type { SetupRows, SetupStep } from "@/lib/setup-types";
import { applySetupAction, parseSetupAnswer, type SetupParseResult } from "@/server/actions/setup";
import { BillRows, GoalRows, IncomeRows, WalletRows } from "./rows-editor";

type Category = { id: string; name: string; icon: string; color: string };

export type SetupContextProps = {
  currency: string;
  today: string;
  ai: boolean;
  existingWallets: { name: string; kind: string }[];
  expenseCategories: Category[];
};

type StepKey = SetupStep | "watch" | "review";

const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: "wallets", title: "Where do you keep your money?", hint: "For example: “SBI savings with about 20k, an ICICI credit card with 3k due, and 2,000 cash.”" },
  { key: "incomes", title: "How much money comes in each month?", hint: "For example: “Salary 42k on the 1st, and about 5k from freelancing.”" },
  { key: "bills", title: "What do you pay every month, no matter what?", hint: "For example: “Rent 15,000 on the 5th, phone 299, Netflix 649, gym 1,500.”" },
  { key: "watch", title: "Where does money tend to slip away?", hint: "Pick the categories you'd like to keep an eye on. We'll suggest a monthly budget for each." },
  { key: "goals", title: "Anything you're saving up for?", hint: "For example: “A new phone for 60k by March, and an emergency fund of 1 lakh.”" },
  { key: "review", title: "Here's your starter plan", hint: "Check it, change anything you like, then apply. You can edit everything later." },
];

const PARSE_MESSAGES: Record<Exclude<SetupParseResult, { ok: true }>["reason"], string> = {
  too_short: "Type a little more, then try again.",
  disabled: "AI is switched off. Add the rows below yourself.",
  limit: "You've used today's AI requests. Add the rows below yourself.",
  busy: "The AI is busy right now. Add the rows below, or try again in a minute.",
  unreadable: "Couldn't make sense of that. Try rephrasing, or add the rows below.",
};

const total = (rows: { amount: string }[], currency: string) =>
  rows.reduce((sum, r) => sum + (parseMoney(r.amount, currency) ?? 0), 0);

function AnswerBox({ step, onRows }: { step: SetupStep; onRows: (rows: SetupRows[SetupStep]) => void }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await parseSetupAnswer(step, text);
          if (result.ok) {
            onRows(result.rows);
            setText("");
            setMessage(result.rows.length ? "Added below. Check the rows, then continue." : "Didn't find anything to add. Try adding more detail.");
          } else setMessage(PARSE_MESSAGES[result.reason]);
        });
      }}
      className="grid gap-2"
    >
      <label htmlFor={`answer-${step}`} className="sr-only">
        Your answer
      </label>
      <Textarea
        id={`answer-${step}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Type your answer in your own words"
        className="bg-background"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending || text.trim().length < 2}>
          <SparklesIcon aria-hidden />
          {pending ? "Reading…" : "Read my answer"}
        </Button>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </form>
  );
}

export function SetupFlow(props: SetupContextProps) {
  const router = useRouter();
  const { currency, today, ai } = props;
  const [index, setIndex] = useState(0);
  const [rows, setRows] = useState<SetupRows>({ wallets: [], incomes: [], bills: [], goals: [] });
  const [watch, setWatch] = useState<string[]>([]);
  const [limit, setLimit] = useState("");
  const [budgets, setBudgets] = useState<{ categoryId: string; amount: string }[]>([]);
  const [incomeWallet, setIncomeWallet] = useState("");
  const [billsWallet, setBillsWallet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applying, startApply] = useTransition();

  const step = STEPS[index];
  const walletNames = [
    ...props.existingWallets.map((w) => ({ name: w.name, kind: w.kind })),
    ...rows.wallets.filter((w) => w.name.trim() && !props.existingWallets.some((e) => e.name.toLowerCase() === w.name.trim().toLowerCase())).map((w) => ({ name: w.name.trim(), kind: w.kind })),
  ];
  const preferredWallet = (walletNames.find((w) => w.kind === "bank") ?? walletNames[0])?.name ?? "";
  const income = total(rows.incomes, currency);
  const bills = total(rows.bills, currency);

  function setStepRows<S extends SetupStep>(key: S, next: SetupRows[S]) {
    setRows((r) => ({ ...r, [key]: next }));
  }
  function appendRows(key: SetupStep, added: SetupRows[SetupStep]) {
    setRows((r) => {
      const seen = new Set(r[key].map((x) => x.name.trim().toLowerCase()));
      return { ...r, [key]: [...r[key], ...added.filter((x) => !seen.has(x.name.trim().toLowerCase()))] };
    });
  }

  function goTo(next: number) {
    if (STEPS[next]?.key === "review") {
      // Work out the suggested plan from the answers so far.
      const watched = props.expenseCategories.filter((c) => watch.includes(c.id));
      const plan = buildPlan({ monthlyIncomeMinor: income, monthlyBillsMinor: bills, watchCategories: watched.map((c) => c.name), currency });
      setLimit(plan.limitMinor ? minorToInput(plan.limitMinor, currency, { trimWhole: true }) : "");
      setBudgets(
        plan.categories.map((c) => ({
          categoryId: watched.find((w) => w.name === c.name)!.id,
          amount: minorToInput(c.amountMinor, currency, { trimWhole: true }),
        })),
      );
      setIncomeWallet((w) => w || preferredWallet);
      setBillsWallet((w) => w || preferredWallet);
    }
    setError(null);
    setIndex(next);
  }

  function apply() {
    startApply(async () => {
      const clean = <T extends { name: string }>(list: T[]) => list.filter((r) => r.name.trim());
      const result = await applySetupAction({
        wallets: clean(rows.wallets),
        incomes: clean(rows.incomes),
        bills: clean(rows.bills),
        goals: clean(rows.goals),
        incomeWallet,
        billsWallet,
        limit,
        categoryBudgets: budgets.filter((b) => b.amount.trim()),
      });
      if (result.ok) {
        toast.success("Your plan is ready");
        router.push("/dashboard");
      } else {
        const first = result.fieldErrors ? Object.entries(result.fieldErrors)[0] : null;
        const where = { wallets: "accounts", incomes: "income", bills: "bills", goals: "goals", limit: "monthly limit", categoryBudgets: "category budgets" }[first?.[0] ?? ""] ?? "";
        setError(first ? `Check your ${where}: ${first[1]}` : (result.error ?? "Something went wrong. Try again."));
      }
    });
  }

  const watched = props.expenseCategories.filter((c) => watch.includes(c.id));
  const plan = buildPlan({ monthlyIncomeMinor: income, monthlyBillsMinor: bills, watchCategories: [], currency });
  const limitMinor = parseMoney(limit, currency) ?? 0;

  return (
    <div className="grid gap-8">
      <div className="flex items-center justify-between gap-4">
        <ol className="flex gap-1.5" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s.key} className={cn("h-1.5 w-6 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
          ))}
        </ol>
        <span className="text-sm text-muted-foreground">
          Step {index + 1} of {STEPS.length}
        </span>
      </div>

      <div className="flex items-start gap-3">
        <BrandMark className="mt-0.5 size-8 shrink-0" />
        <div className="grid gap-1 rounded-2xl rounded-tl-sm bg-card px-4 py-3 ring-1 ring-foreground/10">
          <h1 className="font-heading text-xl">{step.title}</h1>
          <p className="text-sm text-muted-foreground">{step.hint}</p>
        </div>
      </div>

      {step.key === "wallets" && (
        <section className="grid gap-4">
          {props.existingWallets.length > 0 && (
            <p className="text-sm text-muted-foreground">
              You already have: {props.existingWallets.map((w) => w.name).join(", ")}. Mention them to set their balance.
            </p>
          )}
          {ai && <AnswerBox step="wallets" onRows={(r) => appendRows("wallets", r)} />}
          <WalletRows rows={rows.wallets} onChange={(r) => setStepRows("wallets", r)} />
        </section>
      )}
      {step.key === "incomes" && (
        <section className="grid gap-4">
          {ai && <AnswerBox step="incomes" onRows={(r) => appendRows("incomes", r)} />}
          <IncomeRows rows={rows.incomes} onChange={(r) => setStepRows("incomes", r)} />
        </section>
      )}
      {step.key === "bills" && (
        <section className="grid gap-4">
          {ai && <AnswerBox step="bills" onRows={(r) => appendRows("bills", r)} />}
          <BillRows rows={rows.bills} onChange={(r) => setStepRows("bills", r)} expenseCategories={props.expenseCategories} />
        </section>
      )}
      {step.key === "watch" && (
        <div role="group" aria-label="Categories to watch" className="flex flex-wrap gap-2">
          {props.expenseCategories.map((c) => {
            const on = watch.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setWatch((w) => (on ? w.filter((x) => x !== c.id) : [...w, c.id]))}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted",
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      {step.key === "goals" && (
        <section className="grid gap-4">
          {ai && <AnswerBox step="goals" onRows={(r) => appendRows("goals", r)} />}
          <GoalRows rows={rows.goals} onChange={(r) => setStepRows("goals", r)} today={today} />
        </section>
      )}

      {step.key === "review" && (
        <section aria-label="Your plan" className="grid gap-4">
          <div className="grid gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
            <ReviewLine label="Accounts">
              {walletNames.length ? walletNames.map((w) => w.name).join(", ") : "Just Cash for now"}
            </ReviewLine>
            <ReviewLine label="Comes in each month">
              {income > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {formatMoney(income, currency)} into
                  <WalletPicker value={incomeWallet} onChange={setIncomeWallet} names={walletNames.map((w) => w.name)} label="Income goes into" />
                </span>
              ) : (
                "Nothing added. You can add income later."
              )}
            </ReviewLine>
            <ReviewLine label="Goes out every month">
              {bills > 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  {formatMoney(bills, currency)} ({rows.bills.filter((b) => b.name.trim()).map((b) => b.name.trim()).join(", ")}) from
                  <WalletPicker value={billsWallet} onChange={setBillsWallet} names={walletNames.map((w) => w.name)} label="Bills are paid from" />
                </span>
              ) : (
                "No fixed bills added."
              )}
            </ReviewLine>
            <ReviewLine label="Monthly spending limit">
              <div className="grid gap-1">
                <Input aria-label="Monthly spending limit" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="decimal" placeholder="No limit" className="tabular h-9 w-40" />
                <span className="text-sm text-muted-foreground">
                  {income > 0 && limitMinor > 0
                    ? `Bills included. That leaves ${formatMoney(Math.max(income - limitMinor, 0), currency)} a month to save.`
                    : plan.notes[0]}
                </span>
              </div>
            </ReviewLine>
            {budgets.length > 0 && (
              <ReviewLine label="Category budgets">
                <ul className="grid gap-2">
                  {budgets.map((b, i) => {
                    const c = watched.find((w) => w.id === b.categoryId);
                    return (
                      <li key={b.categoryId} className="flex items-center gap-2 text-sm">
                        <CategoryIcon icon={c?.icon} color={c?.color} size="sm" />
                        <span className="w-32 truncate">{c?.name}</span>
                        <Input
                          aria-label={`${c?.name} budget`}
                          value={b.amount}
                          onChange={(e) => setBudgets((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                          inputMode="decimal"
                          className="tabular h-8 w-28"
                        />
                      </li>
                    );
                  })}
                </ul>
              </ReviewLine>
            )}
            {rows.goals.some((g) => g.name.trim()) && (
              <ReviewLine label="Saving for">
                <ul className="grid gap-1 text-sm">
                  {rows.goals.filter((g) => g.name.trim()).map((g) => {
                    const target = parseMoney(g.target, currency) ?? 0;
                    const p = goalProgress({ targetMinor: target, savedMinor: 0, targetDate: g.by || null, today });
                    return (
                      <li key={g.name}>
                        {g.name}: {formatMoney(target, currency)}
                        {g.by && p.perMonthMinor ? ` by ${formatMonth(g.by.slice(0, 7))}, about ${formatMoney(p.perMonthMinor, currency)} a month` : ""}
                      </li>
                    );
                  })}
                </ul>
              </ReviewLine>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Recurring income and bills start on their next date, so nothing is added today. You can change or remove anything later.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        {index > 0 ? (
          <Button variant="ghost" onClick={() => goTo(index - 1)} disabled={applying}>
            <ArrowLeftIcon aria-hidden />
            Back
          </Button>
        ) : (
          <span />
        )}
        {step.key === "review" ? (
          <Button size="lg" onClick={apply} disabled={applying} className="px-5">
            {applying ? "Setting things up…" : "Apply this plan"}
          </Button>
        ) : (
          <Button size="lg" onClick={() => goTo(index + 1)} className="px-5">
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

function ReviewLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-dashed border-border pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function WalletPicker({ value, onChange, names, label }: { value: string; onChange: (v: string) => void; names: string[]; label: string }) {
  return (
    <NativeSelect aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} size="sm">
      {names.map((n) => (
        <NativeSelectOption key={n} value={n}>
          {n}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
