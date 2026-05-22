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

export interface AffectedModifier {
  name: string;
  features: string;
}

export interface CategoryPattern {
  category: string;
  affected_modifiers: AffectedModifier[];
  shared_reasoning: string;
}

export interface SubGroup {
  id: string;
  name: string;
  categorical?: boolean;
  category_pattern?: CategoryPattern;
  modifiers: SubGroupModifier[];
  rationale: string;
  relevance_drivers: string[];
}

export interface ProposedSubGroups {
  subgroups: SubGroup[];
  relevance_scan: Record<string, string>;
}

// --- Evidence search record ---

export interface EvidenceSearchRecord {
  query: string;
  numResults: number;
  sourceNames: string[];
}

// --- Raw evidence for hallucination detection ---

export interface RawEvidenceChunk {
  source_name: string;
  source_year: string | null;
  text: string;
  page_number: number | null;
}

export interface RawEvidenceSearch {
  query: string;
  chunks: RawEvidenceChunk[];
}

export interface SubgroupEvidenceEvent {
  type: "subgroup_evidence";
  section_id: string;
  searches: RawEvidenceSearch[];
}

export interface StepSummaryEvent {
  type: "step_summary";
  section_id: string;
  summary: string;
}

export interface SummaryCard {
  impact_direction?: string;
  summary?: string;
  key_findings?: string[];
  evidence_confidence?: {
    evidence_backed: number;
    analogical: number;
    inferred: number;
    reasoning: number;
    gaps: number;
  };
  inequality_direction?: string;
  gap_count?: number;
  assumption_risks?: number;
  equity_tensions?: number;
  recommendation_count?: number;
  high_count?: number;
  moderate_count?: number;
  low_count?: number;
}

export interface SummaryCardEvent {
  type: "summary_card";
  section_id: string;
  card: SummaryCard;
}

// --- Analysis progress types ---

export type AnalysisStepStatus = "pending" | "active" | "complete" | "error";

export interface AnalysisStep {
  step: "scan" | "subgroup" | "synthesis";
  index?: number;
  name?: string;
  status: AnalysisStepStatus;
  searches?: EvidenceSearchRecord[];
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

export interface AnalysisCheckpointEvent {
  type: "analysis_checkpoint";
  subgroup_count: number;
}

export interface ScanCategoryCompleteEvent {
  type: "scan_category_complete";
  completed: number;
  total: number;
}

export type AnalysisDataEvent =
  | AnalysisStepEvent
  | EvidenceSearchEvent
  | StageTransitionEvent
  | ProposedSubGroupsEvent
  | AnalysisContentEvent
  | AnalysisCheckpointEvent
  | ScanCategoryCompleteEvent
  | SubgroupEvidenceEvent
  | StepSummaryEvent
  | SummaryCardEvent;

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

// --- Evidence base source metadata ---

export interface EvidenceSource {
  source_name: string;
  pdf_filename: string;
  year: string | null;
  link: string | null;
  participants: string | null;
  objective: string | null;
  key_insights: string | null;
  methodology: string | null;
  data_type: string | null;
}

export interface EvidenceSourcesResponse {
  sources: EvidenceSource[];
  total: number;
}

export interface SourceCitationSubgroup {
  sectionId: string;
  name: string;
}

export interface SourceCitation {
  count: number;
  subgroups: SourceCitationSubgroup[];
}
