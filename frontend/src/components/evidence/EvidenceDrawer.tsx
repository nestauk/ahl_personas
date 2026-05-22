"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  EvidenceSource,
  RawEvidenceSearch,
  SourceCitation,
  SubGroup,
} from "@/lib/types";
import { sourcesMatch } from "@/lib/source-matching";
import { EvidenceSearch, type CitedFilter } from "./EvidenceSearch";
import { SourceCard } from "./SourceCard";

interface EvidenceDrawerProps {
  open: boolean;
  onClose: () => void;
  sources: EvidenceSource[] | null;
  targetSource: string | null;
  onClearTarget: () => void;
  subgroupEvidence: Map<string, RawEvidenceSearch[]>;
  confirmedSubGroups: SubGroup[] | null;
  hasAnalysis: boolean;
  onNavigateToSubgroup?: (sectionId: string) => void;
}

function normaliseForSearch(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function computeSourceCitations(
  subgroupEvidence: Map<string, RawEvidenceSearch[]>,
  confirmedSubGroups: SubGroup[] | null,
): Map<string, SourceCitation> {
  const citations = new Map<string, SourceCitation>();
  if (!confirmedSubGroups) return citations;

  subgroupEvidence.forEach((searches, sectionId) => {
    const idx = parseInt(sectionId.replace("sg_", ""), 10);
    const sgName = confirmedSubGroups[idx]?.name ?? sectionId;

    for (const search of searches) {
      for (const chunk of search.chunks) {
        const name = chunk.source_name;
        const existing = citations.get(name);
        if (existing) {
          existing.count += 1;
          if (!existing.subgroups.some((sg) => sg.sectionId === sectionId)) {
            existing.subgroups.push({ sectionId, name: sgName });
          }
        } else {
          citations.set(name, {
            count: 1,
            subgroups: [{ sectionId, name: sgName }],
          });
        }
      }
    }
  });

  return citations;
}

function matchesSearch(source: EvidenceSource, normQuery: string): boolean {
  if (!normQuery) return true;
  const searchable = normaliseForSearch(
    [source.source_name, source.objective, source.key_insights, source.methodology]
      .filter(Boolean)
      .join(" "),
  );
  return normQuery.split(/\s+/).every((word) => searchable.includes(word));
}

export function EvidenceDrawer({
  open,
  onClose,
  sources,
  targetSource,
  onClearTarget,
  subgroupEvidence,
  confirmedSubGroups,
  hasAnalysis,
  onNavigateToSubgroup,
}: EvidenceDrawerProps) {
  const [query, setQuery] = useState("");
  const [citedFilter, setCitedFilter] = useState<CitedFilter>("all");
  const [dataTypeFilter, setDataTypeFilter] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [scrollToSource, setScrollToSource] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const citations = useMemo(
    () => computeSourceCitations(subgroupEvidence, confirmedSubGroups),
    [subgroupEvidence, confirmedSubGroups],
  );

  const dataTypes = useMemo(() => {
    if (!sources) return [];
    const types = new Set<string>();
    for (const s of sources) {
      if (s.data_type) types.add(s.data_type);
    }
    return [...types].sort();
  }, [sources]);

  const normQuery = useMemo(() => normaliseForSearch(query), [query]);

  const filteredSources = useMemo(() => {
    if (!sources) return [];
    return sources.filter((source) => {
      if (!matchesSearch(source, normQuery)) return false;

      if (dataTypeFilter && source.data_type !== dataTypeFilter) return false;

      if (citedFilter !== "all") {
        const cited = citations.has(source.source_name);
        if (citedFilter === "cited" && !cited) return false;
        if (citedFilter === "not_cited" && cited) return false;
      }

      return true;
    });
  }, [sources, normQuery, dataTypeFilter, citedFilter, citations]);

  const citedCount = useMemo(() => {
    if (!sources) return 0;
    return sources.filter((s) => citations.has(s.source_name)).length;
  }, [sources, citations]);

  // Handle target source: fuzzy-match the badge label to a source name,
  // then expand and scroll to that source when the drawer opens.
  // Only runs once sources have loaded so we can resolve the match.
  useEffect(() => {
    if (!open || !targetSource || !sources) return;

    const resolvedName = (() => {
      const exact = sources.find((s) => s.source_name === targetSource);
      if (exact) return exact.source_name;

      const fuzzy = sources.find((s) => sourcesMatch(targetSource, s.source_name));
      return fuzzy?.source_name ?? null;
    })();

    if (resolvedName) {
      setExpandedSource(resolvedName);
      setScrollToSource(resolvedName);
    }

    onClearTarget();
  }, [open, targetSource, sources, onClearTarget]);

  // Clear the scroll-to flag after the card has had a frame to scroll.
  useEffect(() => {
    if (!scrollToSource) return;
    const timer = setTimeout(() => setScrollToSource(null), 300);
    return () => clearTimeout(timer);
  }, [scrollToSource]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleToggle = useCallback((sourceName: string) => {
    setExpandedSource((prev) => (prev === sourceName ? null : sourceName));
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="evidence-drawer-backdrop fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="evidence-drawer fixed right-0 top-0 z-50 flex h-full w-[480px] max-w-[90vw] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Evidence Base
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <EvidenceSearch
            query={query}
            onQueryChange={setQuery}
            citedFilter={citedFilter}
            onCitedFilterChange={setCitedFilter}
            dataTypes={dataTypes}
            activeDataType={dataTypeFilter}
            onDataTypeChange={setDataTypeFilter}
            hasAnalysis={hasAnalysis}
          />

          {/* Coverage summary */}
          {hasAnalysis && sources && (
            <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
              <span className="font-semibold text-[var(--color-text)]">
                {citedCount} of {sources.length} sources
              </span>{" "}
              cited in this analysis
            </p>
          )}
        </div>

        {/* Source list */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-3">
          {!sources ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                  Loading evidence base…
                </p>
              </div>
            </div>
          ) : filteredSources.length === 0 ? (
            <p className="py-8 text-center text-xs text-[var(--color-text-muted)]">
              No sources match your filters.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredSources.map((source) => (
                <SourceCard
                  key={source.pdf_filename}
                  source={source}
                  citation={citations.get(source.source_name) ?? null}
                  expanded={expandedSource === source.source_name}
                  onToggle={() => handleToggle(source.source_name)}
                  onNavigateToSubgroup={onNavigateToSubgroup}
                  scrollIntoView={scrollToSource === source.source_name}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
