"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONValue } from "ai";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Header } from "../ui/Header";
import { SpecificationSidebar } from "../specification/SpecificationSidebar";
import { AnalysisView } from "../analysis/AnalysisView";
import { EvidenceDrawer } from "../evidence/EvidenceDrawer";
import { MethodologyDrawer } from "../methodology/MethodologyDrawer";
import {
  buildAuditCardData,
  type AuditCardData,
} from "../methodology/MethodologyAuditCard";
import { API_BASE, apiHeaders } from "@/lib/api";
import { buildSpecBlock } from "@/lib/spec-helpers";
import {
  clearSession,
  debouncedSave,
  fixInterruptedAnalysis,
  hydrateAnalysisSections,
  hydrateStepSummaries,
  hydrateSubgroupEvidence,
  hydrateSummaryCards,
  loadSession,
} from "@/lib/session-cache";
import {
  EMPTY_SUMMARY_SPEC,
  createEmptyAnalysisProgress,
  type AnalysisProgress,
  type AnalysisSection,
  type AnalysisStep,
  type ConversationStage,
  type EvidenceSearchRecord,
  type EvidenceSource,
  type EvidenceSourcesResponse,
  type ProposedSubGroups,
  type RawEvidenceSearch,
  type SpecMetadata,
  type SubGroup,
  type SummaryCard,
} from "@/lib/types";
import {
  SYNTHESIS_SECTION_IDS,
  SYNTHESIS_SECTION_LABELS,
  buildAnalysisTexts,
  buildSgLabels,
  deriveSynthesisSubstepStatus,
  isSynthesisSection,
  stripArtifactTailBlocks,
} from "@/lib/analysis-sections";

function parseSpecFromData(
  data: JSONValue[] | undefined,
): SpecMetadata | null {
  if (!data || data.length === 0) return null;
  for (let i = data.length - 1; i >= 0; i--) {
    const item = data[i];
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      "spec" in item
    ) {
      return item as unknown as SpecMetadata;
    }
  }
  return null;
}

