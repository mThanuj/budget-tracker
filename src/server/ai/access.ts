import "server-only";
import { getUserPlan } from "../billing/plan";
import type { Db } from "../db";
import { globalAiLimit, providerChain } from "./config";
import type { AiLimits } from "./quota";

/**
 * Which providers and limits apply to this user. Pro users get the Pro chain
 * (a paid key first) when one is set up; otherwise everyone shares the free
 * chain, which is also what the global daily cap protects.
 */
export async function aiAccess(db: Db, userId: string, env: Record<string, string | undefined> = process.env) {
  const plan = await getUserPlan(db, userId, new Date(), env);
  const proChain = plan.id === "pro" ? providerChain(env, "LLM_CHAIN_PRO") : [];
  const limits: AiLimits = {
    userDaily: plan.limits.aiDaily,
    chatDaily: plan.limits.chatDaily,
    globalDaily: proChain.length > 0 ? Number.POSITIVE_INFINITY : globalAiLimit(env),
  };
  return { plan, chain: proChain.length > 0 ? proChain : providerChain(env), limits };
}
