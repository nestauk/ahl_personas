"use client";

import { memo, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { renderGroundingBadges } from "@/lib/grounding-badges";

interface AnalysisSectionPanelProps {
  content: string;
  isStreaming: boolean;
}

export const AnalysisSectionPanel = memo(function AnalysisSectionPanel({
  content,
  isStreaming,
}: AnalysisSectionPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);

  useEffect(() => {
    if (!isStreaming) return;
    const now = Date.now();
    if (now - lastScrollTime.current < 500) return;
    lastScrollTime.current = now;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [content, isStreaming]);

  const processed = renderGroundingBadges(content);

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
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