function isAnalysisEvent(item: unknown): item is Record<string, unknown> {
  return (
    !!item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    "type" in (item as Record<string, unknown>)
  );
}

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function ChatContainer() {
  const [initialCache] = useState(() => {
    const cached = loadSession();
    if (!cached) return null;
    const fixup = fixInterruptedAnalysis(cached);
    return { cached, ...fixup };
  });

  const [stage, setStage] = useState<ConversationStage>(
    initialCache?.stage ?? "specifying",
  );
  const [specMeta, setSpecMeta] = useState<SpecMetadata>(
    initialCache?.cached.specMeta ?? {
      spec: { ...EMPTY_SUMMARY_SPEC },
    },
  );
  const [proposedSubGroups, setProposedSubGroups] =
    useState<ProposedSubGroups | null>(
      initialCache?.cached.proposedSubGroups ?? null,
    );
  const [confirmedSubGroups, setConfirmedSubGroups] = useState<
    SubGroup[] | null
  >(initialCache?.cached.confirmedSubGroups ?? null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>(
    initialCache?.analysisProgress ?? createEmptyAnalysisProgress(),
  );

  const [analysisSections, setAnalysisSections] = useState<
    Map<string, AnalysisSection>
  >(() =>
    initialCache?.cached.analysisSections
      ? hydrateAnalysisSections(initialCache.cached.analysisSections)
      : new Map(),
  );
  const [activeSection, setActiveSection] = useState<string | null>(
    initialCache?.cached.activeSection ?? null,
  );
  const [streamingSection, setStreamingSection] = useState<string | null>(null);
  const [subgroupEvidence, setSubgroupEvidence] = useState<
    Map<string, RawEvidenceSearch[]>
  >(() =>
    initialCache?.cached.subgroupEvidence
      ? hydrateSubgroupEvidence(initialCache.cached.subgroupEvidence)
      : new Map(),
  );
  const [stepSummaries, setStepSummaries] = useState<Map<string, string>>(() =>
    initialCache?.cached.stepSummaries
      ? hydrateStepSummaries(initialCache.cached.stepSummaries)
      : new Map(),
  );
  const [summaryCards, setSummaryCards] = useState<Map<string, SummaryCard>>(
    () =>
      initialCache?.cached.summaryCards
        ? hydrateSummaryCards(initialCache.cached.summaryCards)
        : new Map(),
  );
  const [scanCategoryProgress, setScanCategoryProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  const [evidenceDrawerOpen, setEvidenceDrawerOpen] = useState(false);
  const [evidenceDrawerTarget, setEvidenceDrawerTarget] = useState<string | null>(null);
  const [evidenceSources, setEvidenceSources] = useState<EvidenceSource[] | null>(null);
  const evidenceSourcesFetchedRef = useRef(false);

  const [methodologyDrawerOpen, setMethodologyDrawerOpen] = useState(false);
  const [methodologyScrollTarget, setMethodologyScrollTarget] = useState<string | null>(null);
  const [auditCardData, setAuditCardData] = useState<AuditCardData | null>(null);

  const specMetaRef = useRef(specMeta);
  specMetaRef.current = specMeta;

  const stageRef = useRef(stage);
  stageRef.current = stage;

  const confirmedSubGroupsRef = useRef(confirmedSubGroups);
  confirmedSubGroupsRef.current = confirmedSubGroups;

  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const streamingSectionRef = useRef(streamingSection);
  streamingSectionRef.current = streamingSection;

  // Sub-group indices whose first content delta has been seen this run.
  const writingSeenRef = useRef<Set<number>>(new Set());

  const pendingDeltasRef = useRef<Map<string, string>>(new Map());
  const flushRafRef = useRef<number | null>(null);

  const setActiveSectionIfChanged = useCallback((sectionId: string | null) => {
    if (activeSectionRef.current === sectionId) return;
    activeSectionRef.current = sectionId;
    setActiveSection(sectionId);
  }, []);

  const setStreamingSectionIfChanged = useCallback((sectionId: string | null) => {
    if (streamingSectionRef.current === sectionId) return;
    streamingSectionRef.current = sectionId;
    setStreamingSection(sectionId);
  }, []);

  const flushPendingDeltas = useCallback(() => {
    flushRafRef.current = null;
    const pending = pendingDeltasRef.current;
    if (pending.size === 0) return;

    const batch = new Map(pending);
    pending.clear();

    let shouldActivateScan = false;

    setAnalysisSections((prev) => {
      const next = new Map(prev);
      let changed = false;

      batch.forEach((delta, sectionId) => {
        if (!delta) return;

        const existing = next.get(sectionId);
        if (existing) {
          next.set(sectionId, {
            ...existing,
            content: existing.content + delta,
          });
          changed = true;
        } else {
          const subgroups = confirmedSubGroupsRef.current;
          let name = sectionId;
          if (sectionId === "scan") {
            name = "Population Relevance Assessment";
            shouldActivateScan = true;
          } else if (isSynthesisSection(sectionId)) {
            name = SYNTHESIS_SECTION_LABELS[sectionId];
          } else if (sectionId.startsWith("sg_") && subgroups) {
            const idx = parseInt(sectionId.slice(3), 10);
            name = subgroups[idx]?.name || `Sub-group ${idx + 1}`;
          }
          next.set(sectionId, { id: sectionId, name, content: delta });
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    // Streaming sections no longer claim the panel — progress lives in the
    // sidebar and chat; the analyst opens reports when they choose to.
    if (shouldActivateScan) {
      setStreamingSectionIfChanged("scan");
    }
  }, [setStreamingSectionIfChanged]);

  /** Patch a sub-group step by index; falls back to the first active one. */
  const patchSubgroupStep = useCallback(
    (index: number | undefined, patch: (s: AnalysisStep) => Partial<AnalysisStep>) => {
      setAnalysisProgress((prev) => {
        const at = prev.steps.findIndex((s) =>
          s.step === "subgroup" &&
          (index === undefined ? s.status === "active" : s.index === index),
        );
        if (at < 0) return prev;
        const steps = [...prev.steps];
        steps[at] = { ...steps[at], ...patch(steps[at]) };
        return { ...prev, steps };
      });
    },
    [],
  );

  const lastProcessedDataIdx = useRef(-1);

  const chatBody = useMemo(
    () => ({
      stage,
      spec_state: specMeta,
      confirmed_subgroups: confirmedSubGroups,
      ...(stage === "chatting" && analysisSections.size > 0
        ? { analysis_texts: buildAnalysisTexts(analysisSections) }
        : {}),
    }),
    [stage, specMeta, confirmedSubGroups, analysisSections],
  );

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    setInput,
    data,
    setData,
    append,
  } = useChat({
    api: `${API_BASE}/api/v1/chat`,
    headers: apiHeaders(),
    body: chatBody,
    streamProtocol: "data",
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    const startIdx = lastProcessedDataIdx.current + 1;
    if (startIdx >= data.length) return;

    if (stageRef.current === "specifying") {
      const specParsed = parseSpecFromData(data);
      if (specParsed) {
        setSpecMeta((prev) =>
          jsonEqual(prev, specParsed) ? prev : specParsed,
        );
      }
    }

    for (let i = startIdx; i < data.length; i++) {
      const item = data[i];
      if (!isAnalysisEvent(item)) continue;
      const eventType = item.type as string;

      if (eventType === "proposed_sub_groups") {
        const proposed: ProposedSubGroups = {
          subgroups: (item.subgroups as unknown as SubGroup[]) || [],
          relevance_scan:
            (item.relevance_scan as unknown as Record<string, string>) || {},
        };
        setProposedSubGroups((prev) =>
          prev && jsonEqual(prev, proposed) ? prev : proposed,
        );
        setConfirmedSubGroups((prev) => {
          const next = proposed.subgroups;
          if (prev && jsonEqual(prev, next)) return prev;
          return next;
        });
      }

      if (eventType === "analysis_content") {
        const sectionId = item.section as string;
        const delta = item.delta as string;

        const pending = pendingDeltasRef.current;
        pending.set(sectionId, (pending.get(sectionId) ?? "") + delta);

        if (sectionId.startsWith("sg_")) {
          const sgIdx = parseInt(sectionId.slice(3), 10);
          if (!writingSeenRef.current.has(sgIdx)) {
            writingSeenRef.current.add(sgIdx);
            patchSubgroupStep(sgIdx, () => ({ writing: true, activeQuery: null }));
          }
        }

        if (isSynthesisSection(sectionId)) {
          setStreamingSectionIfChanged(sectionId);
        }

        if (flushRafRef.current === null) {
          flushRafRef.current = requestAnimationFrame(flushPendingDeltas);
        }
      }

      if (eventType === "analysis_step") {
        const step = item.step as AnalysisStep["step"];
        const status = item.status as AnalysisStep["status"];
        const index = item.index as number | undefined;
        const name = item.name as string | undefined;

        if (status === "active") {
          if (step === "scan") {
            setAnalysisSections((prev) => {
              if (prev.has("scan")) return prev;
              const next = new Map(prev);
              next.set("scan", {
                id: "scan",
                name: "Population Relevance Assessment",
                content: "",
              });
              return next;
            });
            setStreamingSectionIfChanged("scan");
          } else if (step === "synthesis") {
            setAnalysisSections((prev) => {
              const next = new Map(prev);
              for (const id of SYNTHESIS_SECTION_IDS) {
                if (!next.has(id)) {
                  next.set(id, {
                    id,
                    name: SYNTHESIS_SECTION_LABELS[id],
                    content: "",
                  });
                }
              }
              return next;
            });
            setStreamingSectionIfChanged("equity_assessment");
          } else {
            const sectionId = `sg_${index ?? 0}`;
            setAnalysisSections((prev) => {
              if (prev.has(sectionId)) return prev;
              const subgroups = confirmedSubGroupsRef.current;
              const sgName = subgroups?.[index ?? 0]?.name ?? `Sub-group ${(index ?? 0) + 1}`;
              const next = new Map(prev);
              next.set(sectionId, { id: sectionId, name: sgName, content: "" });
              return next;
            });
          }
        }

        if (status === "complete" || status === "error") {
          if (flushRafRef.current !== null) {
            cancelAnimationFrame(flushRafRef.current);
            flushRafRef.current = null;
          }
          flushRafRef.current = requestAnimationFrame(flushPendingDeltas);
          if (step !== "subgroup") setStreamingSectionIfChanged(null);
        }

        setAnalysisProgress((prev) => {
          const steps = [...prev.steps];
          const existing = steps.findIndex(
            (s) => s.step === step && s.index === index,
          );

          if (existing >= 0) {
            const current = steps[existing];
            if (
              current.status === status &&
              (name === undefined || current.name === name)
            ) {
              return prev;
            }
            const merged = { ...current, status };
            if (name !== undefined) merged.name = name;
            if (index !== undefined) merged.index = index;
            if (status === "active" && current.status !== "active") {
              merged.startedAt = Date.now();
            }
            if (status !== "active") merged.activeQuery = null;
            steps[existing] = merged;
          } else {
            steps.push({
              step,
              index,
              name,
              status,
              ...(status === "active" ? { startedAt: Date.now() } : {}),
            });
          }

          const synthStep = steps.find((s) => s.step === "synthesis");
          const isComplete =
            steps.length > 0 &&
            synthStep !== undefined &&
            (synthStep.status === "complete" || synthStep.status === "error") &&
            steps.every(
              (s) => s.status === "complete" || s.status === "error",
            );

          const next = { steps, isComplete };
          return jsonEqual(prev, next) ? prev : next;
        });
      }

      if (eventType === "evidence_search") {
        const query = item.query as string;
        patchSubgroupStep(item.index as number | undefined, () => ({
          activeQuery: query,
        }));
      }

      if (eventType === "evidence_search_complete") {
        const record: EvidenceSearchRecord = {
          query: item.query as string,
          numResults: item.num_results as number,
          sourceNames: (item.source_names as string[]) ?? [],
        };
        // ponytail: searches in a round run concurrently, so the in-flight query
        // shown is just the latest one started; cleared when any completes.
        patchSubgroupStep(item.index as number | undefined, (s) => ({
          activeQuery: null,
          searches: [...(s.searches ?? []), record],
        }));
      }

      if (eventType === "subgroup_evidence") {
        const sectionId = item.section_id as string;
        const searches = item.searches as unknown as RawEvidenceSearch[];
        setSubgroupEvidence((prev) => {
          const next = new Map(prev);
          next.set(sectionId, searches);
          return next;
        });
      }

      if (eventType === "step_summary") {
        const sectionId = item.section_id as string;
        const summary = item.summary as string;
        setStepSummaries((prev) => {
          const next = new Map(prev);
          next.set(sectionId, summary);
          return next;
        });
        setAnalysisSections((prev) => {
          const existing = prev.get(sectionId);
          if (!existing) return prev;
          const cleaned = stripArtifactTailBlocks(existing.content);
          if (cleaned === existing.content) return prev;
          const next = new Map(prev);
          next.set(sectionId, { ...existing, content: cleaned });
          return next;
        });
      }

      if (eventType === "summary_card") {
        const sectionId = item.section_id as string;
        const card = item.card as SummaryCard;
        if (!card) continue;
        setSummaryCards((prev) => {
          const next = new Map(prev);
          next.set(sectionId, card);
          return next;
        });
        setAnalysisSections((prev) => {
          const existing = prev.get(sectionId);
          if (!existing) return prev;
          const cleaned = stripArtifactTailBlocks(existing.content);
          if (cleaned === existing.content) return prev;
          const next = new Map(prev);
          next.set(sectionId, { ...existing, content: cleaned });
          return next;
        });
      }

      if (eventType === "scan_category_complete") {
        const completed = item.completed as number;
        const total = item.total as number;
        setScanCategoryProgress((prev) =>
          prev && prev.completed === completed ? prev : { completed, total },
        );
      }

      if (eventType === "stage_transition") {
        setStage(item.stage as ConversationStage);
        setStreamingSectionIfChanged(null);
      }
    }
    lastProcessedDataIdx.current = data.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, data?.length, flushPendingDeltas, setActiveSectionIfChanged, setStreamingSectionIfChanged, patchSubgroupStep]);

  useEffect(() => {
    if (!initialCache) return;
    const { cached, wasInterrupted } = initialCache;

    setMessages(cached.messages);

    if (wasInterrupted) {
      const completedCount = cached.analysisProgress.steps.filter(
        (s) => s.status === "complete",
      ).length;
      const totalCount = cached.analysisProgress.steps.length;
      setMessages((prev) => [
        ...prev,
        {
          id: `analysis-interrupted-${Date.now()}`,
          role: "assistant",
          content: `The previous analysis was interrupted (${completedCount} of ${totalCount} sections completed). The completed sections are available in the analysis panel. You can re-run the analysis if needed.`,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skipSaveRef = useRef(!!initialCache);
  useEffect(() => {
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    debouncedSave({
      stage,
      messages,
      specMeta,
      proposedSubGroups,
      confirmedSubGroups,
      analysisProgress,
      analysisSections,
      activeSection,
      subgroupEvidence,
      stepSummaries,
      summaryCards,
    });
  }, [
    stage,
    messages,
    specMeta,
    proposedSubGroups,
    confirmedSubGroups,
    analysisProgress,
    analysisSections,
    activeSection,
    subgroupEvidence,
    stepSummaries,
    summaryCards,
  ]);

  const handleNewSession = useCallback(() => {
    clearSession();
    setMessages([]);
    setStage("specifying");
    setSpecMeta({
      spec: { ...EMPTY_SUMMARY_SPEC },
    });
    setData(undefined);
    setProposedSubGroups(null);
    setConfirmedSubGroups(null);
    setAnalysisProgress(createEmptyAnalysisProgress());
    setAnalysisSections(new Map());
    setActiveSectionIfChanged(null);
    setStreamingSectionIfChanged(null);
    setSubgroupEvidence(new Map());
    setStepSummaries(new Map());
    setSummaryCards(new Map());
    setScanCategoryProgress(null);
    setEvidenceDrawerOpen(false);
    setEvidenceDrawerTarget(null);
    setAuditCardData(null);
    auditCardBuiltRef.current = false;
    lastProcessedDataIdx.current = -1;
    writingSeenRef.current.clear();
    pendingDeltasRef.current.clear();
    if (flushRafRef.current !== null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
  }, [setMessages, setData]);

  const handleProceed = useCallback(() => {
    const currentMeta = specMetaRef.current;
    const policyName = currentMeta.spec.policy_name || "the policy";
    const specBlock = buildSpecBlock(currentMeta);
    const confirmationContent =
      `Policy specification confirmed for **${policyName}**. ` +
      `See the full summary in the artifacts panel. ` +
      `Starting population relevance assessment.` +
      specBlock;

    setMessages((prev) => [
      ...prev,
      {
        id: `spec-confirmation-${Date.now()}`,
        role: "assistant",
        content: confirmationContent,
      },
    ]);

    setStage("analysing");
    setAnalysisProgress({
      steps: [{ step: "scan", status: "active", startedAt: Date.now() }],
      isComplete: false,
    });

    setTimeout(() => {
      append({
        role: "user",
        content:
          "I've confirmed the policy specification. Please assess population relevance and propose sub-groups for equity impact analysis.",
      });
    }, 100);
  }, [setMessages, append]);

  const handleRunAnalysis = useCallback(() => {
    const subgroups = confirmedSubGroupsRef.current;
    if (!subgroups || subgroups.length === 0) return;

    const startedAt = Date.now();
    const subgroupSteps: AnalysisStep[] = subgroups.map((sg, i) => ({
      step: "subgroup" as const,
      index: i,
      name: sg.name,
      status: "active" as const,
      startedAt,
    }));
    const synthesisStep: AnalysisStep = {
      step: "synthesis",
      status: "pending",
    };
    setAnalysisProgress((prev) => {
      const scanStep = prev.steps.find((s) => s.step === "scan");
      return {
        steps: [
          ...(scanStep ? [scanStep] : []),
          ...subgroupSteps,
          synthesisStep,
        ],
        isComplete: false,
      };
    });
    setAnalysisSections((prev) => {
      const next = new Map<string, AnalysisSection>();
      const scanSection = prev.get("scan");
      if (scanSection) next.set("scan", scanSection);
      subgroups.forEach((sg, i) =>
        next.set(`sg_${i}`, { id: `sg_${i}`, name: sg.name, content: "" }),
      );
      return next;
    });
    setActiveSectionIfChanged(null);
    setStreamingSectionIfChanged(null);
    writingSeenRef.current.clear();

    append({
      role: "user",
      content: `Run the equity impact analysis for the ${subgroups.length} confirmed sub-groups.`,
    });
  }, [append]);

  const synthesisComplete = useMemo(() => {
    const synthStep = analysisProgress.steps.find((s) => s.step === "synthesis");
    return synthStep?.status === "complete" || synthStep?.status === "error";
  }, [analysisProgress]);

  const synthesisSubsteps = useMemo(
    () =>
      deriveSynthesisSubstepStatus(
        analysisProgress.steps.find((s) => s.step === "synthesis")?.status,
        streamingSection,
        analysisSections,
      ),
    [analysisProgress, streamingSection, analysisSections],
  );

  const sgLabels = useMemo(
    () => buildSgLabels(confirmedSubGroups?.length ?? 0),
    [confirmedSubGroups],
  );

  // Build the methodology audit card when analysis completes
  const auditCardBuiltRef = useRef(false);
  useEffect(() => {
    if (!analysisProgress.isComplete || auditCardBuiltRef.current) return;
    auditCardBuiltRef.current = true;

    const citedNames = new Set<string>();
    subgroupEvidence.forEach((searches) => {
      for (const search of searches) {
        for (const chunk of search.chunks) {
          citedNames.add(chunk.source_name);
        }
      }
    });

    const data = buildAuditCardData({
      policyName: specMeta.spec.policy_name,
      policySummary: specMeta.spec.policy_summary,
      confirmedSubGroups,
      subgroupEvidence,
      evidenceSourceCount: evidenceSources?.length ?? null,
      summaryCards,
      citedSourceCount: citedNames.size,
    });

    setAuditCardData(data);
    setAnalysisSections((prev) => {
      const next = new Map(prev);
      next.set("methodology", {
        id: "methodology",
        name: "Analysis Methodology",
        content: "",
      });
      return next;
    });
  }, [analysisProgress.isComplete, specMeta, confirmedSubGroups, subgroupEvidence, evidenceSources, summaryCards]);

  const handleRemoveSubGroup = useCallback((subGroupId: string) => {
    setConfirmedSubGroups((prev) => {
      if (!prev) return prev;
      return prev.filter((sg) => sg.id !== subGroupId);
    });
  }, []);

  const fetchEvidenceSources = useCallback(async () => {
    if (evidenceSourcesFetchedRef.current) return;
    evidenceSourcesFetchedRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/api/v1/evidence/sources`, {
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: EvidenceSourcesResponse = await res.json();
      setEvidenceSources(data.sources);
    } catch (err) {
      console.error("Failed to fetch evidence sources:", err);
      evidenceSourcesFetchedRef.current = false;
    }
  }, []);

  const handleOpenEvidenceDrawer = useCallback(
    (targetSourceName?: string) => {
      setEvidenceDrawerOpen(true);
      if (targetSourceName) {
        setEvidenceDrawerTarget(targetSourceName);
      }
      fetchEvidenceSources();
    },
    [fetchEvidenceSources],
  );

  const handleCloseEvidenceDrawer = useCallback(() => {
    setEvidenceDrawerOpen(false);
    setEvidenceDrawerTarget(null);
  }, []);

  const handleOpenMethodologyDrawer = useCallback(
    (scrollTo?: string) => {
      setMethodologyDrawerOpen(true);
      setMethodologyScrollTarget(scrollTo ?? null);
    },
    [],
  );

  const handleCloseMethodologyDrawer = useCallback(() => {
    setMethodologyDrawerOpen(false);
    setMethodologyScrollTarget(null);
  }, []);

  const handleClearEvidenceTarget = useCallback(() => {
    setEvidenceDrawerTarget(null);
  }, []);

  const handleSelectPolicy = useCallback(
    (description: string) => {
      append({ role: "user", content: description });
    },
    [append],
  );

  const handleSelectSection = useCallback((sectionId: string) => {
    setActiveSectionIfChanged(sectionId);
  }, [setActiveSectionIfChanged]);

  // --- Layout logic ---
  const hasSummary = !!specMeta.spec.policy_summary;
  const showArtifacts = hasSummary || analysisSections.size > 0;

  const analysisRunning =
    analysisProgress.steps.some(
      (s) =>
        (s.step === "subgroup" || s.step === "synthesis") &&
        (s.status === "active" || s.status === "complete" || s.status === "error"),
    );

  const chatWidth = !showArtifacts
    ? "flex-1"
    : stage === "specifying"
      ? "w-[60%]"
      : stage === "analysing"
        ? "w-[35%]"
        : "w-[40%]";

  const artifactsWidth = stage === "specifying"
    ? "w-[40%]"
    : stage === "analysing"
      ? "w-[65%]"
      : "w-[60%]";

  const chatDisabled = stage === "analysing" && (isLoading || analysisRunning);

  // Sub-groups stream in parallel, so several sections can be live at once.
  const streamingSections = new Set<string>(
    analysisProgress.steps
      .filter((s) => s.step === "subgroup" && s.status === "active")
      .map((s) => `sg_${s.index ?? 0}`),
  );
  if (streamingSection) streamingSections.add(streamingSection);

  const chatActions: { label: string; onClick: () => void }[] = [];
  if (stage === "specifying" && specMeta.spec.ready_for_analysis) {
    chatActions.push({ label: "Proceed to analysis", onClick: handleProceed });
  }
  if (
    stage === "analysing" &&
    confirmedSubGroups?.length &&
    !analysisRunning &&
    !isLoading
  ) {
    chatActions.push({
      label: `Run analysis (${confirmedSubGroups.length} sub-groups)`,
      onClick: handleRunAnalysis,
    });
  }

  const policySummary = specMeta.spec.policy_summary
    ? {
        name: specMeta.spec.policy_name || "Policy Summary",
        summary: specMeta.spec.policy_summary,
        openQuestions: specMeta.spec.open_questions,
        outcomesOfInterest: specMeta.spec.outcomes_of_interest ?? [],
        taxonomyMapping: specMeta.spec.taxonomy_mapping,
      }
    : null;

  return (
    <div className="flex h-screen flex-col">
      <Header
        onNewSession={handleNewSession}
        stage={stage}
        sourceCount={evidenceSources?.length ?? null}
        onOpenEvidenceDrawer={() => handleOpenEvidenceDrawer()}
        onOpenMethodology={() => handleOpenMethodologyDrawer()}
      />
      <div className="flex min-h-0 flex-1">
        {/* Sidebar (left, fixed width) */}
        <SpecificationSidebar
          spec={specMeta.spec}
          stage={stage}
          policyName={specMeta.spec.policy_name}
          onProceed={handleProceed}
          proposedSubGroups={proposedSubGroups}
          confirmedSubGroups={confirmedSubGroups}
          analysisProgress={analysisProgress}
          onRemoveSubGroup={handleRemoveSubGroup}
          onSelectSection={handleSelectSection}
          synthesisSubsteps={synthesisSubsteps}
          sgLabels={sgLabels}
          streamingSection={streamingSection}
          scanCategoryProgress={scanCategoryProgress}
          hasAuditCard={auditCardData !== null}
        />

        {/* Chat (centre, always present) */}
        <div className={`flex min-h-0 flex-col ${chatWidth}`}>
          <MessageList
            messages={messages}
            isLoading={isLoading}
            stage={stage}
            onSelectPolicy={handleSelectPolicy}
            onSelectSuggestion={handleSelectPolicy}
            actions={chatActions}
          />
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            <ChatInput
              input={input}
              isLoading={isLoading}
              disabled={chatDisabled}
              disabledPlaceholder="Analysis in progress — follow-up questions available when complete"
              onInputChange={handleInputChange}
              onSubmit={handleSubmit}
            />
          </div>
        </div>

        {/* Artifacts panel (right, conditional) */}
        {showArtifacts && (
          <div
            className={`flex min-h-0 flex-col overflow-hidden border-l border-[var(--color-border)] ${artifactsWidth}`}
          >
            <AnalysisView
              summaryCards={summaryCards}
              policySummary={policySummary}
              policyName={specMeta.spec.policy_name}
              sections={analysisSections}
              activeSection={activeSection}
              streamingSections={streamingSections}
              subgroupEvidence={subgroupEvidence}
              confirmedSubGroups={confirmedSubGroups}
              synthesisComplete={synthesisComplete}
              onNavigateToSection={handleSelectSection}
              onOpenEvidenceDrawer={handleOpenEvidenceDrawer}
              onOpenMethodologyDrawer={handleOpenMethodologyDrawer}
              auditCardData={auditCardData}
            />
          </div>
        )}
      </div>

      <EvidenceDrawer
        open={evidenceDrawerOpen}
        onClose={handleCloseEvidenceDrawer}
        sources={evidenceSources}
        targetSource={evidenceDrawerTarget}
        onClearTarget={handleClearEvidenceTarget}
        subgroupEvidence={subgroupEvidence}
        confirmedSubGroups={confirmedSubGroups}
        hasAnalysis={analysisProgress.steps.length > 0}
        onNavigateToSubgroup={handleSelectSection}
      />

      <MethodologyDrawer
        open={methodologyDrawerOpen}
        onClose={handleCloseMethodologyDrawer}
        scrollToSection={methodologyScrollTarget}
      />
    </div>
  );
}
