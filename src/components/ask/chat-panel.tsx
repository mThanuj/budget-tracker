"use client";

import { RotateCcwIcon, SendHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { cn } from "cn";
import { BrandMark } from "@/components/app/brand";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askMoney, type ChatReply } from "@/server/actions/chat";
import { isHandedOver, takeHandedOver } from "./handover";
import { SimpleMarkdown } from "./simple-markdown";
import { EmptyState } from "@/components/app/empty-state";
import { callAction, NOT_SENT, NOT_SENT_MESSAGE } from "@/lib/call-action";

type Message = {
  role: "user" | "assistant";
  content: string;
  lookedUp?: string[];
  failed?: boolean;
  upgrade?: boolean;
};

export const SUGGESTED_QUESTIONS = [
  "How much did I spend on food last month?",
  "What are my biggest expenses this month?",
  "Can I afford a ₹5,000 trip this month?",
  "How am I doing on my budgets?",
  "What bills are coming up?",
];

const FAILURES: Record<Exclude<ChatReply, { ok: true }>["reason"], string> = {
  disabled: "AI features are switched off. Turn them on in Settings to ask questions.",
  limit: "You've used today's questions. They reset tomorrow.",
  busy: "The AI is busy right now. Try again in a minute.",
  invalid: "Something went wrong with that question. Try asking it again.",
};

/** Shown only to Free users when they run out, and only once payments are set up. */
function UpgradeNote({ proDaily }: { proDaily: number }) {
  return (
    <p className="text-sm">
      Pro gives you {proDaily} questions a day.{" "}
      <Link href="/billing" className="link-inline font-medium">
        See Pro
      </Link>
    </p>
  );
}

export function ChatPanel({
  available,
  initialLeft,
  initialQuestion,
  proDaily,
}: {
  available: boolean;
  initialLeft: number;
  initialQuestion: string | null;
  /** Pro's daily questions, when this user could upgrade; null otherwise. */
  proDaily: number | null;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  // A question that only came in the URL (a link from elsewhere) is filled in
  // for the person to send; see ./handover.
  const [input, setInput] = useState(() => (initialQuestion && !isHandedOver(initialQuestion) ? initialQuestion : ""));
  const [left, setLeft] = useState(initialLeft);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);

  function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    const history = [...messages.filter((m) => !m.failed), { role: "user" as const, content: text }];
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    startTransition(async () => {
      const reply = await callAction(() => askMoney(history.map(({ role, content }) => ({ role, content }))), {
        notify: false,
      });
      if (reply === NOT_SENT) {
        setMessages((m) => [...m, { role: "assistant", content: NOT_SENT_MESSAGE, failed: true }]);
        return;
      }
      setLeft(reply.left);
      setMessages((m) => [
        ...m,
        reply.ok
          ? { role: "assistant", content: reply.text, lookedUp: reply.lookedUp }
          : { role: "assistant", content: FAILURES[reply.reason], failed: true, upgrade: reply.upgrade },
      ]);
    });
  }

  // A question handed over from the home page's ask box is asked straight
  // away, once. useEffectEvent reads the latest props/send without re-running
  // the effect.
  const askHandedOver = useEffectEvent(() => {
    if (initialQuestion && available && !asked.current && takeHandedOver(initialQuestion)) {
      asked.current = true;
      send(initialQuestion);
    }
  });
  useEffect(() => {
    askHandedOver();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    end.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [messages, pending]);

  if (!available) {
    return (
      <EmptyState title="AI features are off">
        Turn them on in{" "}
        <Link href="/settings" className="link-inline">
          Settings
        </Link>{" "}
        to ask questions about your money.
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-5">
      {messages.length === 0 && left === 0 ? (
        <div className="grid gap-2 rounded-2xl bg-card px-5 py-4 ring-1 ring-foreground/10">
          <p>{FAILURES.limit}</p>
          {proDaily !== null && <UpgradeNote proDaily={proDaily} />}
        </div>
      ) : messages.length === 0 ? (
        <div className="grid gap-3">
          <p className="text-muted-foreground">Try one of these, or ask your own:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => send(q)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ol aria-label="Conversation" aria-live="polite" className="grid gap-4">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <li
                key={i}
                className="max-w-[85%] justify-self-end rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground"
              >
                {m.content}
              </li>
            ) : (
              <li key={i} className="flex max-w-[92%] items-start gap-3">
                <BrandMark className="mt-1 size-6 shrink-0" />
                <div
                  className={cn(
                    "grid gap-2 rounded-2xl rounded-tl-sm bg-card px-4 py-3 ring-1 ring-foreground/10",
                    m.failed && "text-muted-foreground",
                  )}
                >
                  <SimpleMarkdown text={m.content} />
                  {m.upgrade && proDaily !== null && <UpgradeNote proDaily={proDaily} />}
                  {m.lookedUp && m.lookedUp.length > 0 && (
                    <p className="text-xs text-muted-foreground">Looked up: {m.lookedUp.join(", ")}</p>
                  )}
                </div>
              </li>
            ),
          )}
          {pending && (
            <li className="flex items-center gap-3 text-sm text-muted-foreground">
              <BrandMark className="size-6 shrink-0" />
              <span className="animate-pulse">Looking at your numbers…</span>
            </li>
          )}
        </ol>
      )}
      <div ref={end} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-24 grid gap-2 rounded-2xl bg-card p-3 ring-1 ring-foreground/10 lg:bottom-4"
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <div className="flex items-end gap-2">
          <Textarea
            id="ask-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={500}
            placeholder="Ask about your spending, budgets, bills or goals"
            className="min-h-10 resize-none"
          />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={pending || !input.trim() || left === 0}>
            <SendHorizontalIcon />
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Answers come from your entries. Uses AI, so double-check anything important. Not financial advice.
          </span>
          <span className="flex items-center gap-3">
            {left} {left === 1 ? "question" : "questions"} left today
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => setMessages([])}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <RotateCcwIcon className="size-3" aria-hidden />
                New chat
              </button>
            )}
          </span>
        </div>
      </form>
    </div>
  );
}
