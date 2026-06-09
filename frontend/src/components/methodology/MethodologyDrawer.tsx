"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface MethodologyDrawerProps {
  open: boolean;
  onClose: () => void;
  scrollToSection?: string | null;
}

function SectionHeading({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="mb-3 mt-8 text-sm font-semibold text-[var(--color-text)] first:mt-0"
    >
      {children}
    </h3>
  );
}

function BadgeSample({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${className}`}
    >
      {label}
    </span>
  );
}

export function MethodologyDrawer({
  open,
  onClose,
  scrollToSection,
}: MethodologyDrawerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !scrollToSection) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(scrollToSection);
      if (el && scrollContainerRef.current) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [open, scrollToSection]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="evidence-drawer-backdrop fixed inset-0 z-40"
        onClick={onClose}
      />

      <div className="evidence-drawer fixed right-0 top-0 z-50 flex h-full w-[520px] max-w-[90vw] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">
            How this tool works
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 py-5"
        >
          <div className="space-y-1 text-xs leading-relaxed text-[var(--color-text)]">
            {/* Purpose */}
            <SectionHeading>Purpose</SectionHeading>
            <p className="text-[var(--color-text-muted)]">
              This tool helps Nesta health team analysts stress-test food
              environment policies against the likely experiences of
              underrepresented population sub-groups in the UK. It is a{" "}
              <strong className="text-[var(--color-text)]">
                pre-consultation analytical aid
              </strong>{" "}
              — it sharpens thinking and surfaces blind spots before real
              engagement with affected communities, not as a substitute for that
              engagement.
            </p>
            <p className="mt-2 text-[var(--color-text-muted)]">
              The tool analyses how policies interact with people&apos;s
              material circumstances (income, geography, time, access, health)
              rather than attempting to simulate what marginalised people
              &ldquo;would think.&rdquo; The analysis is structural, not
              performative.
            </p>

            {/* How the analysis works */}
            <SectionHeading>How the analysis works</SectionHeading>
            <p className="mb-3 text-[var(--color-text-muted)]">
              The analysis follows four stages:
            </p>
            <ol className="space-y-3 pl-4 text-[var(--color-text-muted)]">
              <li>
                <strong className="text-[var(--color-text)]">
                  1. Policy specification
                </strong>{" "}
                — The tool asks clarifying questions about the proposed policy
                to understand its mechanism, scope, target population, and
                delivery. This produces a structured policy summary.
              </li>
              <li>
                <strong className="text-[var(--color-text)]">
                  2. Population relevance scan
                </strong>{" "}
                — The policy is assessed against a framework of population
                modifiers (geography, household finances, time constraints,
                diet/health, etc.) to identify which characteristics are most
                relevant. Sub-groups are composed from combinations of relevant
                modifiers.
              </li>
              <li>
                <strong className="text-[var(--color-text)]">
                  3. Sub-group analysis
                </strong>{" "}
                — Each sub-group is analysed individually. For each, the tool
                searches the evidence base for relevant research, then produces
                a grounded analysis of how the policy would likely affect that
                group. Every claim is tagged with a grounding level (see below).
              </li>
              <li>
                <strong className="text-[var(--color-text)]">
                  4. Synthesis
                </strong>{" "}
                — The individual sub-group analyses are synthesised into three
                outputs: an equity assessment (who benefits most/least), risks
                and provocations (evidence gaps, assumption risks, equity
                tensions), and design improvements (recommendations for making
                the policy more equitable).
              </li>
            </ol>

            {/* Evidence base */}
            <SectionHeading>Evidence base</SectionHeading>
            <p className="text-[var(--color-text-muted)]">
              The tool draws on a curated corpus of qualitative and
              mixed-methods research studies, primarily UK-based, covering food
              insecurity, shopping behaviours, cooking practices, takeaway
              consumption, food aid experiences, and related topics.
            </p>
            <ul className="mt-2 space-y-1.5 pl-4 text-[var(--color-text-muted)]">
              <li>
                Studies span approximately 2010–2026 across English regions
                including London, Manchester, Liverpool, West Midlands,
                Bradford, and North East England
              </li>
              <li>
                Methodologies include ethnographic research, semi-structured
                interviews, shop-along interviews, photo-elicitation, and
                grounded theory
              </li>
              <li>
                Evidence is retrieved using hybrid search (keyword + semantic
                matching) tailored to each sub-group and policy dimension
              </li>
            </ul>

            {/* The AI model */}
            <SectionHeading>The AI model</SectionHeading>
            <ul className="space-y-1.5 pl-4 text-[var(--color-text-muted)]">
              <li>
                Analysis is produced by a large language model via the OpenAI
                API
              </li>
              <li>
                The model reasons from the retrieved evidence and the policy
                specification
              </li>
              <li>
                It does not have access to the internet or any data beyond the
                curated evidence base during analysis
              </li>
              <li>
                Each sub-group is analysed in a separate focused call with
                targeted evidence retrieval, not one monolithic generation
              </li>
            </ul>

            {/* Grounding levels */}
            <SectionHeading id="grounding-levels">
              Grounding levels
            </SectionHeading>
            <p className="mb-3 text-[var(--color-text-muted)]">
              Every claim in the sub-group analysis is tagged with a coloured
              badge indicating how well it is supported by the evidence base.
              Click any badge in the analysis to see the underlying detail.
            </p>
            <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
              <div className="flex items-start gap-2.5">
                <BadgeSample
                  className="badge-evidence shrink-0"
                  label="Evidence"
                />
                <span className="text-[var(--color-text-muted)]">
                  Directly supported by a specific passage in the evidence base.
                  The source is cited and the relevant excerpt can be verified.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <BadgeSample
                  className="badge-analogical shrink-0"
                  label="Analogical"
                />
                <span className="text-[var(--color-text-muted)]">
                  Drawn from related evidence that does not directly address this
                  policy or group but provides relevant context (e.g. a study on
                  a similar intervention in a different setting).
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <BadgeSample
                  className="badge-inferred shrink-0"
                  label="Inferred"
                />
                <span className="text-[var(--color-text-muted)]">
                  The model has reasoned forward from a specific evidence source.
                  The source provides a factual basis but the specific claim is
                  the model&apos;s inference — not directly stated in the
                  evidence.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <BadgeSample
                  className="badge-reasoning shrink-0"
                  label="Reasoning"
                />
                <span className="text-[var(--color-text-muted)]">
                  Based on the model&apos;s structured reasoning from general
                  knowledge and the policy&apos;s constraints — not tied to any
                  specific source in the evidence base.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <BadgeSample className="badge-gap shrink-0" label="Gap" />
                <span className="text-[var(--color-text-muted)]">
                  The evidence base does not contain sufficient information to
                  assess this point. This is an area where real engagement with
                  affected communities would be needed.
                </span>
              </div>
            </div>

            {/* Known limitations */}
            <SectionHeading>Known limitations</SectionHeading>
            <ul className="space-y-1.5 pl-4 text-[var(--color-text-muted)]">
              <li>
                The evidence base is small (tens of sources, not hundreds) and
                may not cover all policy areas — particularly pharmaceutical
                interventions (e.g. GLP-1 medications)
              </li>
              <li>
                Geographic coverage is uneven, concentrated in urban England
                with limited rural and devolved-nation coverage
              </li>
              <li>
                Raw qualitative data (interview transcripts, survey responses)
                is not included — the tool works from published research
                summaries
              </li>
              <li>
                AI-generated analysis may contain inaccuracies, miss important
                nuances, or overstate the strength of its conclusions
              </li>
              <li>
                The grounding badge counts are self-reported by the model and
                may not perfectly reflect the actual evidence quality
              </li>
              <li>
                The tool cannot capture the full complexity of lived experience
                — it analyses structural constraints, not individual stories
              </li>
            </ul>

            {/* How to use the outputs */}
            <SectionHeading>How to use the outputs</SectionHeading>
            <div className="space-y-2 text-[var(--color-text-muted)]">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-emerald-600">✓</span>
                <span>
                  <strong className="text-[var(--color-text)]">
                    As a pre-consultation analytical aid
                  </strong>{" "}
                  — sharpening questions before real engagement with affected
                  communities
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-emerald-600">✓</span>
                <span>
                  <strong className="text-[var(--color-text)]">
                    As a structured thinking tool
                  </strong>{" "}
                  — surfacing considerations the analyst might not have thought
                  of
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-emerald-600">✓</span>
                <span>
                  <strong className="text-[var(--color-text)]">
                    As an evidence map
                  </strong>{" "}
                  — identifying where research exists and where gaps are
                </span>
              </div>
              <div className="mt-3 flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-red-500">✗</span>
                <span>
                  <strong className="text-[var(--color-text)]">
                    Not a substitute
                  </strong>{" "}
                  for qualitative research with affected populations
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-red-500">✗</span>
                <span>
                  <strong className="text-[var(--color-text)]">
                    Not definitive evidence
                  </strong>{" "}
                  for policy decisions
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-red-500">✗</span>
                <span>
                  <strong className="text-[var(--color-text)]">
                    Not representative
                  </strong>{" "}
                  of any community&apos;s views — the tool analyses material
                  constraints, it does not simulate opinions
                </span>
              </div>
            </div>

            <div className="mt-6" />
          </div>
        </div>
      </div>
    </>
  );
}
