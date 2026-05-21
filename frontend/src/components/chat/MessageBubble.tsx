"use client";

import type { Message } from "ai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

const SPEC_BLOCK_REGEX = /\s*<policy_spec>[\s\S]*?<\/policy_spec>\s*/g;
const SUBGROUPS_BLOCK_REGEX =
  /\s*<proposed_sub_groups>[\s\S]*?<\/proposed_sub_groups>\s*/g;

const EVIDENCE_TAG_REGEX =
  /\[Evidence:\s*([^\]]+)\]/g;
const ANALOGICAL_TAG_REGEX =
  /\[Analogical:\s*([^\]]+)\]/g;
const REASONING_TAG_REGEX = /\[Reasoning\]/g;
const GAP_TAG_REGEX = /\[Gap\]/g;

function stripStructuredBlocks(content: string): string {
  return content
    .replace(SPEC_BLOCK_REGEX, "")
    .replace(SUBGROUPS_BLOCK_REGEX, "")
    .trimEnd();
}

function renderGroundingBadges(content: string): string {
  return content
    .replace(
      EVIDENCE_TAG_REGEX,
      '<span class="badge-evidence">Evidence: $1</span>',
    )
    .replace(
      ANALOGICAL_TAG_REGEX,
      '<span class="badge-analogical">Analogical: $1</span>',
    )
    .replace(
      REASONING_TAG_REGEX,
      '<span class="badge-reasoning">Reasoning</span>',
    )
    .replace(GAP_TAG_REGEX, '<span class="badge-gap">Gap</span>');
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
