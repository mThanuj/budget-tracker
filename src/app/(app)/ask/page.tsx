import { Suspense } from "react";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { ChatPanel } from "@/components/ask/chat-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { PLANS } from "@/config/plans";
import { aiAvailableFor } from "@/server/ai";
import { aiAccess } from "@/server/ai/access";
import { chatQuestionsLeft } from "@/server/ai/quota";
import { razorpayConfig } from "@/server/billing/razorpay";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";

export const metadata = { title: "Ask" };

export default function AskPage({ searchParams }: PageProps<"/ask">) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ask about your money" description="Questions answered from your own entries, budgets and bills." />
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-2xl" />}>
        <AskContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function AskContent({ searchParams }: Pick<PageProps<"/ask">, "searchParams">) {
  const user = await requireUser();
  const { q } = z.object({ q: z.string().trim().min(2).max(500).optional().catch(undefined) }).parse(await searchParams);
  const access = await aiAccess(db, user.id);
  return (
    <ChatPanel
      available={aiAvailableFor(user)}
      initialLeft={await chatQuestionsLeft(db, user.id, access.limits)}
      initialQuestion={q ?? null}
      proDaily={access.plan.id === "free" && razorpayConfig() ? PLANS.pro.chatDaily : null}
    />
  );
}
