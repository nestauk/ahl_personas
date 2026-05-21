"use client";

import type { Message } from "ai";
import { useEffect, useRef } from "react";
import type { ConversationStage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { PolicyCards } from "./PolicyCards";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  stage: ConversationStage;
  onSelectPolicy: (description: string) => void;
}

export function MessageList({
  messages,
  isLoading,
  stage,
  onSelectPolicy,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);

  useEffect(() => {
    // Throttle auto-scroll to prevent layout thrashing during fast streaming
    const now = Date.now();
    if (now - lastScrollTime.current < 400) return;
    lastScrollTime.current = now;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center overflow-y-auto">
        <div className="max-w-lg px-6 text-center">
          <h2 className="mb-2 text-lg font-medium text-[var(--color-text)]">
            Policy Equity Impact Analysis
          </h2>
          <p className="mb-6 text-sm leading-relaxed text-[var(--color-text-muted)]">
            Describe a food environment policy you&apos;d like to analyse for
            equity impact. This can be a rough idea — I&apos;ll ask some
            questions to clarify the details.
          </p>
          <PolicyCards onSelectPolicy={onSelectPolicy} />
        </div>
      </div>
    );
  }

  const lastIdx = messages.length - 1;
  const lastIsAssistant = messages[lastIdx]?.role === "assistant";

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
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
