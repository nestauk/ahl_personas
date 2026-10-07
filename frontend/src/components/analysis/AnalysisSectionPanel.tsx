"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { ChevronRight } from "lucide-react";
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
import { ArtifactSkeleton } from "./ArtifactSkeleton";
import { isSynthesisSection } from "@/lib/analysis-sections";
import { DEFAULT_OPEN, splitByH3 } from "@/lib/markdown-sections";

// Memoised per block so streaming re-renders only the block still growing.
const MdBlockView = memo(function MdBlockView({ md }: { md: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
      {md}
    </Markdown>
  );
});

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
  onOpenEvidenceDrawer?: (targetSourceName?: string) => void;
  onOpenMethodologyDrawer?: (scrollTo?: string) => void;
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
  onOpenEvidenceDrawer,
  onOpenMethodologyDrawer,
}: AnalysisSectionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const scrollRafRef = useRef<number | null>(null);

  // Sections with a summary card open in summary view; the panel remounts per
  // section (keyed by sectionId), so this resets on navigation. Sections
  // mounted mid-stream stay expanded so live content never disappears.
  const [expanded, setExpanded] = useState(isStreaming);
  useEffect(() => {
    if (isStreaming) setExpanded(true);
  }, [isStreaming]);
  const summaryOnly = !expanded && !isStreaming && !!summaryCard;
  // Captured once at mount: live text is never hidden, and nothing collapses
  // under the reader when the stream ends.
  const [openAll] = useState(isStreaming);

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

  // Policy summary (no sectionId) renders flat; reports fold per ### block.
  const blocks = useMemo(
    () => (sectionId ? splitByH3(processed) : [{ heading: "", body: processed }]),
    [processed, sectionId],
  );

  const skeletonType = (() => {
    if (!isStreaming || content.trim()) return null;
    if (sectionId === "scan") return "scan" as const;
    if (sectionId?.startsWith("sg_")) return "subgroup" as const;
    if (sectionId && isSynthesisSection(sectionId))
      return sectionId as "equity_assessment" | "risks_provocations" | "design_improvements";
    return null;
  })();

  const showBadgeLegendLink =
    onOpenMethodologyDrawer &&
    content.trim() &&
    sectionId &&
    (sectionId.startsWith("sg_") || isSynthesisSection(sectionId));

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      {skeletonType ? (
        <ArtifactSkeleton type={skeletonType} />
      ) : (
        <>
          {summaryCard && sectionId && (
            <ArtifactSummaryCard card={summaryCard} sectionId={sectionId} />
          )}
          {summaryOnly && (
            <div className="mx-auto max-w-3xl">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                Read the full report
              </button>
              <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                The full report explains each finding with its evidence badges.
              </p>
            </div>
          )}
          {!summaryOnly && showBadgeLegendLink && (
            <div className="mx-auto mb-3 max-w-3xl">
              <button
                type="button"
                onClick={() => onOpenMethodologyDrawer("grounding-levels")}
                className="text-[11px] text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)]"
              >
                What do the coloured badges mean?
              </button>
            </div>
          )}
          {!summaryOnly && (
            <>
              <div ref={proseRef} className="prose mx-auto max-w-3xl">
                {blocks.map(({ heading, body }, i) =>
                  heading ? (
                    <details
                      key={i}
                      open={openAll || DEFAULT_OPEN.test(heading)}
                      className="group"
                    >
                      <summary className="my-3 flex cursor-pointer list-none items-center gap-1.5 text-base font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)] [&::-webkit-details-marker]:hidden">
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-[var(--color-text-muted)] transition-transform group-open:rotate-90"
                        />
                        {heading.replace(/<[^>]*>/g, "").replace(/[*_`]/g, "").trim()}
                      </summary>
                      <MdBlockView md={body} />
                    </details>
                  ) : (
                    <MdBlockView key={i} md={body} />
                  ),
                )}
                {isStreaming && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-text-muted)] [animation-delay:300ms]" />
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <BadgePopoverManager
                containerRef={proseRef}
                content={processed}
                rawEvidence={rawEvidence}
                sectionType={sectionType}
                confirmedSubGroups={confirmedSubGroups}
                onNavigateToSection={onNavigateToSection}
                onOpenEvidenceDrawer={onOpenEvidenceDrawer}
                isStreaming={isStreaming}
              />
            </>
          )}
        </>
      )}
    </div>
  );
});
