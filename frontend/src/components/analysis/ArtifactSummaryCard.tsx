"use client";

import type { SummaryCard } from "@/lib/types";

interface ArtifactSummaryCardProps {
  card: SummaryCard;
  sectionId: string;
}

function normalizeFindings(card: SummaryCard): string[] {
  const raw = card.key_findings;
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
}

export function ArtifactSummaryCard({ card, sectionId }: ArtifactSummaryCardProps) {
  const findings = normalizeFindings(card);
  const isScan = sectionId === "scan";
  const isSubgroup = sectionId.startsWith("sg_");
  const isEquity = sectionId === "equity_assessment";
  const isRisks = sectionId === "risks_provocations";
  const isDesign = sectionId === "design_improvements";

  const headline =
    card.impact_direction ??
    card.summary ??
    card.inequality_direction ??
    null;

  const scanCounts =
    isScan &&
    (card.high_count !== undefined ||
      card.moderate_count !== undefined ||
      card.low_count !== undefined) ? (
      <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
        {card.high_count ?? 0} high · {card.moderate_count ?? 0} moderate ·{" "}
        {card.low_count ?? 0} low relevance
      </p>
    ) : null;

  const metaLine = (() => {
    if (isEquity && card.inequality_direction && card.impact_direction) {
      return (
        <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
          Inequality direction: {card.inequality_direction}
        </p>
      );
    }
    if (isRisks) {
      const parts: string[] = [];
      if (card.gap_count !== undefined) parts.push(`${card.gap_count} gaps`);
      if (card.assumption_risks !== undefined) {
        parts.push(`${card.assumption_risks} assumption risks`);
      }
      if (card.equity_tensions !== undefined) {
        parts.push(`${card.equity_tensions} equity tensions`);
      }
      if (parts.length === 0) return null;
      return (
        <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
          {parts.join(" · ")}
        </p>
      );
    }
    if (isDesign && card.recommendation_count !== undefined) {
      return (
        <p className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
          {card.recommendation_count} recommendation
          {card.recommendation_count !== 1 ? "s" : ""}
        </p>
      );
    }
    return null;
  })();

  const confidence = card.evidence_confidence;
  const showConfidence =
    isSubgroup &&
    confidence &&
    (confidence.evidence_backed > 0 ||
      confidence.analogical > 0 ||
      confidence.reasoning > 0 ||
      confidence.gaps > 0);

  return (
    <div className="artifact-summary-card mb-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-light)]/40 px-4 py-3">
      {headline && (
        <p className="text-sm font-semibold leading-snug text-[var(--color-text)]">
          {headline}
        </p>
      )}

      {scanCounts}
      {metaLine}

      {findings.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Key findings
          </p>
          <ul className="mt-1.5 space-y-1">
            {findings.map((finding, i) => (
              <li
                key={i}
                className="flex gap-2 text-xs leading-snug text-[var(--color-text)]"
              >
                <span className="mt-[3px] shrink-0 text-[var(--color-text-muted)]">
                  •
                </span>
                <span>{finding}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showConfidence && confidence && (
        <p className="mt-3 text-[10px] text-[var(--color-text-muted)]">
          Evidence: {confidence.evidence_backed} backed · {confidence.analogical}{" "}
          analogical · {confidence.reasoning} reasoning · {confidence.gaps} gaps
        </p>
      )}
    </div>
  );
}
