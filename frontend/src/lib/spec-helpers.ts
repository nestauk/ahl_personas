import type { PolicySpecification, SpecMetadata, TAXONOMY } from "./types";

/**
 * Build a human-readable markdown specification table from the spec state.
 * Used when the analyst clicks "Proceed to analysis" to generate the
 * confirmation message inserted into chat.
 */
export function buildSpecMarkdown(
  spec: PolicySpecification,
  policyName: string | null | undefined,
  taxonomy: typeof TAXONOMY,
): string {
  const title = policyName || "Untitled Policy";
  const rows: string[] = [];
  const assumptions: string[] = [];
  const unspecified: string[] = [];

  for (const [key, meta] of Object.entries(taxonomy)) {
    const entry = spec[key as keyof PolicySpecification];
    const label = meta.label;

    let valueStr: string;
    let sourceStr: string;

    switch (entry.source) {
      case "analyst":
        valueStr = entry.values.join("; ") || "—";
        sourceStr = "Analyst";
        break;
      case "assumed":
        valueStr = entry.values.join("; ") || "—";
        sourceStr = "Assumption";
        if (entry.rationale) {
          assumptions.push(`- ${label}: ${valueStr} — ${entry.rationale}`);
        }
        break;
      case "unspecified":
        valueStr = "Not specified";
        sourceStr = "Unspecified";
        unspecified.push(`- ${label}`);
        break;
      case "not_applicable":
        valueStr = "N/A";
        sourceStr = "N/A";
        break;
      default:
        valueStr = "—";
        sourceStr = "Not discussed";
        unspecified.push(`- ${label}: not yet discussed`);
    }

    rows.push(`| ${label} | ${valueStr} | ${sourceStr} |`);
  }

  let md = `## Policy Specification: ${title}\n\n`;
  md += "| Characteristic | Value | Source |\n";
  md += "|---|---|---|\n";
  md += rows.join("\n") + "\n";

  if (assumptions.length > 0) {
    md += `\n**Assumptions made:**\n${assumptions.join("\n")}\n`;
  }

  if (unspecified.length > 0) {
    md += `\n**Unspecified / open questions:**\n${unspecified.join("\n")}\n`;
  }

  return md;
}

/**
 * Build the <policy_spec> JSON block in the same format the LLM produces.
 * Appended to the "Proceed to analysis" message so Phase 3 can parse it
 * consistently from conversation history.
 */
export function buildSpecBlock(specMeta: SpecMetadata): string {
  return `\n<policy_spec>\n${JSON.stringify(specMeta, null, 2)}\n</policy_spec>`;
}

/**
 * Count how many characteristics have a non-empty source.
 */
export function filledCount(spec: PolicySpecification): number {
  return Object.values(spec).filter(
    (v) => v.source !== "empty",
  ).length;
}

/**
 * Count characteristics that still need resolution (excludes N/A and filled).
 */
export function remainingCount(spec: PolicySpecification): number {
  return Object.values(spec).filter((v) => v.source === "empty").length;
}
