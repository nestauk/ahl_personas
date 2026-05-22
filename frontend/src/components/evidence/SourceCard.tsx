"use client";

import { useCallback, useEffect, useRef } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { EvidenceSource, SourceCitation } from "@/lib/types";

interface SourceCardProps {
  source: EvidenceSource;
  citation: SourceCitation | null;
  expanded: boolean;
  onToggle: () => void;
  onNavigateToSubgroup?: (sectionId: string) => void;
  scrollIntoView?: boolean;
}

function CitationBadge({ citation }: { citation: SourceCitation | null }) {
  if (!citation) return null;

  if (citation.count === 0) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
        Not cited
      </span>
    );
  }

  return (
    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
      Cited {citation.count} {citation.count === 1 ? "time" : "times"}
    </span>
  );
}

function MetadataBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-3">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-xs leading-relaxed text-[var(--color-text)] whitespace-pre-line">
        {value}
      </dd>
    </div>
  );
}

export function SourceCard({
  source,
  citation,
  expanded,
  onToggle,
  onNavigateToSubgroup,
  scrollIntoView,
}: SourceCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollIntoView && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollIntoView]);

  const handleSubgroupClick = useCallback(
    (sectionId: string) => {
      onNavigateToSubgroup?.(sectionId);
    },
    [onNavigateToSubgroup],
  );

  const truncatedObjective =
    source.objective && source.objective.length > 120
      ? source.objective.slice(0, 120) + "…"
      : source.objective;

  return (
    <div
      ref={cardRef}
      className={`evidence-source-card rounded-lg border transition-colors ${
        expanded
          ? "border-[var(--color-accent)] bg-blue-50/30"
          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-gray-300"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-[var(--color-text)]">
            {source.source_name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {source.year && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                {source.year}
              </span>
            )}
            {source.data_type && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 border border-indigo-100">
                {source.data_type}
              </span>
            )}
            <CitationBadge citation={citation} />
          </div>
          {!expanded && truncatedObjective && (
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
              {truncatedObjective}
            </p>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`mt-1 shrink-0 text-[var(--color-text-muted)] transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)] px-3 pb-3 pt-2">
          <dl>
            <MetadataBlock label="Objective" value={source.objective} />
            <MetadataBlock label="Participants & sample" value={source.participants} />
            <MetadataBlock label="Key insights & themes" value={source.key_insights} />
            <MetadataBlock label="Methodology & limitations" value={source.methodology} />
          </dl>

          {source.link && (
            <a
              href={source.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] hover:underline"
            >
              View original source
              <ExternalLink size={11} />
            </a>
          )}

          {citation && citation.count > 0 && (
            <div className="mt-3">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                Cited in sub-groups
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {citation.subgroups.map((sg) => (
                  <button
                    key={sg.sectionId}
                    type="button"
                    onClick={() => handleSubgroupClick(sg.sectionId)}
                    className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    {sg.name}
                  </button>
                ))}
              </dd>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
