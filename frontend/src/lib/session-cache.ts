import type { Message } from "ai";
import type {
  AnalysisProgress,
  AnalysisSection,
  ConversationStage,
  ProposedSubGroups,
  SpecMetadata,
  SubGroup,
} from "./types";

const STORAGE_KEY = "ahl-session";
const CACHE_VERSION = 1;

export interface CachedSession {
  version: number;
  stage: ConversationStage;
  messages: Message[];
  specMeta: SpecMetadata;
  proposedSubGroups: ProposedSubGroups | null;
  confirmedSubGroups: SubGroup[] | null;
  analysisProgress: AnalysisProgress;
  analysisSections: [string, AnalysisSection][];
  activeSection: string | null;
  evidenceSearchCount: number;
}

export function saveSession(state: Omit<CachedSession, "version" | "analysisSections"> & {
  analysisSections: Map<string, AnalysisSection>;
}): void {
  try {
    const serialisable: CachedSession = {
      ...state,
      version: CACHE_VERSION,
      analysisSections: Array.from(state.analysisSections.entries()),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialisable));
  } catch {
    // Storage quota exceeded or unavailable — silently degrade
  }
}

export function loadSession(): CachedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: CachedSession = JSON.parse(raw);

    if (parsed.version !== CACHE_VERSION) return null;
    if (!parsed.stage || !parsed.messages) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Reconstructs the analysisSections Map from the cached array representation.
 */
export function hydrateAnalysisSections(
  entries: [string, AnalysisSection][],
): Map<string, AnalysisSection> {
  return new Map(entries);
}

/**
 * Fixes up state that was cached mid-analysis. Since we cannot resume the
 * HTTP stream, we transition to chatting and mark incomplete steps as errors.
 * Returns the adjusted fields plus a flag indicating whether fixup occurred.
 */
export function fixInterruptedAnalysis(cached: CachedSession): {
  stage: ConversationStage;
  analysisProgress: AnalysisProgress;
  wasInterrupted: boolean;
} {
  if (cached.stage !== "analysing") {
    return {
      stage: cached.stage,
      analysisProgress: cached.analysisProgress,
      wasInterrupted: false,
    };
  }

  const hasAnySections = cached.analysisSections.length > 0;
  const hasAnySteps = cached.analysisProgress.steps.length > 0;

  if (!hasAnySections && !hasAnySteps) {
    return {
      stage: "analysing",
      analysisProgress: cached.analysisProgress,
      wasInterrupted: false,
    };
  }

  const fixedSteps = cached.analysisProgress.steps.map((step) => {
    if (step.status === "active" || step.status === "pending") {
      return { ...step, status: "error" as const };
    }
    return step;
  });

  return {
    stage: "chatting",
    analysisProgress: {
      steps: fixedSteps,
      isComplete: true,
    },
    wasInterrupted: true,
  };
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently degrade
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(
  state: Omit<CachedSession, "version" | "analysisSections"> & {
    analysisSections: Map<string, AnalysisSection>;
  },
  delayMs = 500,
): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveSession(state);
    debounceTimer = null;
  }, delayMs);
}
