"use client";

import { RotateCcw } from "lucide-react";
import type { ConversationStage } from "@/lib/types";

interface HeaderProps {
  onNewSession: () => void;
  stage: ConversationStage;
}

const STAGE_LABELS: Record<ConversationStage, string> = {
  specifying: "Specifying policy",
  chatting: "Ready for analysis",
};

export function Header({ onNewSession, stage }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--color-text)]">
            Food Policy Impact Tool
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Evidence-based food policy equity analysis
          </p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
          {STAGE_LABELS[stage]}
        </span>
      </div>
      <button
        onClick={onNewSession}
        className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
      >
        <RotateCcw size={14} />
        New session
      </button>
    </header>
  );
}
