"use client";

import * as Popover from "@radix-ui/react-popover";
import { ChevronDown } from "lucide-react";

const TABS = [
  ["equity_assessment", "Equity"],
  ["risks_provocations", "Risks"],
  ["design_improvements", "Design"],
] as const;

const tabClass = (on: boolean) =>
  `flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
    on
      ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm"
      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
  }`;

const itemClass =
  "block w-full rounded px-3 py-1.5 text-left text-xs text-[var(--color-text)] hover:bg-[var(--color-bg)]";

function Menu({
  label,
  active,
  items,
  onSelect,
}: {
  label: string;
  active: boolean;
  items: [string, string][];
  onSelect: (id: string) => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger className={tabClass(active)}>
        {label}
        <ChevronDown size={12} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[200px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {items.map(([id, name]) => (
            <Popover.Close key={id} asChild>
              <button type="button" className={itemClass} onClick={() => onSelect(id)}>
                {name}
              </button>
            </Popover.Close>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Segmented control for the report pane once the run has produced reports. */
export function SectionSwitcher({
  active,
  subGroups,
  more,
  reportsReady,
  onSelect,
}: {
  active: string | null;
  reportsReady: boolean;
  subGroups: [string, string][];
  more: [string, string][];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-[var(--color-bg)] p-1">
      {TABS.map(([id, label]) => (
        <button
          key={id}
          type="button"
          disabled={!reportsReady}
          className={`${tabClass(active === id)} disabled:opacity-40`}
          onClick={() => onSelect(id)}
        >
          {label}
        </button>
      ))}
      {subGroups.length > 0 && (
        <Menu label="Sub-groups" active={!!active?.startsWith("sg_")} items={subGroups} onSelect={onSelect} />
      )}
      <Menu label="More" active={more.some(([id]) => id === active)} items={more} onSelect={onSelect} />
    </div>
  );
}
