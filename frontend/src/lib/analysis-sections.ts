import type {
  AnalysisSection,
  AnalysisStepStatus,
  EvidenceSearchRecord,
  SubGroup,
} from "@/lib/types";

export const SYNTHESIS_SECTION_IDS = [
  "equity_assessment",
  "risks_provocations",
  "design_improvements",
] as const;

export type SynthesisSectionId = (typeof SYNTHESIS_SECTION_IDS)[number];

export const SYNTHESIS_SECTION_LABELS: Record<SynthesisSectionId, string> = {
  equity_assessment: "Equity Assessment",
  risks_provocations: "Risks & Provocations",
  design_improvements: "Design Improvements",
};

export const FIXED_SECTION_SUBTITLES: Record<string, string> = {
  policy_summary:
    "Summary of the policy being analysed — updates as the conversation progresses.",
  scan:
    "Assessment of which population groups are most relevant to this policy — grouped by category and rated by relevance.",
  equity_assessment:
    "Who benefits most and least from this policy — inequality impact direction and distributional effects.",
  risks_provocations:
    "Evidence gaps, assumption risks, equity tensions, and unintended consequences that warrant attention.",
  design_improvements:
    "Actionable recommendations for making this policy more equitable across population groups.",
};

const STOP_WORDS = new Set([
  "about", "after", "also", "among", "and", "are", "been", "being", "between",
  "both", "but", "can", "could", "did", "does", "doing", "done", "for", "from",
  "had", "has", "have", "having", "how", "into", "its", "like", "more", "most",
  "not", "other", "our", "out", "over", "same", "some", "such", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "under", "until", "very", "was", "were", "what", "when", "where",
  "which", "while", "who", "whom", "why", "will", "with", "within", "would",
]);

const SG_TOKEN_REGEX = /\bSG(\d+)\b/gi;
const SG_LEADING_PREFIX_REGEX = /^\s*SG\d+\s*:?\s*/i;

