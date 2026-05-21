"use client";

import type { Message } from "ai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const SPEC_BLOCK_REGEX = /\s*<policy_spec>[\s\S]*?<\/policy_spec>\s*/g;

function stripSpecBlocks(content: string): string {
  return content.replace(SPEC_BLOCK_REGEX, "").trimEnd();
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const displayContent = isUser
    ? message.content
    : stripSpecBlocks(message.content);

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
          <p className="leading-relaxed whitespace-pre-wrap">
            {displayContent}
          </p>
        ) : (
          <div className="prose max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>{displayContent}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
