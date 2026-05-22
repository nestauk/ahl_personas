"use client";

import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  HelpCircle,
  Play,
  Search,
  X,
} from "lucide-react";
import type {
  AnalysisProgress,
  AnalysisStep,
  ConversationStage,
  PolicySummarySpec,
  ProposedSubGroups,
  SubGroup,
} from "@/lib/types";
import { TAXONOMY_LABELS } from "@/lib/types";

interface SpecificationSidebarProps {
  spec: PolicySummarySpec;
  stage: ConversationStage;
  policyName: string | null | undefined;
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

// ---------------------------------------------------------------------------
// Compact policy spec (shown during analysis/chatting stages)
// ---------------------------------------------------------------------------

function CompactSpecView({
  spec,
  policyName,
  onViewSummary,
}: {
  spec: PolicySummarySpec;
  policyName: string | null | undefined;
  onViewSummary?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const truncatedSummary = spec.policy_summary
    ? spec.policy_summary.length > 120
      ? spec.policy_summary.slice(0, 120) + "…"
      : spec.policy_summary
    : null;

  return (
    <div className="border-b border-[var(--color-border)]">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-[var(--color-bg)]"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        )}
        <div className="min-w-0 flex-1">
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
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          {truncatedSummary && (
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              {truncatedSummary}
            </p>
          )}
          {onViewSummary && (
            <button
              onClick={onViewSummary}
              className="mt-1.5 text-[11px] text-[var(--color-accent)] hover:underline"
            >
              View full summary
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Taxonomy pills — compact display of mapped dimensions
// ---------------------------------------------------------------------------

function TaxonomyPills({
  taxonomyMapping,
}: {
  taxonomyMapping: Record<string, string[]>;
}) {
  const entries = Object.entries(taxonomyMapping);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(([key, values]) => {
        const label = TAXONOMY_LABELS[key] || key.replace(/_/g, " ");
        return (
          <div key={key}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              {label}
            </div>
            <div className="flex flex-wrap gap-1">
              {values.map((value, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]"
                >
                  {value}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StepEntry — reusable stepper row (scan, sub-group analysis, synthesis)
// ---------------------------------------------------------------------------

function StepEntry({
  status,
  label,
  subtitle,
  isLast,
  onClick,
  activeContent,
}: {
  status: AnalysisStep["status"];
  label: string;
  subtitle?: string | null;
  isLast?: boolean;
  onClick?: () => void;
  activeContent?: React.ReactNode;
}) {
  const isActive = status === "active";
  const isClickable = status === "complete" || status === "active";

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[11px] top-[24px] h-[calc(100%-8px)] w-[2px] bg-[var(--color-border)]" />
      )}

      <div className="relative z-10 flex shrink-0">
        {status === "complete" ? (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--color-accent)]">
            <Check size={12} className="text-white" />
          </div>
        ) : status === "error" ? (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-100">
            <AlertCircle size={12} className="text-red-600" />
          </div>
        ) : isActive ? (
          <div className="stepper-pulse flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-white">
            <div className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
          </div>
        ) : (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg)]">
            <div className="h-2 w-2 rounded-full bg-[var(--color-border)]" />
          </div>
        )}
      </div>

      <div className="mb-5 flex min-w-0 flex-col">
        <button
          onClick={isClickable ? onClick : undefined}
          disabled={!isClickable}
          className={`text-left text-sm transition-colors ${
            isActive
              ? "font-medium text-[var(--color-text)]"
              : status === "complete"
                ? "cursor-pointer font-normal text-[var(--color-text)] hover:text-[var(--color-accent)]"
                : status === "error"
                  ? "font-normal text-red-500"
                  : "font-normal text-[var(--color-text-muted)]"
          }`}
        >
          {label}
        </button>
        {subtitle && (
          <span className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
            {subtitle}
          </span>
        )}
        {activeContent}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubGroupCard — individual sub-group with modifier pills
// ---------------------------------------------------------------------------

const CATEGORY_COLOURS: Record<string, string> = {
  geography: "bg-blue-100 text-blue-800",
  household_financial: "bg-green-100 text-green-800",
  time_routine: "bg-amber-100 text-amber-800",
  cognitive_bandwidth: "bg-purple-100 text-purple-800",
  diet_health: "bg-rose-100 text-rose-800",
  ethnicity: "bg-orange-100 text-orange-800",
};

function SubGroupCard({
  subGroup,
  onRemove,
}: {
  subGroup: SubGroup;
  onRemove?: (id: string) => void;
}) {
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
              CATEGORY_COLOURS[mod.category] || "bg-gray-100 text-gray-800"
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

// ---------------------------------------------------------------------------
// SubGroupSection — collapsible sub-group list
// ---------------------------------------------------------------------------

function SubGroupSection({
  subGroups,
  editable,
  defaultCollapsed,
  onRemove,
}: {
  subGroups: SubGroup[];
  editable: boolean;
  defaultCollapsed: boolean;
  onRemove?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const showCards = editable || !collapsed;

  return (
    <div className="border-t border-[var(--color-border)]">
      <button
        onClick={() => !editable && setCollapsed((prev) => !prev)}
        className={`flex w-full items-center gap-2 px-4 py-2.5 text-left ${
          editable ? "cursor-default" : "cursor-pointer hover:bg-[var(--color-bg)]"
        }`}
      >
        {!editable && (
          collapsed ? (
            <ChevronRight size={14} className="shrink-0 text-[var(--color-text-muted)]" />
          ) : (
            <ChevronDown size={14} className="shrink-0 text-[var(--color-text-muted)]" />
          )
        )}
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-[var(--color-text)]">
            {editable ? "Proposed Sub-groups" : `${subGroups.length} sub-groups confirmed`}
          </span>
          {editable && (
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
              Remove any that aren&apos;t relevant, or add more via the chat.
            </p>
          )}
        </div>
      </button>

      {showCards && (
        <div className="space-y-2 px-3 pb-3">
          {subGroups.map((sg) => (
            <SubGroupCard
              key={sg.id}
              subGroup={sg}
              onRemove={editable ? onRemove : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SpecificationSidebar({
  spec,
  stage,
  policyName,
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
  const isSpecifying = stage === "specifying";
  const isAnalysing = stage === "analysing";
  const isChatting = stage === "chatting";

  const steps = analysisProgress?.steps ?? [];

  const scanStep = steps.find((s) => s.step === "scan");
  const analysisSteps = steps.filter(
    (s) => s.step === "subgroup" || s.step === "synthesis",
  );
  const hasAnalysisStarted = analysisSteps.some(
    (s) => s.status === "active" || s.status === "complete" || s.status === "error",
  );
  const isComplete = analysisProgress?.isComplete ?? false;

  const hasSubGroups =
    confirmedSubGroups && confirmedSubGroups.length > 0;
  const subGroupsEditable =
    isAnalysing && hasSubGroups && !hasAnalysisStarted;

  let scanSummary: string | null = null;
  if (
    scanStep?.status === "complete" &&
    proposedSubGroups?.relevance_scan
  ) {
    const scan = proposedSubGroups.relevance_scan;
    const totalCount = Object.keys(scan).length;
    const highCount = Object.values(scan).filter(
      (v) => v.toUpperCase() === "HIGH",
    ).length;
    scanSummary = `${totalCount} assessed, ${highCount} high relevance`;
  }

  // --- Analysing / chatting: unified progressive sidebar ---
  if (isAnalysing || (isChatting && steps.length > 0)) {
    return (
      <aside className="flex h-full w-80 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
        <CompactSpecView
          spec={spec}
          policyName={policyName}
          onViewSummary={() => onSelectSection?.("policy_summary")}
        />

        <div className="flex-1 overflow-y-auto">
          {/* Stepper area */}
          <div className="p-4">
            {scanStep && (
              <StepEntry
                status={scanStep.status}
                label="Identifying affected populations"
                subtitle={
                  scanStep.status === "active"
                    ? "Assessing population characteristics…"
                    : scanStep.status === "complete"
                      ? scanSummary
                      : null
                }
                isLast={!hasSubGroups && analysisSteps.length === 0}
                onClick={() => onSelectSection?.("scan")}
              />
            )}
          </div>

          {hasSubGroups && (
            <SubGroupSection
              subGroups={confirmedSubGroups!}
              editable={subGroupsEditable}
              defaultCollapsed={hasAnalysisStarted || isComplete}
              onRemove={onRemoveSubGroup}
            />
          )}

          {analysisSteps.length > 0 && (
            <div className="p-4">
              {analysisSteps.map((step, i) => {
                const isLast = i === analysisSteps.length - 1;
                const label =
                  step.step === "synthesis"
                    ? "Equity synthesis and provocations"
                    : step.name || `Sub-group ${(step.index ?? 0) + 1}`;
                const sectionId =
                  step.step === "synthesis"
                    ? "synthesis"
                    : `sg_${step.index ?? 0}`;
                const isActive = step.status === "active";

                let activeContent: React.ReactNode = null;
                if (isActive && activeEvidenceSearch) {
                  activeContent = (
                    <div className="evidence-search-indicator mt-1 flex items-center gap-1.5 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1">
                      <Search size={10} className="shrink-0 text-[var(--color-text-muted)]" />
                      <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                        {activeEvidenceSearch}
                      </span>
                    </div>
                  );
                } else if (isActive) {
                  activeContent = (
                    <span className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                      {(evidenceSearchCount ?? 0) > 0
                        ? `Generating analysis (${evidenceSearchCount} evidence searches done)…`
                        : "Searching evidence base…"}
                    </span>
                  );
                }

                return (
                  <StepEntry
                    key={`${step.step}-${step.index ?? "s"}`}
                    status={step.status}
                    label={label}
                    isLast={isLast}
                    onClick={() => onSelectSection?.(sectionId)}
                    activeContent={activeContent}
                  />
                );
              })}
            </div>
          )}

          {hasAnalysisStarted && !isComplete && (
            <div className="px-4 pb-3 pt-1">
              <p className="text-[11px] text-[var(--color-text-muted)]">
                <Clock size={10} className="mr-1 inline" />
                Typically takes 1–2 minutes
              </p>
            </div>
          )}

          {isComplete && (
            <div className="px-4 pb-4">
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center text-xs font-medium text-green-700">
                Analysis complete — ask follow-up questions below
              </div>
            </div>
          )}
        </div>

        {subGroupsEditable && (
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
        )}
      </aside>
    );
  }

  // --- Specifying stage: policy summary status + taxonomy pills + proceed button ---
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Policy Specification
        </h2>
        {policyName && (
          <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
            {policyName}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {Object.keys(spec.taxonomy_mapping).length > 0 ? (
          <TaxonomyPills taxonomyMapping={spec.taxonomy_mapping} />
        ) : (
          <p className="text-xs text-[var(--color-text-muted)]">
            Describe a policy in the chat to begin specification.
          </p>
        )}

        {spec.open_questions.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
            <HelpCircle size={12} />
            <span>
              {spec.open_questions.length} question{spec.open_questions.length !== 1 ? "s" : ""} for the analysis
            </span>
          </div>
        )}
      </div>

      {isSpecifying && (
        <div className="border-t border-[var(--color-border)] p-4">
          <button
            onClick={onProceed}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              spec.ready_for_analysis
                ? "bg-[var(--color-accent)] text-white hover:opacity-90"
                : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
            }`}
          >
            {spec.ready_for_analysis ? (
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