function normaliseName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significantWords(text: string): string[] {
  return normaliseName(text)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/** 1-indexed display label for a confirmed sub-group position (e.g. SG1, SG2). */
export function sgDisplayLabel(index: number): string {
  return `SG${index + 1}`;
}

export interface ResolvedSubgroupRef {
  sectionId: string;
  index: number;
  fullName: string;
  shortLabel: string;
}

export interface SubgroupRefIndex {
  refs: ResolvedSubgroupRef[];
  bySgLabel: Map<string, ResolvedSubgroupRef>;
  bySectionId: Map<string, ResolvedSubgroupRef>;
}

export function buildSubgroupRefIndex(
  confirmedSubGroups: SubGroup[],
): SubgroupRefIndex {
  const refs: ResolvedSubgroupRef[] = confirmedSubGroups.map((sg, index) => ({
    sectionId: `sg_${index}`,
    index,
    fullName: sg.name,
    shortLabel: sgDisplayLabel(index),
  }));

  const bySgLabel = new Map(
    refs.map((ref) => [ref.shortLabel.toUpperCase(), ref]),
  );
  const bySectionId = new Map(refs.map((ref) => [ref.sectionId, ref]));

  return { refs, bySgLabel, bySectionId };
}

/** Strips (categorical) markers and normalises "+" separators for display. */
export function compactSubgroupName(fullName: string): string {
  return fullName
    .replace(/\s*\(categorical\)\s*/gi, " ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSynthesisSection(id: string): id is SynthesisSectionId {
  return (SYNTHESIS_SECTION_IDS as readonly string[]).includes(id);
}

export function getSectionSubtitle(
  sectionId: string,
  policyName?: string | null,
  subgroupName?: string | null,
): string | null {
  if (sectionId.startsWith("sg_") && policyName && subgroupName) {
    return `How ${policyName} would be experienced by ${subgroupName}.`;
  }
  return FIXED_SECTION_SUBTITLES[sectionId] ?? null;
}

export function resolveSubgroupSectionId(
  name: string,
  confirmedSubGroups: SubGroup[],
): string | null {
  const trimmed = name.trim();
  if (!trimmed || confirmedSubGroups.length === 0) return null;

  const sgMatch = trimmed.match(/^SG(\d+)\b/i);
  if (sgMatch) {
    const idx = parseInt(sgMatch[1], 10) - 1;
    if (idx >= 0 && idx < confirmedSubGroups.length) return `sg_${idx}`;
  }

  const exactIdx = confirmedSubGroups.findIndex((sg) => sg.name === trimmed);
  if (exactIdx >= 0) return `sg_${exactIdx}`;

  const labelWords = significantWords(trimmed);
  if (labelWords.length === 0) return null;

  let bestIdx = -1;
  let bestScore = 0;

  confirmedSubGroups.forEach((sg, index) => {
    const candidateWords = new Set(significantWords(sg.name));
    const matched = labelWords.filter((w) => candidateWords.has(w)).length;
    const required = Math.max(2, Math.ceil(labelWords.length * 0.5));
    if (matched >= required && matched > bestScore) {
      bestScore = matched;
      bestIdx = index;
    }
  });

  return bestIdx >= 0 ? `sg_${bestIdx}` : null;
}

export function findSgRefsInText(
  text: string,
  confirmedSubGroups: SubGroup[],
): ResolvedSubgroupRef[] {
  if (!text || confirmedSubGroups.length === 0) return [];

  const index = buildSubgroupRefIndex(confirmedSubGroups);
  const seen = new Set<number>();
  const refs: ResolvedSubgroupRef[] = [];

  for (const match of text.matchAll(SG_TOKEN_REGEX)) {
    const num = parseInt(match[1], 10);
    const ref = index.bySgLabel.get(`SG${num}`.toUpperCase());
    if (!ref || seen.has(ref.index)) continue;
    seen.add(ref.index);
    refs.push(ref);
  }

  return refs;
}

/**
 * Resolves sub-groups referenced in synthesis text: SG tokens first, then full
 * name substring matches (longest names first).
 */
export function findSubgroupsReferencedInText(
  text: string,
  confirmedSubGroups: SubGroup[],
): ResolvedSubgroupRef[] {
  const sgRefs = findSgRefsInText(text, confirmedSubGroups);
  if (sgRefs.length > 0) return sgRefs;

  const index = buildSubgroupRefIndex(confirmedSubGroups);
  const refs: ResolvedSubgroupRef[] = [];
  const seen = new Set<number>();

  for (const ref of [...index.refs].sort(
    (a, b) => b.fullName.length - a.fullName.length,
  )) {
    if (text.includes(ref.fullName) && !seen.has(ref.index)) {
      seen.add(ref.index);
      refs.push(ref);
    }
  }

  return refs;
}

/**
 * Removes matched sub-group names, SG tokens, and list boilerplate so popovers
 * can foreground the analytical narrative.
 */
export function extractSynthesisNarrative(
  detail: string,
  referenced: ResolvedSubgroupRef[],
): string {
  let narrative = detail;

  for (const { fullName, shortLabel } of referenced) {
    narrative = narrative.split(fullName).join("");
    narrative = narrative.replace(
      new RegExp(`\\b${shortLabel}\\b`, "gi"),
      "",
    );
  }

  narrative = narrative
    .replace(/\bSG\d+\s*(?:[,·;]\s*|\s+and\s+)*/gi, "")
    .replace(/^All of:\s*/i, "")
    .replace(/\b\d+\s+of\s+\d+\s+sub-groups?\b/gi, "")
    .replace(/\bflagged\s+/i, "")
    .replace(/;\s*;/g, ";")
    .replace(/\s*[;]\s*/g, " ")
    .replace(/\s*\.\s*\./g, ".")
    .replace(/^\s*[;.,:\s]+/, "")
    .replace(/\s*[;.,:\s]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!narrative || narrative.length < 12) {
    return detail.trim();
  }
  return narrative;
}

export interface SynthesisPopoverModel {
  narrative: string;
  referencedSubgroups: ResolvedSubgroupRef[];
  primarySubgroup?: ResolvedSubgroupRef;
}

export function buildSynthesisPopoverModel(
  badgeType: string,
  detail: string,
  sourceLabel: string,
  confirmedSubGroups: SubGroup[],
): SynthesisPopoverModel {
  const haystack = `${sourceLabel} ${detail}`;

  if (badgeType === "sg" || badgeType === "subgroup") {
    let referenced = findSgRefsInText(haystack, confirmedSubGroups);

    if (referenced.length === 0) {
      const sectionId = resolveSubgroupSectionId(sourceLabel, confirmedSubGroups);
      if (sectionId) {
        const index = buildSubgroupRefIndex(confirmedSubGroups);
        const ref = index.bySectionId.get(sectionId);
        if (ref) referenced = [ref];
      }
    }

    const primary = referenced[0];
    let narrative = detail.trim().replace(SG_LEADING_PREFIX_REGEX, "").trim();

    if (primary) {
      const compact = compactSubgroupName(primary.fullName);
      const compactPrefix = `${primary.shortLabel}: ${compact}`;
      if (narrative.toLowerCase().startsWith(compactPrefix.toLowerCase())) {
        narrative = narrative.slice(compactPrefix.length).trim();
      }
      narrative = narrative.replace(SG_LEADING_PREFIX_REGEX, "").trim();
    }

    return {
      narrative: narrative || detail.trim(),
      referencedSubgroups: primary ? [primary] : referenced,
      primarySubgroup: primary,
    };
  }

  const referenced = findSubgroupsReferencedInText(haystack, confirmedSubGroups);
  return {
    narrative: extractSynthesisNarrative(detail, referenced),
    referencedSubgroups: referenced,
  };
}

/** Truncates inline sub-group badge pill text; full name stays in data-badge-ref. */
export function truncateSubgroupBadgeLabel(
  fullName: string,
  maxLen = 42,
): string {
  const trimmed = fullName.trim();
  const sgMatch = trimmed.match(/^SG(\d+)(?::\s*(.+))?$/i);

  if (sgMatch) {
    const label = sgMatch[2]
      ? `SG${sgMatch[1]}: ${sgMatch[2]}`
      : `SG${sgMatch[1]}`;
    if (label.length <= maxLen) return label;
    return `${label.slice(0, maxLen - 1).trimEnd()}…`;
  }

  const compact = compactSubgroupName(trimmed);
  const prefix = "Sub-group: ";
  if (compact.length <= maxLen) return `${prefix}${compact}`;
  return `${prefix}${compact.slice(0, maxLen - prefix.length - 1).trimEnd()}…`;
}

export function extractSubgroupNamesFromText(
  text: string,
  confirmedSubGroups?: SubGroup[],
): string[] {
  if (confirmedSubGroups?.length) {
    return findSubgroupsReferencedInText(text, confirmedSubGroups).map(
      (r) => r.fullName,
    );
  }

  const names: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string) => {
    const cleaned = raw.trim().replace(/\.$/, "");
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    names.push(cleaned);
  };

  for (const part of text.split(/;/)) {
    const trimmed = part.trim();
    if (trimmed.length > 12) add(trimmed);
  }

  return names;
}

export function deriveSynthesisSubstepStatus(
  synthesisStatus: AnalysisStepStatus | undefined,
  streamingSection: string | null,
  sections: Map<string, AnalysisSection>,
): Record<SynthesisSectionId, AnalysisStepStatus> {
  const result = Object.fromEntries(
    SYNTHESIS_SECTION_IDS.map((id) => [id, "pending" as AnalysisStepStatus]),
  ) as Record<SynthesisSectionId, AnalysisStepStatus>;

  if (!synthesisStatus || synthesisStatus === "pending") {
    return result;
  }

  if (synthesisStatus === "error") {
    for (const id of SYNTHESIS_SECTION_IDS) {
      const content = sections.get(id)?.content?.trim();
      result[id] = content ? "error" : "pending";
    }
    return result;
  }

  if (synthesisStatus === "complete") {
    for (const id of SYNTHESIS_SECTION_IDS) {
      result[id] = sections.get(id)?.content?.trim() ? "complete" : "complete";
    }
    return result;
  }

  const order = [...SYNTHESIS_SECTION_IDS];
  const streamIdx = streamingSection
    ? order.indexOf(streamingSection as SynthesisSectionId)
    : -1;

  order.forEach((id, idx) => {
    const hasContent = Boolean(sections.get(id)?.content?.trim());
    if (streamIdx >= 0) {
      if (idx < streamIdx) result[id] = "complete";
      else if (idx === streamIdx) result[id] = "active";
      else if (hasContent) result[id] = "complete";
      else result[id] = "pending";
    } else if (hasContent) {
      result[id] = "complete";
    } else {
      result[id] = idx === 0 ? "active" : "pending";
    }
  });

  return result;
}

export const EMPTY_SYNTHESIS_SECTION_NOTE =
  "This section was not generated separately — see Equity Assessment.";

export type ActiveStepPhase = "searching" | "writing" | null;

export const SYNTHESIS_ACTIVE_STATUS: Record<SynthesisSectionId, string> = {
  equity_assessment: "Writing equity assessment...",
  risks_provocations: "Identifying risks and provocations...",
  design_improvements: "Generating design improvements...",
};

const STEP_SUMMARY_REGEX = /<step_summary>[\s\S]*?<\/step_summary>/gi;
const SUMMARY_CARD_REGEX = /<summary_card[^>]*>[\s\S]*?<\/summary_card>/gi;
const SECTION_MARKER_REGEX = /<!--\s*SECTION:\s*[^>]+-->\s*/gi;

/** Ensure markdown headings start on their own block (e.g. after inline badge spans). */
export function normalizeMarkdownBlockBreaks(content: string): string {
  return content
    .replace(/(<\/span>)(\s*)(#{1,6}\s)/g, "$1\n\n$3")
    .replace(/([^\n#])(#{1,6}\s)/g, "$1\n\n$2");
}

/** Remove sidebar-only and summary-card blocks from analysis panel content. */
export function stripArtifactTailBlocks(text: string): string {
  return text
    .replace(SECTION_MARKER_REGEX, "")
    .replace(STEP_SUMMARY_REGEX, "")
    .replace(SUMMARY_CARD_REGEX, "")
    .trimEnd();
}

/** @deprecated Use stripArtifactTailBlocks */
export function stripStepSummaryFromContent(text: string): string {
  return stripArtifactTailBlocks(text);
}

/** Build section-id → SG label map (e.g. sg_0 → SG1). */
export function buildSgLabels(subgroupCount: number): Map<string, string> {
  const labels = new Map<string, string>();
  for (let i = 0; i < subgroupCount; i++) {
    labels.set(`sg_${i}`, `SG${i + 1}`);
  }
  return labels;
}

/** Count distinct evidence sources across completed searches for a step. */
export function countUniqueEvidenceSources(
  searches: EvidenceSearchRecord[] | undefined,
): number {
  const names = new Set<string>();
  for (const search of searches ?? []) {
    for (const name of search.sourceNames ?? []) {
      if (name.trim()) names.add(name);
    }
  }
  return names.size;
}

/** Status line while the active sub-group step is searching the evidence base. */
export function formatSubgroupSearchingStatus(
  completedSearches: number,
  inFlight: boolean,
): string {
  const count = completedSearches + (inFlight ? 1 : 0);
  if (count === 0) return "Searching evidence base...";
  return `Searching evidence base... (${count})`;
}

/** Status line while the active sub-group step is writing analysis text. */
export function formatSubgroupWritingStatus(sourceCount: number): string {
  const label = sourceCount === 1 ? "source" : "sources";
  return `Generating analysis from ${sourceCount} ${label}...`;
}
