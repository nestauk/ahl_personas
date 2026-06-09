"use client";

import { FileText, Loader2 } from "lucide-react";
import type {
  AnalysisSection,
  RawEvidenceSearch,
  SubGroup,
  SummaryCard,
} from "@/lib/types";
import { TAXONOMY_LABELS } from "@/lib/types";
import {
  EMPTY_SYNTHESIS_SECTION_NOTE,
  SYNTHESIS_SECTION_LABELS,
  getSectionSubtitle,
  isSynthesisSection,
} from "@/lib/analysis-sections";
import { AnalysisSectionPanel } from "./AnalysisSectionPanel";
import {
  MethodologyAuditCard,
  type AuditCardData,
} from "../methodology/MethodologyAuditCard";

interface PolicySummaryData {
  name: string;
  summary: string;
  openQuestions: string[];
  taxonomyMapping: Record<string, string[]>;
}

interface AnalysisViewProps {
  policySummary: PolicySummaryData | null;
  policyName?: string | null;
  sections: Map<string, AnalysisSection>;
  activeSection: string | null;
  streamingSection: string | null;
  subgroupEvidence: Map<string, RawEvidenceSearch[]>;
  summaryCards?: Map<string, SummaryCard>;
  confirmedSubGroups?: SubGroup[] | null;
  synthesisComplete?: boolean;
  onNavigateToSection?: (sectionId: string) => void;
  onOpenEvidenceDrawer?: (targetSourceName?: string) => void;
  onOpenMethodologyDrawer?: (scrollTo?: string) => void;
  auditCardData?: AuditCardData | null;
}

function buildSummaryContent(data: PolicySummaryData): string {
  let content = data.summary;

  const entries = Object.entries(data.taxonomyMapping);
  if (entries.length > 0) {
    content += "\n\n### Taxonomy\n\n";
    for (const [key, values] of entries) {
      const label = TAXONOMY_LABELS[key] || key.replace(/_/g, " ");
      content += `- **${label}**: ${values.join(", ")}\n`;
    }
  }

  if (data.openQuestions.length > 0) {
    content += "\n### Open questions\n\n";
    for (const q of data.openQuestions) {
      content += `- ${q}\n`;
    }
  }
  return content;
}

export function AnalysisView({
  policySummary,
  policyName,
  sections,
  activeSection,
  streamingSection,
  subgroupEvidence,
  summaryCards,
  confirmedSubGroups,
  synthesisComplete = false,
  onNavigateToSection,
  onOpenEvidenceDrawer,
  onOpenMethodologyDrawer,
  auditCardData,
}: AnalysisViewProps) {
  const effectiveSection = activeSection ?? (policySummary ? "policy_summary" : null);

  if (effectiveSection === "policy_summary" && policySummary) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {policySummary.name}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            {getSectionSubtitle("policy_summary")}
          </p>
        </div>
        <AnalysisSectionPanel
          key="policy_summary"
          content={buildSummaryContent(policySummary)}
          isStreaming={false}
          sectionType="subgroup"
        />
      </div>
    );
  }

  if (effectiveSection === "methodology" && auditCardData) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-gray-200 bg-gray-50 px-8 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Analysis Methodology
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Summary of inputs, evidence usage, and grounding for this analysis
            run.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <MethodologyAuditCard data={auditCardData} />
        </div>
      </div>
    );
  }

  const section = effectiveSection ? sections.get(effectiveSection) : null;

  if (!section && effectiveSection && effectiveSection !== "policy_summary" && effectiveSection !== "methodology") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-sm text-[var(--color-text-muted)]">
          <Loader2 size={28} className="mx-auto mb-3 animate-spin opacity-40" />
          <p>Preparing analysis…</p>
        </div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center text-sm text-[var(--color-text-muted)]">
          <FileText size={32} className="mx-auto mb-3 opacity-40" />
          <p>Select a section from the sidebar to view the analysis.</p>
        </div>
      </div>
    );
  }

  const isStreaming = streamingSection === effectiveSection;
  const isSynthesis =
    effectiveSection !== null && isSynthesisSection(effectiveSection);
  const title = isSynthesis
    ? SYNTHESIS_SECTION_LABELS[effectiveSection]
    : section.name;
  const subtitle = effectiveSection
    ? getSectionSubtitle(
        effectiveSection,
        policyName,
        section.id.startsWith("sg_") ? section.name : null,
      )
    : null;

  const showEmptySynthesisNote =
    synthesisComplete &&
    !isStreaming &&
    effectiveSection &&
    (effectiveSection === "risks_provocations" ||
      effectiveSection === "design_improvements") &&
    !section.content.trim();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`border-b px-8 py-3 ${
          isSynthesis
            ? "border-indigo-200 bg-indigo-50"
            : "border-[var(--color-border)] bg-[var(--color-surface)]"
        }`}
      >
        <h2
          className={`text-sm font-semibold ${
            isSynthesis ? "text-indigo-900" : "text-[var(--color-text)]"
          }`}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mt-0.5 text-xs ${
              isSynthesis ? "text-indigo-600" : "text-[var(--color-text-muted)]"
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {showEmptySynthesisNote ? (
        <div className="flex flex-1 items-start px-8 py-6">
          <p className="text-sm text-[var(--color-text-muted)]">
            {EMPTY_SYNTHESIS_SECTION_NOTE}{" "}
            {onNavigateToSection && (
              <button
                type="button"
                onClick={() => onNavigateToSection("equity_assessment")}
                className="font-medium text-indigo-600 underline-offset-2 hover:underline"
              >
                Equity Assessment
              </button>
            )}
          </p>
        </div>
      ) : (
        <AnalysisSectionPanel
          key={effectiveSection}
          content={section.content}
          isStreaming={isStreaming}
          sectionId={effectiveSection ?? undefined}
          summaryCard={
            effectiveSection ? summaryCards?.get(effectiveSection) : undefined
          }
          rawEvidence={
            effectiveSection && !isSynthesis
              ? subgroupEvidence.get(effectiveSection)
              : undefined
          }
          sectionType={isSynthesis ? "synthesis" : "subgroup"}
          confirmedSubGroups={confirmedSubGroups ?? undefined}
          onNavigateToSection={onNavigateToSection}
          onOpenEvidenceDrawer={onOpenEvidenceDrawer}
          onOpenMethodologyDrawer={onOpenMethodologyDrawer}
        />
      )}
    </div>
  );
}
