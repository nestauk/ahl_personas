"use client";

import { RotateCcw } from "lucide-react";

interface HeaderProps {
  onNewSession: () => void;
}

export function Header({ onNewSession }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text)]">
          Food Policy Impact Tool
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Evidence-based food policy equity analysis
        </p>
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
