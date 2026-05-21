"use client";

import { ArrowRight, CheckCircle2, Play, X } from "lucide-react";
import type {
  AnalysisProgress,
  ConversationStage,
  PolicySpecification,
  ProposedSubGroups,
  SubGroup,
} from "@/lib/types";
import { TAXONOMY } from "@/lib/types";
import { filledCount } from "@/lib/spec-helpers";
import { SpecificationRow } from "./SpecificationRow";
import { AnalysisProgressPanel } from "../analysis/AnalysisProgressPanel";

interface SpecificationSidebarProps {
  spec: PolicySpecification;
  stage: ConversationStage;
  activeCharacteristic: string | null | undefined;
  policyName: string | null | undefined;
  policyDescription: string | null | undefined;
  onProceed: () => void;
  proposedSubGroups?: ProposedSubGroups | null;
  confirmedSubGroups?: SubGroup[] | null;
  analysisProgress?: AnalysisProgress;
  onRunAnalysis?: () => void;
  onRemoveSubGroup?: (id: string) => void;
  isLoading?: boolean;
  activeEvidenceSearch?: string | null;
  evidenceSearchCount?: number;
  onSelectSection?: (sectionId: string) => void;
}

function CompactSpecView({
  spec,
  policyName,
}: {
  spec: PolicySpecification;
  policyName: string | null | undefined;
}) {
  return (
    <div className="border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Policy
        </h2>
        <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
          Confirmed
        </span>
      </div>
      {policyName && (
        <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
          {policyName}
        </p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {(
          Object.entries(TAXONOMY) as [
            keyof PolicySpecification,
            (typeof TAXONOMY)[keyof typeof TAXONOMY],
          ][]
        ).map(([key, meta]) => {
          const val = spec[key];
          if (val.source === "empty" || val.values.length === 0) return null;
          return (
            <span
              key={key}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
              title={`${meta.label}: ${val.values.join(", ")}`}
            >
              {meta.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SubGroupCard({
  subGroup,
  onRemove,
}: {
  subGroup: SubGroup;
  onRemove?: (id: string) => void;
}) {
  const categoryColours: Record<string, string> = {
    geography: "bg-blue-100 text-blue-800",
    household_financial: "bg-green-100 text-green-800",
    time_routine: "bg-amber-100 text-amber-800",
    cognitive_bandwidth: "bg-purple-100 text-purple-800",
    diet_health: "bg-rose-100 text-rose-800",
    ethnicity: "bg-orange-100 text-orange-800",
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-xs font-semibold text-[var(--color-text)]">
          {subGroup.name}
        </h4>
        {onRemove && (
          <button
            onClick={() => onRemove(subGroup.id)}
            className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
            title="Remove sub-group"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {subGroup.modifiers.map((mod, i) => (
          <span
            key={i}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              categoryColours[mod.category] ||
              "bg-gray-100 text-gray-800"
            }`}
          >
            {mod.value}
          </span>
        ))}
      </div>
      {subGroup.rationale && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
          {subGroup.rationale}
        </p>
      )}
    </div>
  );
}

export function SpecificationSidebar({
  spec,
  stage,
  activeCharacteristic,
  policyName,
  policyDescription,
  onProceed,
  proposedSubGroups,
  confirmedSubGroups,
  analysisProgress,
  onRunAnalysis,
  onRemoveSubGroup,
  isLoading,
  activeEvidenceSearch,
  evidenceSearchCount,
  onSelectSection,
}: SpecificationSidebarProps) {
  const filled = filledCount(spec);
  const total = Object.keys(TAXONOMY).length;
  const mostFilled = filled >= total - 1;
  const isSpecifying = stage === "specifying";
  const isAnalysing = stage === "analysing";
  const hasSpec = filled > 0;

  if (!isSpecifying && !isAnalysing && !hasSpec) return null;

  const analysisRunning =
    isAnalysing &&
    confirmedSubGroups &&
    analysisProgress &&
    analysisProgress.steps.some(
      (s) =>
        (s.step === "subgroup" || s.step === "synthesis") &&
        (s.status === "active" || s.status === "complete" || s.status === "error"),
    );

  const hasSubGroupSelection =
    isAnalysing && confirmedSubGroups && confirmedSubGroups.length > 0 && !analysisRunning;

  // Sidebar during analysis: sub-group selection or progress panel
  if (isAnalysing) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
        <CompactSpecView spec={spec} policyName={policyName} />

        {analysisRunning && analysisProgress ? (
          <AnalysisProgressPanel
            progress={analysisProgress}
            confirmedSubGroups={confirmedSubGroups!}
            activeEvidenceSearch={activeEvidenceSearch ?? null}
            evidenceSearchCount={evidenceSearchCount ?? 0}
            onSelectSection={onSelectSection ?? (() => {})}
          />
        ) : hasSubGroupSelection ? (
          <>
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--color-text)]">
                Proposed Sub-groups
              </h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {confirmedSubGroups!.length} sub-groups selected. Remove any that
                aren&apos;t relevant, or add more via the chat.
              </p>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {confirmedSubGroups!.map((sg) => (
                <SubGroupCard
                  key={sg.id}
                  subGroup={sg}
                  onRemove={onRemoveSubGroup}
                />
              ))}
            </div>
            <div className="border-t border-[var(--color-border)] p-4">
              <button
                onClick={onRunAnalysis}
                disabled={
                  isLoading || !confirmedSubGroups || confirmedSubGroups.length === 0
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                <Play size={16} />
                Run analysis ({confirmedSubGroups!.length} sub-groups)
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-4">
            <p className="text-center text-sm text-[var(--color-text-muted)]">
              Scanning modifier relevance…
            </p>
          </div>
        )}
      </aside>
    );
  }

  // Default sidebar: specifying or chatting
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            Policy Specification
          </h2>
          {!isSpecifying && (
            <span className="rounded-full bg-[var(--color-bg)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
              Confirmed
            </span>
          )}
        </div>
        {policyName && (
          <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
            {policyName}
          </p>
        )}
        {policyDescription && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {policyDescription}
          </p>
        )}
        {isSpecifying && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {filled} of {total} characteristics specified
          </p>
        )}
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
            isActive={isSpecifying && activeCharacteristic === key}
          />
        ))}
      </div>

      {isSpecifying && (
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
      )}
    </aside>
  );
}
