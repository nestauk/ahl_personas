"use client";

import { Search } from "lucide-react";

interface EvidenceSearchIndicatorProps {
  query: string;
}

export function EvidenceSearchIndicator({
  query,
}: EvidenceSearchIndicatorProps) {
  return (
    <div className="evidence-search-indicator flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5">
      <Search size={12} className="shrink-0 text-[var(--color-text-muted)]" />
      <span className="text-xs text-[var(--color-text-muted)]">
        Searching evidence:{" "}
        <em className="text-[var(--color-text)]">{query}</em>
      </span>
    </div>
  );
}
