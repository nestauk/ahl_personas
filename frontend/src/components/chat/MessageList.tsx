"use client";

import type { Message } from "ai";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="mb-2 text-lg font-medium text-[var(--color-text)]">
            Welcome
          </h2>
          <p className="text-sm leading-relaxed text-[var(--color-text-muted)]">
            Ask a question about food environment policies and their potential
            impact on different population groups. Responses are grounded in a
            curated evidence base of qualitative research.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
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
