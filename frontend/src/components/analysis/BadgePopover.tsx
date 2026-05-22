"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import type { RawEvidenceChunk, RawEvidenceSearch, SubGroup } from "@/lib/types";
import {
  buildSynthesisPopoverModel,
  compactSubgroupName,
  type ResolvedSubgroupRef,
} from "@/lib/analysis-sections";

interface PopoverState {
  anchor: HTMLElement;
  detail: string;
  badgeType: string;
  sourceLabel: string;
}

type EvidenceMatchKind = "source" | "quote" | "unmatched";

interface EvidenceDisplay {
  chunks: RawEvidenceChunk[];
  matchKind: EvidenceMatchKind;
  matchIndex: number;
  retrievedSourceNames: string[];
  hasRetrievedEvidence: boolean;
}

const FALLBACK_ANCHOR: { getBoundingClientRect: () => DOMRect } = {
  getBoundingClientRect: () => new DOMRect(),
};

const TYPE_LABELS: Record<string, string> = {
  evidence: "Model's explanation",
  analogical: "Model's explanation",
  inferred: "Evidence-informed inference",
  reasoning: "Reasoning chain",
  gap: "Evidence gap",
  subgroup: "Sub-group finding",
  sg: "Sub-group finding",
  crosscutting: "Cross-cutting pattern",
};

const STOP_WORDS = new Set([
  "about", "after", "also", "among", "and", "are", "been", "being", "between",
  "both", "but", "can", "could", "did", "does", "doing", "done", "for", "from",
  "had", "has", "have", "having", "how", "into", "its", "like", "more", "most",
  "not", "other", "our", "out", "over", "same", "some", "such", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "under", "until", "very", "was", "were", "what", "when", "where",
  "which", "while", "who", "whom", "why", "will", "with", "within", "would",
]);

