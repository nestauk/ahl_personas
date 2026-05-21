"use client";

import { FileText } from "lucide-react";
import type { AnalysisSection } from "@/lib/types";
import { AnalysisSectionPanel } from "./AnalysisSectionPanel";

interface AnalysisViewProps {
  sections: Map<string, AnalysisSection>;
  activeSection: string | null;
  streamingSection: string | null;
}

export function AnalysisView({
  sections,
  activeSection,
  streamingSection,
}: AnalysisViewProps) {
  const section = activeSection ? sections.get(activeSection) : null;

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

  const isStreaming = streamingSection === activeSection;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          {section.name}
        </h2>
      </div>
      <AnalysisSectionPanel
        key={activeSection}
        content={section.content}
        isStreaming={isStreaming}
      />
    </div>
  );
}
