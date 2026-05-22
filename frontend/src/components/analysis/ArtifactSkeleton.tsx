"use client";

type SkeletonType = "scan" | "subgroup" | "equity_assessment" | "risks_provocations" | "design_improvements";

interface ArtifactSkeletonProps {
  type: SkeletonType;
}

function ShimmerLine({ width, height = "h-3.5" }: { width: string; height?: string }) {
  return (
    <div
      className={`scan-skeleton-shimmer ${height} rounded`}
      style={{ width }}
    />
  );
}

function ShimmerBullet({ width }: { width: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <div className="scan-skeleton-shimmer mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
      <ShimmerLine width={width} />
    </div>
  );
}

function SectionBlock({ heading, bullets }: { heading: string; bullets: string[] }) {
  return (
    <div className="mb-6">
      <h3 className="text-[var(--color-text)]">{heading}</h3>
      {bullets.map((w, i) => (
        <ShimmerBullet key={i} width={w} />
      ))}
    </div>
  );
}

function SkeletonRow({ widths }: { widths: [string, string, string] }) {
  return (
    <tr>
      {widths.map((w, i) => (
        <td key={i} className="border border-[var(--color-border)] px-3 py-2">
          <ShimmerLine width={w} />
        </td>
      ))}
    </tr>
  );
}

const TABLE_ROW_PATTERNS: [string, string, string][] = [
  ["70%", "40%", "90%"],
  ["55%", "50%", "80%"],
  ["80%", "35%", "70%"],
  ["60%", "45%", "85%"],
  ["75%", "40%", "75%"],
];

const SCAN_CATEGORIES = [
  "Geography",
  "Household and Financial Context",
  "Time, Routine and Domestic Capacity",
  "Emotional and Cognitive Bandwidth",
  "Diet, Food and Health Needs",
  "Ethnicity and Cultural Food Practices",
];

const SCAN_ROWS_PER_CATEGORY = [9, 5, 4, 3, 4, 5];

function ScanSkeleton() {
  return (
    <>
      <ShimmerLine width="75%" height="h-5" />
      <div className="mb-6 mt-2">
        <ShimmerLine width="50%" />
      </div>

      {SCAN_CATEGORIES.map((category, catIdx) => (
        <div key={category} className="mb-6">
          <h3 className="text-[var(--color-text)]">{category}</h3>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left font-semibold">
                  Characteristic
                </th>
                <th className="border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left font-semibold">
                  Relevance
                </th>
                <th className="border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left font-semibold">
                  Reasoning
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: SCAN_ROWS_PER_CATEGORY[catIdx] }, (_, i) => (
                <SkeletonRow
                  key={i}
                  widths={TABLE_ROW_PATTERNS[i % TABLE_ROW_PATTERNS.length]}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

const BULLET_WIDTHS_A = ["95%", "85%", "90%"];
const BULLET_WIDTHS_B = ["80%", "90%", "75%", "85%"];
const BULLET_WIDTHS_C = ["90%", "80%", "85%"];

function SubgroupSkeleton() {
  return (
    <>
      <SectionBlock heading="Who is impacted" bullets={BULLET_WIDTHS_A} />
      <SectionBlock heading="How they are impacted" bullets={BULLET_WIDTHS_B} />
      <SectionBlock heading="Benefits and harms" bullets={BULLET_WIDTHS_B} />
      <SectionBlock
        heading="Impact dimensions"
        bullets={["90%", "85%", "80%", "90%", "75%"]}
      />
      <SectionBlock heading="Uncertainties" bullets={BULLET_WIDTHS_C} />
    </>
  );
}

function EquityAssessmentSkeleton() {
  return (
    <>
      <SectionBlock heading="Who benefits most and why" bullets={["95%", "90%", "85%"]} />
      <SectionBlock heading="Who benefits least or is harmed and why" bullets={["90%", "85%", "95%"]} />
      <SectionBlock heading="Inequality impact direction" bullets={["80%", "90%", "75%"]} />
      <SectionBlock heading="Unintended distributional effects" bullets={BULLET_WIDTHS_B} />
      <SectionBlock heading="Implementation burden differences" bullets={BULLET_WIDTHS_C} />
    </>
  );
}

function RisksProvocationsSkeleton() {
  return (
    <>
      <SectionBlock heading="Evidence gaps" bullets={["90%", "85%", "80%"]} />
      <SectionBlock heading="Assumption risks" bullets={["85%", "90%"]} />
      <SectionBlock heading="Equity tensions" bullets={["90%", "80%", "85%"]} />
      <SectionBlock heading="Unintended consequences" bullets={["80%", "90%"]} />
      <SectionBlock heading="Implementation risks" bullets={["85%", "90%", "80%"]} />
    </>
  );
}

function DesignImprovementsSkeleton() {
  return (
    <>
      <div className="mb-6">
        <ShimmerLine width="60%" height="h-4" />
        <div className="mt-3">
          <ShimmerBullet width="95%" />
          <ShimmerBullet width="90%" />
          <ShimmerBullet width="85%" />
        </div>
      </div>
      <div className="mb-6">
        <ShimmerLine width="55%" height="h-4" />
        <div className="mt-3">
          <ShimmerBullet width="90%" />
          <ShimmerBullet width="85%" />
          <ShimmerBullet width="90%" />
        </div>
      </div>
      <div className="mb-6">
        <ShimmerLine width="50%" height="h-4" />
        <div className="mt-3">
          <ShimmerBullet width="85%" />
          <ShimmerBullet width="90%" />
        </div>
      </div>
    </>
  );
}

const SKELETON_MAP: Record<SkeletonType, () => React.JSX.Element> = {
  scan: ScanSkeleton,
  subgroup: SubgroupSkeleton,
  equity_assessment: EquityAssessmentSkeleton,
  risks_provocations: RisksProvocationsSkeleton,
  design_improvements: DesignImprovementsSkeleton,
};

export function ArtifactSkeleton({ type }: ArtifactSkeletonProps) {
  const Inner = SKELETON_MAP[type];
  return (
    <div className="prose mx-auto max-w-3xl scan-skeleton-fade-in">
      <Inner />
    </div>
  );
}
