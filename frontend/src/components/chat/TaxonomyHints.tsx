"use client";

import type { PolicySpecification } from "@/lib/types";
import { TAXONOMY } from "@/lib/types";

interface TaxonomyHintsProps {
  activeCharacteristic: string | null | undefined;
  onInsertHint: (text: string) => void;
}

export function TaxonomyHints({
  activeCharacteristic,
  onInsertHint,
}: TaxonomyHintsProps) {
  if (!activeCharacteristic) return null;

  const meta = TAXONOMY[activeCharacteristic as keyof PolicySpecification];
  if (!meta) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 pb-2">
      <span className="text-xs text-[var(--color-text-muted)] self-center mr-1">
        {meta.label}:
      </span>
      {meta.options.map((option) => (
        <button
          key={option}
          onClick={() => onInsertHint(option)}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        >
          {option}
        </button>
      ))}
    </div>
  );
}
