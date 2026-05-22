import type { SpecMetadata } from "./types";

/**
 * Build the <policy_spec> JSON block in the same format the LLM produces.
 * Appended to the "Proceed to analysis" message so the analysis stage can
 * parse it consistently from conversation history.
 */
export function buildSpecBlock(specMeta: SpecMetadata): string {
  return `\n<policy_spec>\n${JSON.stringify(specMeta, null, 2)}\n</policy_spec>`;
}
