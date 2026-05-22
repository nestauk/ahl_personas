const STOP_WORDS = new Set([
  "about", "after", "also", "among", "and", "are", "been", "being", "between",
  "both", "but", "can", "could", "did", "does", "doing", "done", "for", "from",
  "had", "has", "have", "having", "how", "into", "its", "like", "more", "most",
  "not", "other", "our", "out", "over", "same", "some", "such", "than", "that",
  "the", "their", "them", "then", "there", "these", "they", "this", "those",
  "through", "under", "until", "very", "was", "were", "what", "when", "where",
  "which", "while", "who", "whom", "why", "will", "with", "within", "would",
]);

export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\d{4}\s*[–-]\s*\d{4}/g, "")
    .replace(/\b\d{4}\b/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function significantWords(title: string): string[] {
  return normaliseTitle(title)
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

/**
 * Fuzzy-match a badge source label against a canonical source name.
 * Uses normalised substring containment first, then falls back to
 * significant-word overlap (at least 50% of the label's words, minimum 3).
 */
export function sourcesMatch(badgeLabel: string, sourceName: string): boolean {
  const normLabel = normaliseTitle(badgeLabel);
  const normSource = normaliseTitle(sourceName);

  if (!normLabel || !normSource) return false;

  if (normLabel.includes(normSource) || normSource.includes(normLabel)) {
    return true;
  }

  const labelWords = significantWords(badgeLabel);
  if (labelWords.length === 0) return false;

  const sourceWordSet = new Set(significantWords(sourceName));
  const matchedCount = labelWords.filter((word) => sourceWordSet.has(word)).length;
  const requiredMatches = Math.max(3, Math.ceil(labelWords.length * 0.5));

  return matchedCount >= requiredMatches;
}
