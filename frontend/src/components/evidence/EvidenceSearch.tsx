"use client";

import { Search } from "lucide-react";

export type CitedFilter = "all" | "cited" | "not_cited";

interface EvidenceSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  citedFilter: CitedFilter;
  onCitedFilterChange: (filter: CitedFilter) => void;
  dataTypes: string[];
  activeDataType: string | null;
  onDataTypeChange: (dataType: string | null) => void;
  hasAnalysis: boolean;
}

const CITED_OPTIONS: { value: CitedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "cited", label: "Cited" },
  { value: "not_cited", label: "Not cited" },
];

export function EvidenceSearch({
  query,
  onQueryChange,
  citedFilter,
  onCitedFilterChange,
  dataTypes,
  activeDataType,
  onDataTypeChange,
  hasAnalysis,
}: EvidenceSearchProps) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search sources…"
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] py-1.5 pl-8 pr-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {hasAnalysis && (
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden">
            {CITED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onCitedFilterChange(opt.value)}
                className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                  citedFilter === opt.value
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {dataTypes.length > 1 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => onDataTypeChange(null)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                activeDataType === null
                  ? "bg-indigo-100 text-indigo-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              All types
            </button>
            {dataTypes.map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => onDataTypeChange(activeDataType === dt ? null : dt)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  activeDataType === dt
                    ? "bg-indigo-100 text-indigo-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {dt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
