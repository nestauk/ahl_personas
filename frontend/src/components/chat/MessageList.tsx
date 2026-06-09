"use client";

import type { Message } from "ai";
import { useCallback, useEffect, useRef } from "react";
import type { ConversationStage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { PolicyCards } from "./PolicyCards";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  stage: ConversationStage;
  onSelectPolicy: (description: string) => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;

export function MessageList({
  messages,
  isLoading,
  stage,
  onSelectPolicy,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    if (!isNearBottom()) return;
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, isNearBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto">
        <div className="max-w-lg px-6 text-center">
          <h2 className="mb-2 text-lg font-medium text-[var(--color-text)]">
            Policy Equity Impact Analysis
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
            Describe a food environment policy you&apos;d like to analyse for
            equity impact. This can be a rough idea — I&apos;ll ask some
            questions to clarify the details. You can skip any question if
            you&apos;re unsure — it&apos;ll become an open question for the
            analysis to explore.
          </p>
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-800">
            This tool uses AI to analyse how food policies may affect different
            population groups, grounded in a curated evidence base of UK
            qualitative research. It is a pre-consultation analytical aid — it
            helps sharpen thinking before real engagement with affected
            communities, not as a substitute for that engagement.
          </div>
          <PolicyCards onSelectPolicy={onSelectPolicy} />
        </div>
      </div>
    );
  }

  const lastIdx = messages.length - 1;
  const lastIsAssistant = messages[lastIdx]?.role === "assistant";

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((message, i) => (
          <MessageBubble
            key={message.id}
            message={message}
          />
        ))}
        {isLoading && !lastIsAssistant && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
