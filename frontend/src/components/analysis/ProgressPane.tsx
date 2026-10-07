"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Info,
  Search,
  X,
} from "lucide-react";
import type {
  AnalysisProgress,
  AnalysisStep,
  EvidenceSearchRecord,
  ProposedSubGroups,
  SubGroup,
} from "@/lib/types";
import {
  SYNTHESIS_SECTION_IDS,
  SYNTHESIS_SECTION_LABELS,
  SYNTHESIS_ACTIVE_STATUS,
  fmtElapsed,
  type SynthesisSectionId,
} from "@/lib/analysis-sections";


// Run progress (stepper, editable sub-groups, evidence searches). Formerly the
// left sidebar; now rendered inside the context pane.
interface ProgressPaneProps {
  proposedSubGroups?: ProposedSubGroups | null;
  confirmedSubGroups?: SubGroup[] | null;
  analysisProgress?: AnalysisProgress;
  onRemoveSubGroup?: (id: string) => void;
  onSelectSection?: (sectionId: string) => void;
  synthesisSubsteps?: Record<SynthesisSectionId, AnalysisStep["status"]>;
  streamingSection?: string | null;
  scanCategoryProgress?: { completed: number; total: number } | null;
  hasAuditCard?: boolean;
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
  completedVariant = "default",
}: {
  status: AnalysisStep["status"];
  label: string;
  subtitle?: string | null;
  isLast?: boolean;
  onClick?: () => void;
  activeContent?: React.ReactNode;
  completedVariant?: "default" | "synthesis" | "methodology";
}) {
  const isActive = status === "active";
  const isClickable = status === "complete" || status === "active";

  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[11px] top-[24px] h-[calc(100%-8px)] w-[2px] bg-[var(--color-border)]" />
      )}

      <div className="relative z-10 flex shrink-0">
        {status === "complete" && completedVariant === "methodology" ? (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-gray-400">
            <Info size={12} className="text-white" />
          </div>
        ) : status === "complete" && completedVariant === "synthesis" ? (
          <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-indigo-500">
            <FileText size={12} className="text-white" />
          </div>
        ) : status === "complete" ? (
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
  const isCategorical = subGroup.categorical && subGroup.category_pattern;

  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
      aria-label={subGroup.name}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {isCategorical && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
              Category-level pattern
            </span>
          )}
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
      {isCategorical && subGroup.category_pattern && (
        <div className="mt-1.5 text-[10px] leading-relaxed text-[var(--color-text-muted)]">
          <span className="font-medium">Covers:</span>{" "}
          {subGroup.category_pattern.affected_modifiers
            .map((m) => m.name)
            .join(", ")}
        </div>
      )}
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

  useEffect(() => {
    setCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

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
// SearchList — expandable list of completed evidence searches for a step
// ---------------------------------------------------------------------------

function SearchList({
  searches,
  activeQuery = null,
  isStepActive = false,
}: {
  searches: EvidenceSearchRecord[];
  activeQuery?: string | null;
  isStepActive?: boolean;
}) {
  const [expanded, setExpanded] = useState(isStepActive);
  const userOverride = useRef<boolean | null>(null);

  useEffect(() => {
    userOverride.current = null;
    setExpanded(isStepActive);
  }, [isStepActive]);

  const hasInFlight = Boolean(activeQuery);
  const totalCount = searches.length + (hasInFlight ? 1 : 0);

  if (totalCount === 0) return null;

  return (
    <div className="mt-1">
      <button
        onClick={() => {
          setExpanded((prev) => {
            userOverride.current = !prev;
            return !prev;
          });
        }}
        className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      >
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span>
          {totalCount} evidence search{totalCount !== 1 ? "es" : ""}
        </span>
      </button>
      {expanded && (
        <div className="mt-1 space-y-1.5 pl-3.5">
          {hasInFlight && activeQuery && (
            <div className="rounded border border-[var(--color-accent)]/30 bg-[var(--color-accent-light)]/50 px-2 py-1">
              <div className="flex items-start gap-1">
                <Search size={9} className="mt-[3px] shrink-0 text-[var(--color-accent)]" />
                <span className="text-[10px] leading-snug text-[var(--color-text)]">
                  {activeQuery}
                </span>
              </div>
            </div>
          )}
          {searches.map((s, i) => (
            <div
              key={i}
              className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1"
            >
              <div className="flex items-start gap-1">
                <Search size={9} className="mt-[3px] shrink-0 text-[var(--color-text-muted)]" />
                <span className="text-[10px] leading-snug text-[var(--color-text)]">
                  {s.query}
                </span>
              </div>
              {s.numResults === 0 && (
                <div className="mt-0.5 pl-[13px] text-[9px] text-red-500">
                  No results found
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProgressPane({
  proposedSubGroups,
  confirmedSubGroups,
  analysisProgress,
  onRemoveSubGroup,
  onSelectSection,
  synthesisSubsteps,
  streamingSection = null,
  scanCategoryProgress = null,
  hasAuditCard = false,
}: ProgressPaneProps) {
  const steps = analysisProgress?.steps ?? [];

  const scanStep = steps.find((s) => s.step === "scan");
  const subgroupAnalysisSteps = steps.filter((s) => s.step === "subgroup");
  const synthesisStep = steps.find((s) => s.step === "synthesis") ?? null;
  const hasAnalysisStarted = subgroupAnalysisSteps.some(
    (s) => s.status === "active" || s.status === "complete" || s.status === "error",
  );
  const isComplete = analysisProgress?.isComplete ?? false;

  // Tick once a second only while some step is running, for the m:ss timers.
  const anyActive = steps.some((s) => s.status === "active");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!anyActive) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [anyActive]);
  const elapsed = (step: AnalysisStep | null | undefined) =>
    step?.status === "active" && step.startedAt
      ? ` · ${fmtElapsed(now - step.startedAt)}`
      : "";

  const hasSubGroups =
    confirmedSubGroups && confirmedSubGroups.length > 0;
  const subGroupsEditable =
    !!(hasSubGroups && !hasAnalysisStarted);

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

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface)]">
      {/* Stepper area */}
      <div className="p-4">
        {scanStep && (
          <StepEntry
            status={scanStep.status}
            label="Identifying affected populations"
            subtitle={
              scanStep.status === "active"
                ? scanCategoryProgress && scanCategoryProgress.completed > 0
                  ? `${scanCategoryProgress.completed} of ${scanCategoryProgress.total} categories assessed${elapsed(scanStep)}`
                  : `Assessing population characteristics…${elapsed(scanStep)}`
                : scanStep.status === "complete"
                  ? scanSummary
                  : null
            }
            isLast={!hasSubGroups && subgroupAnalysisSteps.length === 0 && !synthesisStep}
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

      {subgroupAnalysisSteps.length > 0 && (
        <div className="p-4">
          {subgroupAnalysisSteps.map((step, i) => {
            const isLast = i === subgroupAnalysisSteps.length - 1;
            const baseName =
              step.name || `Sub-group ${(step.index ?? 0) + 1}`;
            const sectionId = `sg_${step.index ?? 0}`;
            const label = baseName;
            const isActive = step.status === "active";
            const stepSearches = step.searches ?? [];

            let phaseSubtitle: string | null = null;
            if (isActive) {
              phaseSubtitle =
                (step.writing
                  ? "Writing report"
                  : step.activeQuery || stepSearches.length
                    ? `Searching evidence (${stepSearches.length + (step.activeQuery ? 1 : 0)})`
                    : "Starting…") + elapsed(step);
            } else if (step.status === "error") {
              phaseSubtitle = "Analysis failed — skipped";
            }

            return (
              <StepEntry
                key={`${step.step}-${step.index ?? "s"}`}
                status={step.status}
                label={label}
                subtitle={phaseSubtitle}
                isLast={isLast && !synthesisStep}
                onClick={() => onSelectSection?.(sectionId)}
                activeContent={
                  (stepSearches.length > 0 || step.activeQuery) && (
                    <SearchList
                      searches={stepSearches}
                      activeQuery={step.activeQuery ?? null}
                      isStepActive={isActive}
                    />
                  )
                }
              />
            );
          })}
        </div>
      )}

      {/* Synthesis section — visually separated from sub-group steps */}
      {synthesisStep && (
        <>
          <div className="mx-4 border-t border-[var(--color-border)]" />
          <div className="px-4 pt-3">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
              Synthesis
            </h3>
            <div className="synthesis-substep space-y-0">
              {SYNTHESIS_SECTION_IDS.map((sectionId, i) => {
                const subStatus =
                  synthesisSubsteps?.[sectionId] ??
                  (synthesisStep.status === "pending"
                    ? "pending"
                    : synthesisStep.status);
                const isSubActive = subStatus === "active";
                const synthesisSubtitle = isSubActive
                  ? SYNTHESIS_ACTIVE_STATUS[
                      (streamingSection &&
                      SYNTHESIS_SECTION_IDS.includes(
                        streamingSection as SynthesisSectionId,
                      )
                        ? streamingSection
                        : sectionId) as SynthesisSectionId
                    ] + elapsed(synthesisStep)
                  : null;
                return (
                  <StepEntry
                    key={sectionId}
                    status={subStatus}
                    label={SYNTHESIS_SECTION_LABELS[sectionId]}
                    subtitle={synthesisSubtitle}
                    isLast={i === SYNTHESIS_SECTION_IDS.length - 1}
                    onClick={() => onSelectSection?.(sectionId)}
                    completedVariant="synthesis"
                  />
                );
              })}
            </div>
          </div>
        </>
      )}

      {hasAuditCard && (
        <div className="px-4 pt-2">
          <StepEntry
            status="complete"
            label="Analysis Methodology"
            isLast
            onClick={() => onSelectSection?.("methodology")}
            completedVariant="methodology"
          />
        </div>
      )}

      {isComplete && (
        <div className="px-4 pb-4 space-y-2">
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center text-xs font-medium text-green-700">
            Analysis complete — ask follow-up questions in the chat
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800">
            This analysis is AI-generated from a limited evidence base.
            Claims should be verified through direct engagement with
            affected communities.
          </div>
        </div>
      )}
    </div>
  );
}
