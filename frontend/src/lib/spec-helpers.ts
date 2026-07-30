import type { SpecMetadata } from "./types";

/**
 * Build the <policy_spec> JSON block in the same format the LLM produces.
 * Appended to the "Proceed to analysis" message so the analysis stage can
 * parse it consistently from conversation history.
 */
export function buildSpecBlock(specMeta: SpecMetadata): string {
  return `\n<policy_spec>\n${JSON.stringify(specMeta, null, 2)}\n</policy_spec>`;
}

export const SUGGESTED_ANSWERS_REGEX =
  /<suggested_answers>\s*([\s\S]*?)\s*<\/suggested_answers>/;

/**
 * Parse the <suggested_answers> JSON array the Socratic prompt emits
 * alongside its clarifying question. Returns [] when absent or malformed.
 */
export function parseSuggestedAnswers(content: string): string[] {
  const match = content.match(SUGGESTED_ANSWERS_REGEX);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
      .slice(0, 4);
  } catch {
    return [];
  }
}