function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\d{4}\s*[–-]\s*\d{4}/g, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(title: string): string[] {
  return normaliseTitle(title)
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

function sourcesMatch(badgeLabel: string, sourceName: string): boolean {
  const normLabel = normaliseTitle(badgeLabel);
  const normSource = normaliseTitle(sourceName);

  if (!normLabel || !normSource) return false;

  if (normLabel.includes(normSource) || normSource.includes(normLabel)) {
    return true;
  }

  const labelWords = significantWords(badgeLabel);
  if (labelWords.length === 0) return false;

  const sourceWordSet = new Set(significantWords(sourceName));
  const matchedCount = labelWords.filter((word) => sourceWordSet.has(word)).length;
  const requiredMatches = Math.max(3, Math.ceil(labelWords.length * 0.5));

  return matchedCount >= requiredMatches;
}

function collectAllChunks(searches: RawEvidenceSearch[]): RawEvidenceChunk[] {
  const chunks: RawEvidenceChunk[] = [];
  const seen = new Set<string>();

  for (const search of searches) {
    for (const chunk of search.chunks) {
      const key = `${chunk.source_name}::${chunk.text.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push(chunk);
    }
  }

  return chunks;
}

function getRetrievedSourceNames(searches: RawEvidenceSearch[]): string[] {
  const names = new Set<string>();
  for (const search of searches) {
    for (const chunk of search.chunks) {
      names.add(chunk.source_name);
    }
  }
  return [...names];
}

function isMetadataChunk(chunk: RawEvidenceChunk): boolean {
  return (
    chunk.text.startsWith("Source:") &&
    (chunk.text.includes("Key insights") || chunk.text.includes("Data type:"))
  );
}

function dedupeChunks(chunks: RawEvidenceChunk[]): RawEvidenceChunk[] {
  const seen = new Set<string>();
  const result: RawEvidenceChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.source_name}::${chunk.text.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }

  return result;
}

function findChunksBySourceName(
  sourceLabel: string,
  searches: RawEvidenceSearch[],
): RawEvidenceChunk[] {
  const matchingSourceNames = new Set<string>();

  for (const search of searches) {
    for (const chunk of search.chunks) {
      if (sourcesMatch(sourceLabel, chunk.source_name)) {
        matchingSourceNames.add(chunk.source_name);
      }
    }
  }

  if (matchingSourceNames.size === 0) return [];

  return dedupeChunks(
    collectAllChunks(searches).filter((chunk) =>
      matchingSourceNames.has(chunk.source_name),
    ),
  );
}

function extractQuoteProbes(detail: string): string[] {
  const quotePattern = /[""\u201c]([^""\u201d]{24,}?)[""\u201d]/g;
  const quoted = [...detail.matchAll(quotePattern)].map((match) => match[1]);

  if (quoted.length > 0) {
    const fragments: string[] = [];
    for (const q of quoted) {
      for (const frag of q.split(/[…]+/)) {
        const trimmed = frag.trim();
        if (trimmed.length >= 20) fragments.push(trimmed);
      }
    }
    if (fragments.length > 0) return fragments;
    return quoted;
  }

  const normDetail = normaliseText(detail);
  if (normDetail.length >= 40) return [normDetail];

  return [];
}

function findChunksByQuote(
  detail: string,
  searches: RawEvidenceSearch[],
): RawEvidenceChunk[] {
  const probes = extractQuoteProbes(detail);
  if (probes.length === 0) return [];

  const matches: RawEvidenceChunk[] = [];

  for (const probe of probes) {
    const normProbe = normaliseText(probe);
    if (normProbe.length < 15) continue;

    for (const chunk of collectAllChunks(searches)) {
      if (normaliseText(chunk.text).includes(normProbe)) {
        matches.push(chunk);
      }
    }
  }

  return dedupeChunks(matches);
}

function preferBodyChunks(chunks: RawEvidenceChunk[]): RawEvidenceChunk[] {
  const body = chunks.filter((chunk) => !isMetadataChunk(chunk));
  return body.length > 0 ? body : chunks;
}

/**
 * Returns the character index (in the original chunk text) where the best
 * quote probe matches, or -1 if no probe matches. When multiple probes hit,
 * the longest match wins so we centre on the most specific passage.
 */
function scoreChunkByQuote(
  chunk: RawEvidenceChunk,
  detail: string,
): number {
  const probes = extractQuoteProbes(detail);
  if (probes.length === 0) return -1;

  const normChunk = normaliseText(chunk.text);
  let bestIndex = -1;
  let bestLen = 0;

  for (const probe of probes) {
    const normProbe = normaliseText(probe);
    if (normProbe.length < 15) continue;
    const normIdx = normChunk.indexOf(normProbe);
    if (normIdx >= 0 && normProbe.length > bestLen) {
      bestLen = normProbe.length;
      const lowerChunk = chunk.text.toLowerCase();
      const rawIdx = lowerChunk.indexOf(
        probe.toLowerCase(),
        Math.max(0, normIdx - 50),
      );
      bestIndex = rawIdx >= 0 ? rawIdx : normIdx;
    }
  }

  return bestIndex;
}

function pickBestChunk(
  chunks: RawEvidenceChunk[],
  detail: string,
): { chunk: RawEvidenceChunk; matchIndex: number } {
  let bestChunk = chunks[0];
  let bestIndex = -1;

  for (const chunk of chunks) {
    const idx = scoreChunkByQuote(chunk, detail);
    if (idx >= 0 && bestIndex < 0) {
      bestChunk = chunk;
      bestIndex = idx;
    }
  }

  return { chunk: bestChunk, matchIndex: bestIndex };
}

function resolveEvidenceDisplay(
  sourceLabel: string,
  detail: string,
  searches: RawEvidenceSearch[],
): EvidenceDisplay {
  const retrievedSourceNames = getRetrievedSourceNames(searches);
  const hasRetrievedEvidence = retrievedSourceNames.length > 0;

  const sourceMatches = preferBodyChunks(findChunksBySourceName(sourceLabel, searches));
  if (sourceMatches.length > 0) {
    const best = pickBestChunk(sourceMatches, detail);
    return {
      chunks: [best.chunk],
      matchKind: "source",
      matchIndex: best.matchIndex,
      retrievedSourceNames,
      hasRetrievedEvidence,
    };
  }

  const quoteMatches = preferBodyChunks(findChunksByQuote(detail, searches));
  if (quoteMatches.length > 0) {
    const best = pickBestChunk(quoteMatches, detail);
    return {
      chunks: [best.chunk],
      matchKind: "quote",
      matchIndex: best.matchIndex,
      retrievedSourceNames,
      hasRetrievedEvidence,
    };
  }

  const fallbackCandidates = preferBodyChunks(collectAllChunks(searches));
  if (fallbackCandidates.length > 0) {
    const best = pickBestChunk(fallbackCandidates, detail);
    return {
      chunks: [best.chunk],
      matchKind: "unmatched",
      matchIndex: best.matchIndex,
      retrievedSourceNames,
      hasRetrievedEvidence,
    };
  }

  return {
    chunks: [],
    matchKind: "unmatched",
    matchIndex: -1,
    retrievedSourceNames,
    hasRetrievedEvidence,
  };
}

const DISPLAY_WINDOW = 400;

function extractDisplayWindow(text: string, matchIndex: number): string {
  if (text.length <= DISPLAY_WINDOW) return text;

  if (matchIndex < 0) {
    return text.slice(0, DISPLAY_WINDOW);
  }

  const half = Math.floor(DISPLAY_WINDOW / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(text.length, start + DISPLAY_WINDOW);

  if (end - start < DISPLAY_WINDOW) {
    start = Math.max(0, end - DISPLAY_WINDOW);
  }

  // Snap to nearest word boundaries to avoid mid-word cuts
  if (start > 0) {
    const nextSpace = text.indexOf(" ", start);
    if (nextSpace >= 0 && nextSpace - start < 30) start = nextSpace + 1;
  }
  if (end < text.length) {
    const prevSpace = text.lastIndexOf(" ", end);
    if (prevSpace > start && end - prevSpace < 30) end = prevSpace;
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}

function ChunkDisplay({
  chunk,
  matchIndex = -1,
}: {
  chunk: RawEvidenceChunk;
  matchIndex?: number;
}) {
  const displayText = extractDisplayWindow(chunk.text, matchIndex);

  return (
    <div>
      <blockquote className="border-l-2 border-[var(--color-border)] pl-2 text-[11px] italic leading-relaxed text-[var(--color-text)]">
        &ldquo;{displayText}&rdquo;
      </blockquote>
      <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
        {chunk.page_number != null && `p.${chunk.page_number} · `}
        {chunk.source_name}
        {chunk.source_year && ` (${chunk.source_year})`}
      </p>
    </div>
  );
}

function RawEvidenceSection({ display }: { display: EvidenceDisplay }) {
  if (!display.hasRetrievedEvidence) {
    return (
      <>
        <hr className="my-2 border-[var(--color-border)]" />
        <p className="text-[10px] leading-relaxed text-[var(--color-text-muted)]">
          No evidence was retrieved during analysis of this sub-group.
        </p>
      </>
    );
  }

  return (
    <>
      <hr className="my-2 border-[var(--color-border)]" />
      {display.matchKind === "quote" && (
        <p className="mb-2 text-[10px] leading-relaxed text-amber-600">
          The citation name could not be matched, but similar content was found in
          retrieved evidence.
        </p>
      )}
      {display.matchKind === "unmatched" && (
        <p className="mb-2 text-[10px] leading-relaxed text-amber-600">
          The citation name could not be matched to a retrieved source. Compare
          the model&apos;s explanation against the sources below.
        </p>
      )}
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        Evidence from tool retrieval
      </div>
      {display.matchKind === "unmatched" && display.retrievedSourceNames.length > 0 && (
        <ul className="mb-2 list-inside list-disc text-[10px] leading-relaxed text-[var(--color-text-muted)]">
          {display.retrievedSourceNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
      {display.chunks.length > 0 && (
        <div className="space-y-2">
          {display.chunks.map((chunk, i) => (
            <ChunkDisplay
              key={`${chunk.source_name}-${i}`}
              chunk={chunk}
              matchIndex={display.matchIndex}
            />
          ))}
        </div>
      )}
    </>
  );
}



function SgInlineLinks({
  refs,
  onNavigateToSection,
}: {
  refs: ResolvedSubgroupRef[];
  onNavigateToSection: (sectionId: string) => void;
}) {
  const unique = refs.filter(
    (ref, i, arr) => arr.findIndex((r) => r.sectionId === ref.sectionId) === i,
  );
  if (unique.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-0.5">
      {unique.map((ref, i) => (
        <span key={ref.sectionId}>
          {i > 0 && (
            <span className="text-[var(--color-text-muted)]" aria-hidden>
              {" "}
              ·{" "}
            </span>
          )}
          <button
            type="button"
            title={ref.fullName}
            onClick={() => onNavigateToSection(ref.sectionId)}
            className="font-medium text-indigo-600 underline-offset-2 hover:underline"
          >
            {ref.shortLabel}
          </button>
        </span>
      ))}
    </span>
  );
}

function SynthesisPopoverBody({
  badgeType,
  detail,
  sourceLabel,
  confirmedSubGroups,
  onNavigateToSection,
}: {
  badgeType: string;
  detail: string;
  sourceLabel: string;
  confirmedSubGroups: SubGroup[];
  onNavigateToSection: (sectionId: string) => void;
}) {
  const model = buildSynthesisPopoverModel(
    badgeType,
    detail,
    sourceLabel,
    confirmedSubGroups,
  );

  if (badgeType === "crosscutting") {
    const crossLabel = sourceLabel.toLowerCase().startsWith("cross-cutting")
      ? sourceLabel
      : `Cross-cutting: ${sourceLabel}`;

    return (
      <>
        <p className="text-[10px] font-medium text-[var(--color-text-muted)]">
          {crossLabel}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text)]">
          {model.narrative}
        </p>
        {model.referencedSubgroups.length > 0 && (
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Affected sub-groups:{" "}
            <SgInlineLinks
              refs={model.referencedSubgroups}
              onNavigateToSection={onNavigateToSection}
            />
          </p>
        )}
      </>
    );
  }

  if (badgeType === "gap") {
    const n = model.referencedSubgroups.length;
    const total = confirmedSubGroups.length;

    return (
      <>
        <p className="text-xs leading-relaxed text-[var(--color-text)]">
          {model.narrative}
        </p>
        {n > 0 && (
          <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
            Flagged by {n} of {total} sub-groups (
            <SgInlineLinks
              refs={model.referencedSubgroups}
              onNavigateToSection={onNavigateToSection}
            />
            )
          </p>
        )}
      </>
    );
  }

  const primary = model.primarySubgroup ?? model.referencedSubgroups[0];

  return (
    <>
      {primary && (
        <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
          <span className="font-semibold text-[var(--color-text)]">
            {primary.shortLabel}:
          </span>{" "}
          {compactSubgroupName(primary.fullName)}
        </p>
      )}
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text)]">
        {model.narrative}
      </p>
      {primary && (
        <button
          type="button"
          title={primary.fullName}
          onClick={() => onNavigateToSection(primary.sectionId)}
          className="mt-2 block text-left text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          View {primary.shortLabel} analysis →
        </button>
      )}
    </>
  );
}

/**
 * Attaches click handlers to all `[data-badge-detail]` spans within a
 * container and renders a Radix popover when one is clicked.
 */
export function BadgePopoverManager({
  containerRef,
  content,
  rawEvidence,
  sectionType = "subgroup",
  confirmedSubGroups,
  onNavigateToSection,
  onOpenEvidenceDrawer,
  isStreaming = false,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  content: string;
  rawEvidence?: RawEvidenceSearch[];
  sectionType?: "subgroup" | "synthesis";
  confirmedSubGroups?: SubGroup[];
  onNavigateToSection?: (sectionId: string) => void;
  onOpenEvidenceDrawer?: (targetSourceName?: string) => void;
  isStreaming?: boolean;
}) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const openRef = useRef(false);
  const virtualAnchorRef = useRef(FALLBACK_ANCHOR);
  const prevContentRef = useRef(content);
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;

  const handleBadgeClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const badge = target.closest("[data-badge-detail]") as HTMLElement | null;
    if (!badge) return;

    const detail = badge.getAttribute("data-badge-detail") ?? "";
    const badgeType = badge.getAttribute("data-badge-type") ?? "";
    if (!detail) return;

    if (openRef.current) {
      setPopover(null);
      openRef.current = false;
      return;
    }

    const sourceLabel =
      badge.getAttribute("data-badge-ref") ??
      badge.textContent?.replace(
        /^(Evidence|Analogical|Sub-group|Cross-cutting|SG\d+):\s*/,
        "",
      ) ??
      "";

    if (isStreamingRef.current) {
      const rect = badge.getBoundingClientRect();
      virtualAnchorRef.current = {
        getBoundingClientRect: () => rect,
      };
    } else {
      virtualAnchorRef.current = badge;
    }

    setPopover({ anchor: badge, detail, badgeType, sourceLabel });
    openRef.current = true;
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("click", handleBadgeClick);
    return () => el.removeEventListener("click", handleBadgeClick);
  }, [containerRef, handleBadgeClick]);

  useEffect(() => {
    if (prevContentRef.current === content) return;
    prevContentRef.current = content;
    if (!openRef.current) return;
    if (isStreamingRef.current) return;
    setPopover(null);
    openRef.current = false;
    virtualAnchorRef.current = FALLBACK_ANCHOR;
  }, [content]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setPopover(null);
      openRef.current = false;
      virtualAnchorRef.current = FALLBACK_ANCHOR;
    }
  }, []);

  const evidenceDisplay = useMemo(() => {
    if (!popover || !rawEvidence) return null;
    if (popover.badgeType !== "evidence" && popover.badgeType !== "analogical" && popover.badgeType !== "inferred") {
      return null;
    }
    return resolveEvidenceDisplay(popover.sourceLabel, popover.detail, rawEvidence);
  }, [popover, rawEvidence]);

  if (!popover) return null;

  const typeLabel = TYPE_LABELS[popover.badgeType] ?? "Detail";
  const showRawEvidence =
    sectionType === "subgroup" &&
    (popover.badgeType === "evidence" || popover.badgeType === "analogical" || popover.badgeType === "inferred");

  const showSynthesisPopover =
    sectionType === "synthesis" &&
    confirmedSubGroups &&
    onNavigateToSection &&
    (popover.badgeType === "subgroup" ||
      popover.badgeType === "sg" ||
      popover.badgeType === "crosscutting" ||
      popover.badgeType === "gap");

  return createPortal(
    <Popover.Root open onOpenChange={handleOpenChange} modal={false}>
      <Popover.Anchor virtualRef={virtualAnchorRef} />
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="badge-popover-content z-50 max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg"
        >
          <div className="max-h-80 overflow-y-auto px-3 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              {typeLabel}
            </div>
            {showSynthesisPopover ? (
              <SynthesisPopoverBody
                badgeType={popover.badgeType}
                detail={popover.detail}
                sourceLabel={popover.sourceLabel}
                confirmedSubGroups={confirmedSubGroups!}
                onNavigateToSection={onNavigateToSection!}
              />
            ) : (
              <p className="text-xs leading-relaxed text-[var(--color-text)]">
                {popover.detail}
              </p>
            )}
            {showRawEvidence && evidenceDisplay && (
              <RawEvidenceSection display={evidenceDisplay} />
            )}
            {showRawEvidence && onOpenEvidenceDrawer && (
              <button
                type="button"
                onClick={() => onOpenEvidenceDrawer(popover.sourceLabel)}
                className="mt-2 block text-left text-[11px] font-medium text-[var(--color-accent)] underline-offset-2 hover:underline"
              >
                View in evidence base →
              </button>
            )}
          </div>
          <Popover.Arrow className="fill-[var(--color-surface)] stroke-[var(--color-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>,
    document.body,
  );
}
