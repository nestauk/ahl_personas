import type { PolicySummarySpec, SpecMetadata } from "./types";
import { TAXONOMY_LABELS } from "./types";

/**
 * Build a human-readable markdown summary from the spec state.
 * Used when the analyst clicks "Proceed to analysis" to generate the
 * confirmation message inserted into chat.
 */
export function buildSpecMarkdown(spec: PolicySummarySpec): string {
  const title = spec.policy_name || "Untitled Policy";
  let md = `## Policy Specification: ${title}\n\n`;

  if (spec.policy_summary) {
    md += `${spec.policy_summary}\n`;
  }

  const entries = Object.entries(spec.taxonomy_mapping);
  if (entries.length > 0) {
    md += "\n**Taxonomy dimensions:**\n";
    for (const [key, values] of entries) {
      const label = TAXONOMY_LABELS[key] || key.replace(/_/g, " ");
      md += `- ${label}: ${values.join(", ")}\n`;
    }
  }

  if (spec.open_questions.length > 0) {
    md += "\n**For the analysis to consider:**\n";
    for (const q of spec.open_questions) {
      md += `- ${q}\n`;
    }
  }

  return md;
}

/**
 * Build the <policy_spec> JSON block in the same format the LLM produces.
 * Appended to the "Proceed to analysis" message so the analysis stage can
 * parse it consistently from conversation history.
 */
export function buildSpecBlock(specMeta: SpecMetadata): string {
  return `\n<policy_spec>\n${JSON.stringify(specMeta, null, 2)}\n</policy_spec>`;
}
