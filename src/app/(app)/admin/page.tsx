import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { type ReactNode, Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { missingLegalDetails } from "@/config/legal";
import { formatMoney } from "@/lib/money";
import { adminEmails, requireAdmin } from "@/server/admin";
import { globalAiLimit, providerChain } from "@/server/ai/config";
import { razorpayConfig } from "@/server/billing/razorpay";
import { db } from "@/server/db";
import { adminStats } from "@/server/services/admin-stats";

export const metadata = { title: "Admin" };

// Nothing renders before the admin check, so others only ever see a 404.
export default function AdminPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
      <AdminContent />
    </Suspense>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 className="font-heading text-lg">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? (
        <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-label="OK" />
      ) : (
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-label="Needs attention" />
      )}
      <span>{children}</span>
    </li>
  );
}

const OUTCOMES = [
  ["ok", "OK"],
  ["rate_limited", "Rate limited"],
  ["unavailable", "Down / timeout"],
  ["bad_output", "Bad output"],
  ["auth", "Key rejected"],
] as const;

async function AdminContent() {
  await requireAdmin();
  const s = await adminStats(db);
  const chain = providerChain();
  const proChain = providerChain(process.env, "LLM_CHAIN_PRO");
  const rzp = razorpayConfig();
  const legalMissing = missingLegalDetails();
  const today = s.aiByDay[0];
  const cap = globalAiLimit();

  return (
    <>
      <PageHeader title="Admin" description="How the app is doing. Only visible to ADMIN_EMAILS." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Users">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="All users" value={s.users.total} note={`${s.users.onboarded} finished welcome`} />
            <Stat label="New, 7 days" value={s.users.new7} note={`${s.users.new30} in 30 days`} />
            <Stat label="Active, 7 days" value={s.users.active7} note={`${s.users.entries7} entries added`} />
            <Stat label="AI switched off" value={s.users.aiOff} />
          </dl>
        </Card>

        <Card title="Pro">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Pro users" value={s.pro.total} note={`${s.pro.monthly} monthly · ${s.pro.yearly} yearly`} />
            <Stat
              label="Monthly revenue"
              value={formatMoney(s.pro.mrrMinor, "INR").replace(/\.00$/, "")}
              note="Estimate; yearly counted as ÷12"
            />
            <Stat label="Cancelling" value={s.pro.ending} note="Pro until period end" />
            <Stat label="Payment problems" value={s.pro.paymentProblems} note="Razorpay retrying" />
          </dl>
        </Card>

        <Card title="AI usage, last 14 days">
          <p className="text-sm text-muted-foreground">
            Today (UTC): {today.requests} of {Number.isFinite(cap) ? cap : "∞"} free-chain requests used.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">AI requests per day</caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-normal">
                    Day (UTC)
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">
                    Requests
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-normal">
                    Of which chat
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Fallbacks
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.aiByDay.map((d) => (
                  <tr key={d.day} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="tabular py-1.5 pr-3 text-left font-normal">
                      {d.day}
                    </th>
                    <td className="tabular py-1.5 pr-3 text-right">{d.requests}</td>
                    <td className="tabular py-1.5 pr-3 text-right">{d.chat}</td>
                    <td className="tabular py-1.5 text-right">{d.fallbacks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="AI providers, last 7 days">
          {s.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI calls yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Results per AI provider</caption>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-normal">
                      Provider
                    </th>
                    {OUTCOMES.map(([, label]) => (
                      <th key={label} scope="col" className="py-2 pr-3 text-right font-normal">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.providers.map((p) => (
                    <tr key={p.name} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                        {p.name}
                      </th>
                      {OUTCOMES.map(([key]) => (
                        <td key={key} className="tabular py-1.5 pr-3 text-right">
                          {p.outcomes[key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Every non-OK result moved the request on to the next model or provider.</p>
        </Card>

        <Card title="Setup checks">
          <ul className="grid gap-2">
            <Check ok={chain.length > 0}>
              AI chain: {chain.length > 0 ? chain.map((p) => p.name).join(" → ") : "no provider has a key"}
            </Check>
            <Check ok>
              Pro chain: {proChain.length > 0 ? proChain.map((p) => p.name).join(" → ") : "not set (Pro uses the free chain)"}
            </Check>
            <Check ok={rzp !== null}>
              Razorpay:{" "}
              {rzp ? (rzp.keyId.startsWith("rzp_live_") ? "live mode" : "test mode") : "not set up (Pro shows as coming soon)"}
            </Check>
            <Check ok={s.pro.doubleBilled === 0}>
              {s.pro.doubleBilled === 0
                ? "No one is paying for two subscriptions"
                : `${s.pro.doubleBilled} ${s.pro.doubleBilled === 1 ? "user has" : "users have"} two renewing subscriptions: cancel and refund one in Razorpay`}
            </Check>
            <Check ok={Boolean(rzp?.webhookSecret)}>Razorpay webhook secret {rzp?.webhookSecret ? "set" : "missing"}</Check>
            <Check ok={Boolean(process.env.CRON_SECRET?.trim())}>
              CRON_SECRET{" "}
              {process.env.CRON_SECRET?.trim() ? "set" : "missing (recurring entries only record when someone opens the app)"}
            </Check>
            <Check ok={legalMissing.length === 0}>
              Legal pages: {legalMissing.length === 0 ? "all details set" : `missing ${legalMissing.join(", ")}`}
            </Check>
            <Check ok={(process.env.BETTER_AUTH_URL ?? "").startsWith("https://")}>
              Site address: {process.env.BETTER_AUTH_URL ?? "not set"}
            </Check>
            <Check ok>Admins: {[...adminEmails()].length}</Check>
          </ul>
        </Card>
      </div>
    </>
  );
}
