"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { renderGroundingBadges } from "@/lib/grounding-badges";

const COMPLETE_SUBGROUPS_REGEX =
  /\s*<proposed_sub_groups>[\s\S]*?<\/proposed_sub_groups>\s*/g;
const TRAILING_INCOMPLETE_REGEX =
  /\s*<(?:proposed_sub_groups|policy_spec)>[\s\S]*$/;
const TRAILING_PARTIAL_TAG_REGEX = /\s*<[a-z_]{0,25}$/;

const NEAR_BOTTOM_THRESHOLD = 120;

interface AnalysisSectionPanelProps {
  content: string;
  isStreaming: boolean;
}

export const AnalysisSectionPanel = memo(function AnalysisSectionPanel({
  content,
  isStreaming,
}: AnalysisSectionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      userScrolledUp.current = !isNearBottom();
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isNearBottom]);

  useEffect(() => {
    if (!isStreaming || userScrolledUp.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [content, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      userScrolledUp.current = false;
    }
  }, [isStreaming]);

  let stripped = content.replace(COMPLETE_SUBGROUPS_REGEX, "");
  if (isStreaming) {
    stripped = stripped.replace(TRAILING_INCOMPLETE_REGEX, "");
    const trailingMatch = stripped.match(TRAILING_PARTIAL_TAG_REGEX);
    if (trailingMatch) {
      const fragment = trailingMatch[0].trimStart();
      if ("<proposed_sub_groups>".startsWith(fragment)) {
        stripped = stripped.slice(0, trailingMatch.index);
      }
    }
  }
  stripped = stripped.trimEnd();
  const processed = renderGroundingBadges(stripped);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      <div className="prose mx-auto max-w-3xl">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
          {processed}
        </Markdown>
        {isStreaming && (
          <div className="mt-2 flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:300ms]" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
});
