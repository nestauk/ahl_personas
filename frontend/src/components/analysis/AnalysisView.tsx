"use client";

import { FileText } from "lucide-react";
import type { AnalysisSection } from "@/lib/types";
import { AnalysisSectionPanel } from "./AnalysisSectionPanel";

interface PolicySummaryData {
  name: string;
  summary: string;
  openQuestions: string[];
}

interface AnalysisViewProps {
  policySummary: PolicySummaryData | null;
  sections: Map<string, AnalysisSection>;
  activeSection: string | null;
  streamingSection: string | null;
}

function buildSummaryContent(data: PolicySummaryData): string {
  let content = data.summary;
  if (data.openQuestions.length > 0) {
    content += "\n\n### For the analysis to consider\n\n";
    for (const q of data.openQuestions) {
      content += `- ${q}\n`;
    }
  }
  return content;
}

export function AnalysisView({
  policySummary,
  sections,
  activeSection,
  streamingSection,
}: AnalysisViewProps) {
  const effectiveSection = activeSection ?? (policySummary ? "policy_summary" : null);

  if (effectiveSection === "policy_summary" && policySummary) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            {policySummary.name}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Summary of the policy being analysed — updates as the conversation progresses.
          </p>
        </div>
        <AnalysisSectionPanel
          key="policy_summary"
          content={buildSummaryContent(policySummary)}
          isStreaming={false}
        />
      </div>
    );
  }

  const section = effectiveSection ? sections.get(effectiveSection) : null;

  if (!section) {
    if (policySummary) {
      return (
        <div className="flex flex-1 flex-col">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              {policySummary.name}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Summary of the policy being analysed — updates as the conversation progresses.
            </p>
          </div>
          <AnalysisSectionPanel
            key="policy_summary_fallback"
            content={buildSummaryContent(policySummary)}
            isStreaming={false}
          />
        </div>
      );
    }

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
  const isScan = effectiveSection === "scan";

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          {section.name}
        </h2>
        {isScan && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            Initial assessment based on policy characteristics — the detailed
            analysis will draw on the evidence base.
          </p>
        )}
      </div>
      <AnalysisSectionPanel
        key={effectiveSection}
        content={section.content}
        isStreaming={isStreaming}
      />
    </div>
  );
}
