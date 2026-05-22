"use client";

import type { Message } from "ai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { renderGroundingBadges } from "@/lib/grounding-badges";

const COMPLETE_SPEC_REGEX = /\s*<policy_spec>[\s\S]*?<\/policy_spec>\s*/g;
const COMPLETE_SUBGROUPS_REGEX =
  /\s*<proposed_sub_groups>[\s\S]*?<\/proposed_sub_groups>\s*/g;

const TRAILING_INCOMPLETE_BLOCK_REGEX =
  /\s*<(?:policy_spec|proposed_sub_groups)>[\s\S]*$/;
const TRAILING_PARTIAL_TAG_REGEX = /\s*<[a-z_]{0,25}$/;

function stripStructuredBlocks(content: string): string {
  let result = content
    .replace(COMPLETE_SPEC_REGEX, "")
    .replace(COMPLETE_SUBGROUPS_REGEX, "");

  result = result.replace(TRAILING_INCOMPLETE_BLOCK_REGEX, "");

  const trailingMatch = result.match(TRAILING_PARTIAL_TAG_REGEX);
  if (trailingMatch) {
    const fragment = trailingMatch[0].trimStart();
    if (
      "<policy_spec>".startsWith(fragment) ||
      "<proposed_sub_groups>".startsWith(fragment)
    ) {
      result = result.slice(0, trailingMatch.index);
    }
  }

  return result.trimEnd();
}

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const displayContent = isUser
    ? message.content
    : renderGroundingBadges(stripStructuredBlocks(message.content));

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
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
            >
              {displayContent}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
