"use client";

import { SendHorizonal } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}

export function ChatInput({
  input,
  isLoading,
  onInputChange,
  onSubmit,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        const form = e.currentTarget.form;
        if (form) form.requestSubmit();
      }
    }
  };

  return (
    <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-4">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex max-w-3xl items-end gap-3"
      >
        <textarea
          value={input}
          onChange={onInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Describe a policy or ask about food environment impacts..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm leading-relaxed text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          style={{ minHeight: "44px", maxHeight: "160px" }}
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white transition-opacity disabled:opacity-40"
        >
          <SendHorizonal size={18} />
        </button>
      </form>
    </div>
  );
}
