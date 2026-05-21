const EVIDENCE_TAG_REGEX = /\[Evidence:\s*([^\]]+)\]/g;
const ANALOGICAL_TAG_REGEX = /\[Analogical:\s*([^\]]+)\]/g;
const REASONING_TAG_REGEX = /\[Reasoning\]/g;
const GAP_TAG_REGEX = /\[Gap\]/g;
const HIGH_TAG_REGEX = /\[(?:HIGH|High)\]/g;
const MODERATE_TAG_REGEX = /\[(?:MODERATE|Moderate)\]/g;
const LOW_TAG_REGEX = /\[(?:LOW|Low)\]/g;

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
    .replace(GAP_TAG_REGEX, '<span class="badge-gap">Gap</span>')
    .replace(HIGH_TAG_REGEX, '<span class="badge-high">High</span>')
    .replace(
      MODERATE_TAG_REGEX,
      '<span class="badge-moderate">Moderate</span>',
    )
    .replace(LOW_TAG_REGEX, '<span class="badge-low">Low</span>');
}
