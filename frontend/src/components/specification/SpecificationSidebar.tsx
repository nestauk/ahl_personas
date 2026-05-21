"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ConversationStage, PolicySpecification } from "@/lib/types";
import { TAXONOMY } from "@/lib/types";
import { filledCount } from "@/lib/spec-helpers";
import { SpecificationRow } from "./SpecificationRow";

interface SpecificationSidebarProps {
  spec: PolicySpecification;
  stage: ConversationStage;
  activeCharacteristic: string | null | undefined;
  policyName: string | null | undefined;
  onProceed: () => void;
}

export function SpecificationSidebar({
  spec,
  stage,
  activeCharacteristic,
  policyName,
  onProceed,
}: SpecificationSidebarProps) {
  if (stage !== "specifying") return null;

  const filled = filledCount(spec);
  const total = Object.keys(TAXONOMY).length;
  const mostFilled = filled >= total - 1;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Policy Specification
        </h2>
        {policyName && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)] truncate">
            {policyName}
          </p>
        )}
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {filled} of {total} characteristics specified
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {(
          Object.entries(TAXONOMY) as [
            keyof PolicySpecification,
            (typeof TAXONOMY)[keyof typeof TAXONOMY],
          ][]
        ).map(([key, meta]) => (
          <SpecificationRow
            key={key}
            label={meta.label}
            value={spec[key]}
            isActive={activeCharacteristic === key}
          />
        ))}
      </div>

      <div className="border-t border-[var(--color-border)] p-4">
        <button
          onClick={onProceed}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            mostFilled
              ? "bg-[var(--color-accent)] text-white hover:opacity-90"
              : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          }`}
        >
          {mostFilled ? (
            <CheckCircle2 size={16} />
          ) : (
            <ArrowRight size={16} />
          )}
          Proceed to analysis
        </button>
      </div>
    </aside>
  );
}
