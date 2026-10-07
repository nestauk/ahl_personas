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

function SubgroupSkeleton() {
  return (
    <>
      <SectionBlock heading="Who is impacted" bullets={["95%", "85%"]} />
      <SectionBlock heading="Benefits and harms" bullets={["80%", "90%", "75%", "85%"]} />
      <SectionBlock heading="Uncertainties" bullets={["90%", "80%"]} />
    </>
  );
}

// Synthesis headings vary (design improvements follow the analyst's outcomes),
// so synthesis sections share a heading-free shimmer.
function GenericSkeleton() {
  return (
    <>
      {[["60%", "95%", "90%", "85%"], ["55%", "90%", "85%", "90%"], ["50%", "85%", "90%"]].map(
        ([title, ...bullets], i) => (
          <div key={i} className="mb-6">
            <ShimmerLine width={title} height="h-4" />
            <div className="mt-3">
              {bullets.map((w, j) => (
                <ShimmerBullet key={j} width={w} />
              ))}
            </div>
          </div>
        ),
      )}
    </>
  );
}

const SKELETON_MAP: Record<SkeletonType, () => React.JSX.Element> = {
  scan: ScanSkeleton,
  subgroup: SubgroupSkeleton,
  equity_assessment: GenericSkeleton,
  risks_provocations: GenericSkeleton,
  design_improvements: GenericSkeleton,
};

export function ArtifactSkeleton({ type }: ArtifactSkeletonProps) {
  const Inner = SKELETON_MAP[type];
  return (
    <div className="prose mx-auto max-w-3xl scan-skeleton-fade-in">
      <Inner />
    </div>
  );
}
