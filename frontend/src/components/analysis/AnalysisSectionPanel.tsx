"use client";

import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  normalizeMarkdownBlockBreaks,
  stripArtifactTailBlocks,
} from "@/lib/analysis-sections";
import type { SummaryCard } from "@/lib/types";
import { ArtifactSummaryCard } from "./ArtifactSummaryCard";
import {
  renderGroundingBadges,
  stripIncompleteStructuredBlocks,
  stripProposedSubGroupsContent,
} from "@/lib/grounding-badges";
import type { RawEvidenceSearch, SubGroup } from "@/lib/types";
import { BadgePopoverManager } from "./BadgePopover";

const TRAILING_PARTIAL_TAG_REGEX = /\s*<[a-z_]{0,25}$/;

const NEAR_BOTTOM_THRESHOLD = 120;

interface AnalysisSectionPanelProps {
  content: string;
  isStreaming: boolean;
  sectionId?: string;
  summaryCard?: SummaryCard | null;
  rawEvidence?: RawEvidenceSearch[];
  sectionType?: "subgroup" | "synthesis";
  confirmedSubGroups?: SubGroup[];
  onNavigateToSection?: (sectionId: string) => void;
}

export const AnalysisSectionPanel = memo(function AnalysisSectionPanel({
  content,
  isStreaming,
  sectionId,
  summaryCard,
  rawEvidence,
  sectionType = "subgroup",
  confirmedSubGroups,
  onNavigateToSection,
}: AnalysisSectionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

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

    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    });

    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, [content, isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      userScrolledUp.current = false;
    }
  }, [isStreaming]);

  const processed = useMemo(() => {
    let stripped = stripArtifactTailBlocks(
      stripProposedSubGroupsContent(content),
    );
    if (isStreaming) {
      stripped = stripIncompleteStructuredBlocks(stripped);
      const trailingMatch = stripped.match(TRAILING_PARTIAL_TAG_REGEX);
      if (trailingMatch) {
        const fragment = trailingMatch[0].trimStart();
        if (
          "<proposed_sub_groups>".startsWith(fragment) ||
          "<policy_spec>".startsWith(fragment) ||
          "<badge_detail>".startsWith(fragment) ||
          "<step_summary>".startsWith(fragment) ||
          "<summary_card".startsWith(fragment)
        ) {
          stripped = stripped.slice(0, trailingMatch.index);
        }
      }
    }
    stripped = normalizeMarkdownBlockBreaks(stripped.trimEnd());
    const withBadges = renderGroundingBadges(stripped);
    return normalizeMarkdownBlockBreaks(withBadges);
  }, [content, isStreaming]);

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      {summaryCard && sectionId && (
        <ArtifactSummaryCard card={summaryCard} sectionId={sectionId} />
      )}
      <div ref={proseRef} className="prose mx-auto max-w-3xl">
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
      {!isStreaming && (
        <BadgePopoverManager
          containerRef={proseRef}
          content={processed}
          rawEvidence={rawEvidence}
          sectionType={sectionType}
          confirmedSubGroups={confirmedSubGroups}
          onNavigateToSection={onNavigateToSection}
        />
      )}
    </div>
  );
});
