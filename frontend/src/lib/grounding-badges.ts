const BADGE_DETAIL_REGEX =
  /\[(?:(Evidence|Analogical|Sub-group|Cross-cutting):\s*([^\]]+)|(SG\d+)(?::\s*([^\]]*))?|(Reasoning|Gap))\]<badge_detail>([\s\S]*?)<\/badge_detail>/g;

const EVIDENCE_TAG_REGEX = /\[Evidence:\s*([^\]]+)\]/g;
const ANALOGICAL_TAG_REGEX = /\[Analogical:\s*([^\]]+)\]/g;
const SUBGROUP_TAG_REGEX = /\[Sub-group:\s*([^\]]+)\]/g;
const SG_TAG_REGEX = /\[(SG\d+)(?::\s*([^\]]*))?\]/g;
const CROSSCUTTING_TAG_REGEX = /\[Cross-cutting:\s*([^\]]+)\]/g;
const REASONING_TAG_REGEX = /\[Reasoning\]/g;
const GAP_TAG_REGEX = /\[Gap\]/g;
const HIGH_TAG_REGEX = /\[(?:HIGH|High)\]/g;
const MODERATE_TAG_REGEX = /\[(?:MODERATE|Moderate)\]/g;
const LOW_TAG_REGEX = /\[(?:LOW|Low)\]/g;

export const COMPLETE_SUBGROUPS_REGEX =
  /\s*<proposed_sub_groups>[\s\S]*?<\/proposed_sub_groups>\s*/g;

const STRUCTURED_OUTPUT_TAIL_REGEX =
  /\n(?:#{2,3}\s*Part \d+\s*[—–-]\s*Structured output[^\n]*|#{2,3}\s*Structured output requirement)[\s\S]*$/i;

const PARTIAL_SECTION_MARKER_REGEX = /\s*<!--\s*SECTION:[\s\S]*$/;

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderSgPill(sgToken: string, hint: string | undefined, detail?: string): string {
  const normalised = sgToken.toUpperCase();
  const inlineLabel =
    hint && hint.trim().length > 0 && hint.trim().length <= 36
      ? `${normalised}: ${hint.trim()}`
      : normalised;
  const attrs = [
    'class="badge-evidence"',
    detail ? `data-badge-detail="${escapeAttr(detail.trim())}"` : "",
    'data-badge-type="sg"',
    `data-badge-ref="${escapeAttr(normalised)}"`,
    `title="${escapeAttr(normalised)}"`,
  ]
    .filter(Boolean)
    .join(" ");
  return `<span ${attrs}>${inlineLabel}</span>`;
}

export function stripProposedSubGroupsContent(content: string): string {
  return content
    .replace(COMPLETE_SUBGROUPS_REGEX, "")
    .replace(STRUCTURED_OUTPUT_TAIL_REGEX, "")
    .trimEnd();
}

export function stripIncompleteStructuredBlocks(content: string): string {
  let stripped = content.replace(
    /\s*<(?:proposed_sub_groups|policy_spec)>[\s\S]*$/,
    "",
  );

  stripped = stripped.replace(STRUCTURED_OUTPUT_TAIL_REGEX, "");
  stripped = stripped.replace(PARTIAL_SECTION_MARKER_REGEX, "");

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
    (
      _match,
      typedLabel,
      sourceRef,
      sgToken,
      sgHint,
      simpleType,
      detail,
    ) => {
      const trimmedDetail = (detail as string).trim();
      const encoded = escapeAttr(trimmedDetail);

      if (typedLabel === "Evidence" || typedLabel === "Analogical") {
        const badgeClass =
          typedLabel === "Evidence" ? "badge-evidence" : "badge-analogical";
        const label = `${typedLabel}: ${sourceRef}`;
        return `<span class="${badgeClass}" data-badge-detail="${encoded}" data-badge-type="${typedLabel.toLowerCase()}">${label}</span>`;
      }
      if (typedLabel === "Sub-group") {
        const ref = (sourceRef as string).trim();
        return `<span class="badge-evidence" data-badge-detail="${encoded}" data-badge-type="subgroup" data-badge-ref="${escapeAttr(ref)}" title="${escapeAttr(ref)}">Sub-group</span>`;
      }
      if (typedLabel === "Cross-cutting") {
        const label = `Cross-cutting: ${sourceRef}`;
        return `<span class="badge-crosscutting" data-badge-detail="${encoded}" data-badge-type="crosscutting">${label}</span>`;
      }
      if (sgToken) {
        return renderSgPill(sgToken as string, sgHint as string | undefined, trimmedDetail);
      }
      const type = (simpleType as string).toLowerCase();
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
    .replace(SUBGROUP_TAG_REGEX, () =>
      '<span class="badge-evidence" data-badge-type="subgroup">Sub-group</span>',
    )
    .replace(SG_TAG_REGEX, (_m, sgToken, hint) =>
      renderSgPill(sgToken, hint),
    )
    .replace(
      CROSSCUTTING_TAG_REGEX,
      '<span class="badge-crosscutting">Cross-cutting: $1</span>',
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
