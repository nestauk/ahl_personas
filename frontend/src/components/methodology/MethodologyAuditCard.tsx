"use client";

import type { SubGroup, SummaryCard } from "@/lib/types";
import { sgDisplayLabel } from "@/lib/analysis-sections";

export interface AuditCardData {
  policyName: string;
  policySummary: string;
  subGroups: SubGroup[];
  totalSearches: number;
  citedSourceCount: number;
  totalSourceCount: number;
  groundingDistribution: {
    evidence: number;
    analogical: number;
    inferred: number;
    reasoning: number;
    gaps: number;
  };
  completedAt: string;
  durationSeconds: number | null;
}

export function buildAuditCardData({
  policyName,
  policySummary,
  confirmedSubGroups,
  subgroupEvidence,
  evidenceSourceCount,
  summaryCards,
  citedSourceCount,
}: {
  policyName: string | null;
  policySummary: string | null;
  confirmedSubGroups: SubGroup[] | null;
  subgroupEvidence: Map<string, unknown[]>;
  evidenceSourceCount: number | null;
  summaryCards: Map<string, SummaryCard>;
  citedSourceCount: number;
}): AuditCardData {
  let totalSearches = 0;
  subgroupEvidence.forEach((searches) => {
    totalSearches += searches.length;
  });

  const grounding = { evidence: 0, analogical: 0, inferred: 0, reasoning: 0, gaps: 0 };
  summaryCards.forEach((card, sectionId) => {
    if (!sectionId.startsWith("sg_") || !card.evidence_confidence) return;
    grounding.evidence += card.evidence_confidence.evidence_backed;
    grounding.analogical += card.evidence_confidence.analogical;
    grounding.inferred += card.evidence_confidence.inferred ?? 0;
    grounding.reasoning += card.evidence_confidence.reasoning;
    grounding.gaps += card.evidence_confidence.gaps;
  });

  return {
    policyName: policyName || "Unnamed policy",
    policySummary: policySummary || "",
    subGroups: confirmedSubGroups ?? [],
    totalSearches,
    citedSourceCount,
    totalSourceCount: evidenceSourceCount ?? 0,
    groundingDistribution: grounding,
    completedAt: new Date().toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    durationSeconds: null,
  };
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2">
      <div className="text-sm font-semibold text-[var(--color-text)]">
        {value}
      </div>
      <div className="text-[10px] text-[var(--color-text-muted)]">{label}</div>
    </div>
  );
}

export function MethodologyAuditCard({ data }: { data: AuditCardData }) {
  const totalClaims =
    data.groundingDistribution.evidence +
    data.groundingDistribution.analogical +
    data.groundingDistribution.inferred +
    data.groundingDistribution.reasoning +
    data.groundingDistribution.gaps;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Policy */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Policy analysed
        </h3>
        <p className="text-sm font-medium text-[var(--color-text)]">
          {data.policyName}
        </p>
        {data.policySummary && (
          <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {data.policySummary.length > 200
              ? data.policySummary.slice(0, 200) + "…"
              : data.policySummary}
          </p>
        )}
      </section>

      {/* Sub-groups */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Sub-groups analysed ({data.subGroups.length})
        </h3>
        <div className="space-y-1.5">
          {data.subGroups.map((sg, i) => (
            <div
              key={sg.id}
              className="flex items-start gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2"
            >
              <span className="shrink-0 text-[10px] font-semibold text-[var(--color-text-muted)]">
                {sgDisplayLabel(i)}
              </span>
              <div className="min-w-0">
                <span className="text-xs font-medium text-[var(--color-text)]">
                  {sg.name}
                </span>
                {sg.modifiers.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {sg.modifiers.map((mod, j) => (
                      <span
                        key={j}
                        className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600"
                      >
                        {mod.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stats grid */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Analysis summary
        </h3>
        <div className="grid grid-cols-3 gap-2">
          <StatBlock label="Evidence searches" value={data.totalSearches} />
          <StatBlock
            label="Sources cited"
            value={
              data.totalSourceCount > 0
                ? `${data.citedSourceCount} of ${data.totalSourceCount}`
                : `${data.citedSourceCount}`
            }
          />
          <StatBlock label="Total claims tagged" value={totalClaims} />
        </div>
      </section>

      {/* Grounding distribution */}
      {totalClaims > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Evidence grounding distribution
          </h3>
          <div className="space-y-1.5">
            <GroundingBar
              label="Evidence-backed"
              count={data.groundingDistribution.evidence}
              total={totalClaims}
              className="bg-teal-500"
            />
            <GroundingBar
              label="Analogical"
              count={data.groundingDistribution.analogical}
              total={totalClaims}
              className="bg-amber-500"
            />
            <GroundingBar
              label="Inferred"
              count={data.groundingDistribution.inferred}
              total={totalClaims}
              className="bg-blue-500"
            />
            <GroundingBar
              label="Reasoning"
              count={data.groundingDistribution.reasoning}
              total={totalClaims}
              className="bg-gray-400"
            />
            <GroundingBar
              label="Gaps"
              count={data.groundingDistribution.gaps}
              total={totalClaims}
              className="bg-rose-400"
            />
          </div>
        </section>
      )}

      {/* Metadata */}
      <section className="border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
          <span>Analysis produced: {data.completedAt}</span>
          {data.durationSeconds !== null && (
            <span>
              Duration:{" "}
              {data.durationSeconds >= 60
                ? `${Math.floor(data.durationSeconds / 60)}m ${Math.round(data.durationSeconds % 60)}s`
                : `${Math.round(data.durationSeconds)}s`}
            </span>
          )}
        </div>
      </section>

      {/* Caveat */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
        This analysis is AI-generated from a limited evidence base. It is a
        pre-consultation analytical aid — claims should be verified through
        direct engagement with affected communities before informing policy
        decisions.
      </div>
    </div>
  );
}

function GroundingBar({
  label,
  count,
  total,
  className,
}: {
  label: string;
  count: number;
  total: number;
  className: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-right text-[11px] text-[var(--color-text-muted)]">
        {label}
      </span>
      <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-gray-100">
        {pct > 0 && (
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${className}`}
            style={{ width: `${Math.max(pct, 2)}%` }}
          />
        )}
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] font-medium text-[var(--color-text)]">
        {count}
      </span>
    </div>
  );
}
