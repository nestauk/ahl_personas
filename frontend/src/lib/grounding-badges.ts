const EVIDENCE_TAG_REGEX = /\[Evidence:\s*([^\]]+)\]/g;
const ANALOGICAL_TAG_REGEX = /\[Analogical:\s*([^\]]+)\]/g;
const REASONING_TAG_REGEX = /\[Reasoning\]/g;
const GAP_TAG_REGEX = /\[Gap\]/g;

export function renderGroundingBadges(content: string): string {
  return content
    .replace(
      EVIDENCE_TAG_REGEX,
      '<span class="badge-evidence">Evidence: $1</span>',
    )
    .replace(
      ANALOGICAL_TAG_REGEX,
      '<span class="badge-analogical">Analogical: $1</span>',
    )
    .replace(
      REASONING_TAG_REGEX,
      '<span class="badge-reasoning">Reasoning</span>',
    )
    .replace(GAP_TAG_REGEX, '<span class="badge-gap">Gap</span>');
}
