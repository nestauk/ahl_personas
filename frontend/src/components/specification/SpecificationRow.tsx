"use client";

import type { SpecValue } from "@/lib/types";

interface SpecificationRowProps {
  label: string;
  value: SpecValue;
  isActive: boolean;
}

export function SpecificationRow({
  label,
  value,
  isActive,
}: SpecificationRowProps) {
  const renderContent = () => {
    switch (value.source) {
      case "analyst":
        return (
          <span className="text-sm text-[var(--color-text)]">
            {value.values.join("; ")}
          </span>
        );
      case "assumed":
        return (
          <span
            className="text-sm italic text-[var(--color-assumed)]"
            title={value.rationale || undefined}
          >
            {value.values.join("; ")}
            <span className="ml-1 text-xs text-[var(--color-text-muted)]">
              (assumed)
            </span>
          </span>
        );
      case "unspecified":
        return (
          <span className="text-sm text-[var(--color-unspecified)]">TBD</span>
        );
      case "not_applicable":
        return (
          <span
            className="text-sm text-[var(--color-text-muted)] line-through opacity-60"
            title={value.rationale || undefined}
          >
            N/A
          </span>
        );
      default:
        return (
          <span className="text-sm text-[var(--color-text-muted)]">—</span>
        );
    }
  };

  const borderClass = isActive
    ? "border-[var(--color-accent)] bg-[var(--color-accent-light)]"
    : value.source === "analyst"
      ? "border-[var(--color-border)]"
      : value.source === "assumed"
        ? "border-[var(--color-assumed-border)]"
        : "border-[var(--color-border)]";

  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition-colors ${borderClass}`}
    >
      <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </div>
      {renderContent()}
    </div>
  );
}
