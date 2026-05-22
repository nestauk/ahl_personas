export interface PolicySummarySpec {
  policy_name: string | null;
  policy_summary: string | null;
  taxonomy_mapping: Record<string, string[]>;
  open_questions: string[];
  ready_for_analysis: boolean;
}

export interface SpecMetadata {
  spec: PolicySummarySpec;
}

export type ConversationStage = "specifying" | "analysing" | "chatting";

// --- Sub-group types ---

export interface SubGroupModifier {
  category: string;
  value: string;
}

export interface SubGroup {
  id: string;
  name: string;
  modifiers: SubGroupModifier[];
  rationale: string;
  relevance_drivers: string[];
}

export interface ProposedSubGroups {
  subgroups: SubGroup[];
  relevance_scan: Record<string, string>;
}

// --- Analysis progress types ---

export type AnalysisStepStatus = "pending" | "active" | "complete" | "error";

export interface AnalysisStep {
  step: "scan" | "subgroup" | "synthesis";
  index?: number;
  name?: string;
  status: AnalysisStepStatus;
}

export interface AnalysisProgress {
  steps: AnalysisStep[];
  isComplete: boolean;
}

// --- Data stream event types ---

export interface AnalysisStepEvent {
  type: "analysis_step";
  step: "scan" | "subgroup" | "synthesis";
  index?: number;
  name?: string;
  status: "active" | "complete" | "error";
}

export interface EvidenceSearchEvent {
  type: "evidence_search";
  query: string;
}

export interface StageTransitionEvent {
  type: "stage_transition";
  stage: ConversationStage;
}

export interface ProposedSubGroupsEvent extends ProposedSubGroups {
  type: "proposed_sub_groups";
}

export interface AnalysisContentEvent {
  type: "analysis_content";
  section: string;
  delta: string;
}

export interface AnalysisSection {
  id: string;
  name: string;
  content: string;
}

export type AnalysisDataEvent =
  | AnalysisStepEvent
  | EvidenceSearchEvent
  | StageTransitionEvent
  | ProposedSubGroupsEvent
  | AnalysisContentEvent;

// --- Taxonomy labels (for sidebar pill display) ---

export const TAXONOMY_LABELS: Record<string, string> = {
  policy_lever: "Policy lever",
  in_scope_businesses: "In-scope businesses",
  business_size: "Business size",
  delivery_channel: "Delivery channel",
  population: "Population",
  geography: "Geography",
};

export const EMPTY_SUMMARY_SPEC: PolicySummarySpec = {
  policy_name: null,
  policy_summary: null,
  taxonomy_mapping: {},
  open_questions: [],
  ready_for_analysis: false,
};

export function createEmptySpecMetadata(): SpecMetadata {
  return {
    spec: { ...EMPTY_SUMMARY_SPEC },
  };
}

export function createEmptyAnalysisProgress(): AnalysisProgress {
  return { steps: [], isComplete: false };
}
