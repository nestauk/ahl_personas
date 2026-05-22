"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONValue } from "ai";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Header } from "../ui/Header";
import { SpecificationSidebar } from "../specification/SpecificationSidebar";
import { AnalysisView } from "../analysis/AnalysisView";
import { buildSpecBlock } from "@/lib/spec-helpers";
import {
  clearSession,
  debouncedSave,
  fixInterruptedAnalysis,
  hydrateAnalysisSections,
  hydrateSubgroupEvidence,
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
  type ProposedSubGroups,
  type RawEvidenceSearch,
  type SpecMetadata,
  type SubGroup,
} from "@/lib/types";

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
  const [activeEvidenceSearch, setActiveEvidenceSearch] = useState<
    string | null
  >(null);

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

  const lastStreamedSectionRef = useRef<string | null>(null);
  const checkpointReachedRef = useRef(false);

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
          } else if (sectionId === "synthesis") {
            name = "Equity synthesis and provocations";
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

    if (shouldActivateScan) {
      setActiveSectionIfChanged("scan");
      setStreamingSectionIfChanged("scan");
    }
  }, [setActiveSectionIfChanged, setStreamingSectionIfChanged]);

  const lastProcessedDataIdx = useRef(-1);

  const chatBody = useMemo(
    () => ({
      stage,
      spec_state: specMeta,
      confirmed_subgroups: confirmedSubGroups,
    }),
    [stage, specMeta, confirmedSubGroups],
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
    api: "http://localhost:8000/api/v1/chat",
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
            setActiveSectionIfChanged("scan");
            setStreamingSectionIfChanged("scan");
          } else {
            const sectionId =
              step === "synthesis" ? "synthesis" : `sg_${index ?? 0}`;
            setStreamingSectionIfChanged(sectionId);
            const current = activeSectionRef.current;
            const lastStreamed = lastStreamedSectionRef.current;
            if (current === null || current === lastStreamed) {
              setActiveSectionIfChanged(sectionId);
            }
          }
        }

        if (status === "complete" || status === "error") {
          flushPendingDeltas();
          lastStreamedSectionRef.current = streamingSectionRef.current;
          setStreamingSectionIfChanged(null);
          setActiveEvidenceSearch(null);
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
            steps[existing] = merged;
          } else {
            steps.push({ step, index, name, status });
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
        setActiveEvidenceSearch((prev) => (prev === query ? prev : query));
      }

      if (eventType === "evidence_search_complete") {
        setActiveEvidenceSearch(null);
        const record: EvidenceSearchRecord = {
          query: item.query as string,
          numResults: item.num_results as number,
          sourceNames: (item.source_names as string[]) ?? [],
        };
        setAnalysisProgress((prev) => {
          const steps = [...prev.steps];
          const activeIdx = steps.findIndex(
            (s) => s.step === "subgroup" && s.status === "active",
          );
          if (activeIdx >= 0) {
            const step = steps[activeIdx];
            steps[activeIdx] = {
              ...step,
              searches: [...(step.searches ?? []), record],
            };
          }
          return { ...prev, steps };
        });
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

      if (eventType === "analysis_checkpoint") {
        checkpointReachedRef.current = true;
      }

      if (eventType === "stage_transition") {
        const newStage = item.stage as ConversationStage;
        setStage(newStage);
        setActiveEvidenceSearch(null);
        setStreamingSectionIfChanged(null);

        if (newStage === "chatting" && !checkpointReachedRef.current) {
          const sectionCount = analysisSectionsRef.current.size;
          setMessages((prev) => [
            ...prev,
            {
              id: `analysis-complete-${Date.now()}`,
              role: "assistant",
              content: `Analysis complete — ${sectionCount} sections analysed. Ask follow-up questions below, or navigate sections in the analysis panel.`,
            },
          ]);
        }
        checkpointReachedRef.current = false;
      }
    }
    lastProcessedDataIdx.current = data.length - 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, data?.length, flushPendingDeltas, setActiveSectionIfChanged, setStreamingSectionIfChanged, setMessages]);

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
    setActiveEvidenceSearch(null);
    setAnalysisSections(new Map());
    setActiveSectionIfChanged(null);
    setStreamingSectionIfChanged(null);
    setSubgroupEvidence(new Map());
    lastProcessedDataIdx.current = -1;
    checkpointReachedRef.current = false;
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

    const subgroupSteps: AnalysisStep[] = subgroups.map((sg, i) => ({
      step: "subgroup" as const,
      index: i,
      name: sg.name,
      status: "pending" as const,
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
      const scanSection = prev.get("scan");
      if (scanSection) {
        const next = new Map<string, AnalysisSection>();
        next.set("scan", scanSection);
        return next;
      }
      return new Map();
    });
    setActiveSectionIfChanged(null);
    setStreamingSectionIfChanged(null);

    append({
      role: "user",
      content: `Run the equity impact analysis for the ${subgroups.length} confirmed sub-groups.`,
    });
  }, [append]);

  const awaitingSynthesis = useMemo(() => {
    const steps = analysisProgress.steps;
    const subgroupSteps = steps.filter((s) => s.step === "subgroup");
    const synthesisStep = steps.find((s) => s.step === "synthesis");
    return (
      subgroupSteps.length > 0 &&
      subgroupSteps.every(
        (s) => s.status === "complete" || s.status === "error",
      ) &&
      synthesisStep?.status === "pending"
    );
  }, [analysisProgress]);

  const analysisSectionsRef = useRef(analysisSections);
  analysisSectionsRef.current = analysisSections;

  const handleRunSynthesis = useCallback(() => {
    const sections = analysisSectionsRef.current;
    const texts: { name: string; text: string }[] = [];
    sections.forEach((section) => {
      if (section.id !== "scan" && section.id !== "policy_summary") {
        texts.push({ name: section.name, text: section.content });
      }
    });
    if (texts.length === 0) return;

    setStage("analysing");

    append(
      {
        role: "user",
        content: "Run the equity synthesis and provocations.",
      },
      {
        body: {
          stage: "analysing",
          run_synthesis: true,
          analysis_texts: texts,
        },
      },
    );
  }, [append]);

  const handleRemoveSubGroup = useCallback((subGroupId: string) => {
    setConfirmedSubGroups((prev) => {
      if (!prev) return prev;
      return prev.filter((sg) => sg.id !== subGroupId);
    });
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

  const chatDisabled =
    stage === "analysing" && (isLoading || analysisRunning) && !awaitingSynthesis;

  const policySummary = specMeta.spec.policy_summary
    ? {
        name: specMeta.spec.policy_name || "Policy Summary",
        summary: specMeta.spec.policy_summary,
        openQuestions: specMeta.spec.open_questions,
        taxonomyMapping: specMeta.spec.taxonomy_mapping,
      }
    : null;

  return (
    <div className="flex h-screen flex-col">
      <Header onNewSession={handleNewSession} stage={stage} />
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
          onRunAnalysis={handleRunAnalysis}
          onRunSynthesis={handleRunSynthesis}
          awaitingSynthesis={awaitingSynthesis}
          onRemoveSubGroup={handleRemoveSubGroup}
          isLoading={isLoading}
          activeEvidenceSearch={activeEvidenceSearch}
          onSelectSection={handleSelectSection}
        />

        {/* Chat (centre, always present) */}
        <div className={`flex min-h-0 flex-col ${chatWidth}`}>
          <MessageList
            messages={messages}
            isLoading={isLoading}
            stage={stage}
            onSelectPolicy={handleSelectPolicy}
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
              policySummary={policySummary}
              sections={analysisSections}
              activeSection={activeSection}
              streamingSection={streamingSection}
              subgroupEvidence={subgroupEvidence}
            />
          </div>
        )}
      </div>
    </div>
  );
}
