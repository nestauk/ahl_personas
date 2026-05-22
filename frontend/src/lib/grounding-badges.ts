const BADGE_DETAIL_REGEX =
  /\[(?:(Evidence|Analogical):\s*([^\]]+)|(Reasoning|Gap))\]<badge_detail>([\s\S]*?)<\/badge_detail>/g;

const EVIDENCE_TAG_REGEX = /\[Evidence:\s*([^\]]+)\]/g;
const ANALOGICAL_TAG_REGEX = /\[Analogical:\s*([^\]]+)\]/g;
const REASONING_TAG_REGEX = /\[Reasoning\]/g;
const GAP_TAG_REGEX = /\[Gap\]/g;
const HIGH_TAG_REGEX = /\[(?:HIGH|High)\]/g;
const MODERATE_TAG_REGEX = /\[(?:MODERATE|Moderate)\]/g;
const LOW_TAG_REGEX = /\[(?:LOW|Low)\]/g;

export const COMPLETE_SUBGROUPS_REGEX =
  /\s*<proposed_sub_groups>[\s\S]*?<\/proposed_sub_groups>\s*/g;

const STRUCTURED_OUTPUT_TAIL_REGEX =
  /\n(?:#{2,3}\s*Part \d+\s*[—–-]\s*Structured output[^\n]*|#{2,3}\s*Structured output requirement)[\s\S]*$/i;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Removes the machine-readable sub-groups block and the Part 3 structured
 * output section that precedes it (parsed separately for the sidebar).
 */
export function stripProposedSubGroupsContent(content: string): string {
  return content
    .replace(COMPLETE_SUBGROUPS_REGEX, "")
    .replace(STRUCTURED_OUTPUT_TAIL_REGEX, "")
    .trimEnd();
}

/**
 * Strips trailing incomplete structured blocks during streaming.
 * Only removes an unclosed `<badge_detail>` — complete blocks are kept.
 */
export function stripIncompleteStructuredBlocks(content: string): string {
  let stripped = content.replace(
    /\s*<(?:proposed_sub_groups|policy_spec)>[\s\S]*$/,
    "",
  );

  stripped = stripped.replace(STRUCTURED_OUTPUT_TAIL_REGEX, "");

  const lastOpen = stripped.lastIndexOf("<badge_detail>");
  if (lastOpen !== -1) {
    const lastClose = stripped.lastIndexOf("</badge_detail>");
    if (lastClose < lastOpen) {
      stripped = stripped.slice(0, lastOpen);
    }
  }

  return stripped;
}

export function renderGroundingBadges(content: string): string {
  let result = content.replace(
    BADGE_DETAIL_REGEX,
    (_match, evidenceType, sourceRef, simpleType, detail) => {
      const trimmedDetail = detail.trim();
      const encoded = escapeAttr(trimmedDetail);

      if (evidenceType) {
        const badgeClass =
          evidenceType === "Evidence" ? "badge-evidence" : "badge-analogical";
        const label = `${evidenceType}: ${sourceRef}`;
        return `<span class="${badgeClass}" data-badge-detail="${encoded}" data-badge-type="${evidenceType.toLowerCase()}">${label}</span>`;
      }
      const type = simpleType.toLowerCase();
      const badgeClass = type === "reasoning" ? "badge-reasoning" : "badge-gap";
      return `<span class="${badgeClass}" data-badge-detail="${encoded}" data-badge-type="${type}">${simpleType}</span>`;
    },
  );

  result = result
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

  return result;
}
