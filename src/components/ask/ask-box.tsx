"use client";

import { MessageCircleQuestionIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUGGESTED_QUESTIONS } from "./chat-panel";
import { handOver } from "./handover";

/** Home-page entry point to the money chat: ask here, answer on the Ask page. */
export function AskBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    handOver(text);
    router.push(`/ask?q=${encodeURIComponent(text)}`);
  };
  return (
    <section aria-labelledby="ask-box-title" className="grid gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <h2 id="ask-box-title" className="flex items-center gap-2 font-heading text-lg">
        <MessageCircleQuestionIcon className="size-5 text-primary" aria-hidden />
        Ask about your money
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className="flex gap-2"
      >
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Your question"
          placeholder="How much did I spend on food last month?"
          className="h-10"
        />
        <Button type="submit" className="h-10" disabled={!q.trim()}>
          Ask
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {SUGGESTED_QUESTIONS.slice(1, 4).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => ask(s)}
            className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
