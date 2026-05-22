"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as Popover from "@radix-ui/react-popover";
import type { RawEvidenceChunk, RawEvidenceSearch } from "@/lib/types";

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
  retrievedSourceNames: string[];
  hasRetrievedEvidence: boolean;
}

const FALLBACK_ANCHOR: { getBoundingClientRect: () => DOMRect } = {
  getBoundingClientRect: () => new DOMRect(),
};

const TYPE_LABELS: Record<string, string> = {
  evidence: "Model's explanation",
  analogical: "Model's explanation",
  reasoning: "Reasoning chain",
  gap: "Evidence gap",
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
  const quoted = [...detail.matchAll(/"([^"]{24,})"/g)].map((match) => match[1]);
  if (quoted.length > 0) return quoted;

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
    const minLen = Math.min(40, normProbe.length);
    const snippet = normProbe.slice(0, Math.max(minLen, 40));

    for (const chunk of collectAllChunks(searches)) {
      if (normaliseText(chunk.text).includes(snippet)) {
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

function resolveEvidenceDisplay(
  sourceLabel: string,
  detail: string,
  searches: RawEvidenceSearch[],
): EvidenceDisplay {
  const retrievedSourceNames = getRetrievedSourceNames(searches);
  const hasRetrievedEvidence = retrievedSourceNames.length > 0;

  const sourceMatches = preferBodyChunks(findChunksBySourceName(sourceLabel, searches));
  if (sourceMatches.length > 0) {
    return {
      chunks: sourceMatches.slice(0, 2),
      matchKind: "source",
      retrievedSourceNames,
      hasRetrievedEvidence,
    };
  }

  const quoteMatches = preferBodyChunks(findChunksByQuote(detail, searches));
  if (quoteMatches.length > 0) {
    return {
      chunks: quoteMatches.slice(0, 2),
      matchKind: "quote",
      retrievedSourceNames,
      hasRetrievedEvidence,
    };
  }

  return {
    chunks: preferBodyChunks(collectAllChunks(searches)).slice(0, 2),
    matchKind: "unmatched",
    retrievedSourceNames,
    hasRetrievedEvidence,
  };
}

function ChunkDisplay({ chunk }: { chunk: RawEvidenceChunk }) {
  return (
    <div>
      <blockquote className="border-l-2 border-[var(--color-border)] pl-2 text-[11px] italic leading-relaxed text-[var(--color-text)]">
        &ldquo;{chunk.text.length > 400 ? chunk.text.slice(0, 400) + "…" : chunk.text}&rdquo;
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
            <ChunkDisplay key={`${chunk.source_name}-${i}`} chunk={chunk} />
          ))}
        </div>
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
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  content: string;
  rawEvidence?: RawEvidenceSearch[];
}) {
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const openRef = useRef(false);
  const virtualAnchorRef = useRef(FALLBACK_ANCHOR);
  const prevContentRef = useRef(content);

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

    const sourceLabel = badge.textContent?.replace(/^(Evidence|Analogical):\s*/, "") ?? "";
    virtualAnchorRef.current = badge;
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
    if (popover.badgeType !== "evidence" && popover.badgeType !== "analogical") {
      return null;
    }
    return resolveEvidenceDisplay(popover.sourceLabel, popover.detail, rawEvidence);
  }, [popover, rawEvidence]);

  if (!popover) return null;

  const typeLabel = TYPE_LABELS[popover.badgeType] ?? "Detail";
  const showRawEvidence =
    popover.badgeType === "evidence" || popover.badgeType === "analogical";

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
            <p className="text-xs leading-relaxed text-[var(--color-text)]">
              {popover.detail}
            </p>
            {showRawEvidence && evidenceDisplay && (
              <RawEvidenceSection display={evidenceDisplay} />
            )}
          </div>
          <Popover.Arrow className="fill-[var(--color-surface)] stroke-[var(--color-border)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>,
    document.body,
  );
}
