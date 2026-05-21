"use client";

import { AlertCircle, Check, Clock } from "lucide-react";
import type { AnalysisProgress, SubGroup } from "@/lib/types";

interface AnalysisProgressPanelProps {
  progress: AnalysisProgress;
  confirmedSubGroups: SubGroup[];
}

function scrollToSection(name: string) {
  const headings = document.querySelectorAll(
    ".prose h2, .prose h3",
  );
  for (const heading of headings) {
    if (heading.textContent?.includes(name)) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
  }
}

export function AnalysisProgressPanel({
  progress,
  confirmedSubGroups,
}: AnalysisProgressPanelProps) {
  const { steps, isComplete } = progress;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          {isComplete ? "Analysis Complete" : "Analysis Progress"}
        </h2>
        {!isComplete && (
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            <Clock size={10} className="mr-1 inline" />
            Analysing {confirmedSubGroups.length} sub-groups — typically takes 1–2
            minutes
          </p>
        )}
      </div>

      <div className="flex-1 p-4">
        <div className="relative">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const label =
              step.step === "synthesis"
                ? "Equity synthesis and provocations"
                : step.name || `Sub-group ${(step.index ?? 0) + 1}`;

            const isClickable = step.status === "complete";

            return (
              <div key={`${step.step}-${step.index ?? "s"}`} className="relative flex gap-3">
                {/* Vertical line */}
                {!isLast && (
                  <div className="absolute left-[11px] top-[24px] h-[calc(100%-8px)] w-[2px] bg-[var(--color-border)]" />
                )}

                {/* Step circle */}
                <div className="relative z-10 flex shrink-0">
                  {step.status === "complete" ? (
                    <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--color-accent)]">
                      <Check size={12} className="text-white" />
                    </div>
                  ) : step.status === "error" ? (
                    <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-red-100">
                      <AlertCircle size={12} className="text-red-600" />
                    </div>
                  ) : step.status === "active" ? (
                    <div className="stepper-pulse flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--color-accent)] bg-white">
                      <div className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                    </div>
                  ) : (
                    <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                      <div className="h-2 w-2 rounded-full bg-[var(--color-border)]" />
                    </div>
                  )}
                </div>

                {/* Step label */}
                <button
                  onClick={
                    isClickable ? () => scrollToSection(label) : undefined
                  }
                  disabled={!isClickable}
                  className={`mb-6 text-left text-sm transition-colors ${
                    step.status === "active"
                      ? "font-medium text-[var(--color-text)]"
                      : step.status === "complete"
                        ? "cursor-pointer font-normal text-[var(--color-text)] hover:text-[var(--color-accent)]"
                        : step.status === "error"
                          ? "font-normal text-red-500"
                          : "font-normal text-[var(--color-text-muted)]"
                  }`}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </div>

        {isComplete && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-center text-xs font-medium text-green-700">
            Analysis complete — ask follow-up questions below
          </div>
        )}
      </div>
    </div>
  );
}
