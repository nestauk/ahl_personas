"use client";

import type { Message } from "ai";
import Markdown from "react-markdown";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-5 py-3 ${
          isUser
            ? "bg-[var(--color-user-bg)] border border-[var(--color-user-border)] text-[var(--color-text)]"
            : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)]"
        }`}
      >
        {isUser ? (
          <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose max-w-none">
            <Markdown>{message.content}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
