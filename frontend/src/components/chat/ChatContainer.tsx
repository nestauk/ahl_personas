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
  loadSession,
} from "@/lib/session-cache";
import {
  EMPTY_SUMMARY_SPEC,
  createEmptyAnalysisProgress,
  type AnalysisProgress,
  type AnalysisSection,
  type AnalysisStep,
  type ConversationStage,
  type ProposedSubGroups,
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
  const [evidenceSearchCount, setEvidenceSearchCount] = useState(
    initialCache?.cached.evidenceSearchCount ?? 0,
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

  const newSectionsRef = useRef<string[]>([]);

  const flushPendingDeltas = useCallback(() => {
    flushRafRef.current = null;
    const pending = pendingDeltasRef.current;
    if (pending.size === 0) return;

    const batch = new Map(pending);
    pending.clear();

    newSectionsRef.current = [];

    setAnalysisSections((prev) => {
      const next = new Map(prev);
      batch.forEach((delta, sectionId) => {
        const existing = next.get(sectionId);
        if (existing) {
          next.set(sectionId, {
            ...existing,
            content: existing.content + delta,
          });
        } else {
          const subgroups = confirmedSubGroupsRef.current;
          let name = sectionId;
          if (sectionId === "scan") {
            name = "Population Relevance Assessment";
          } else if (sectionId === "synthesis") {
            name = "Equity synthesis and provocations";
          } else if (sectionId.startsWith("sg_") && subgroups) {
            const idx = parseInt(sectionId.slice(3), 10);
            name = subgroups[idx]?.name || `Sub-group ${idx + 1}`;
          }
          next.set(sectionId, { id: sectionId, name, content: delta });
          newSectionsRef.current.push(sectionId);
        }
      });
      return next;
    });

    for (const sectionId of newSectionsRef.current) {
      if (sectionId === "scan") {
        setActiveSection("scan");
        setStreamingSection("scan");
      }
    }
  }, []);

  const lastProcessedDataIdx = useRef(-1);

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
    body: {
      stage,
      spec_state: specMeta,
      confirmed_subgroups: confirmedSubGroups,
    },
    streamProtocol: "data",
  });

  useEffect(() => {
    if (!data || data.length === 0) return;

    const specParsed = parseSpecFromData(data);
    if (specParsed) {
      setSpecMeta(specParsed);
    }

    const startIdx = lastProcessedDataIdx.current + 1;
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
        setProposedSubGroups(proposed);
        setConfirmedSubGroups(proposed.subgroups);
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
            setActiveSection("scan");
            streamingSectionRef.current = "scan";
            setStreamingSection("scan");
          } else {
            const sectionId =
              step === "synthesis" ? "synthesis" : `sg_${index ?? 0}`;
            streamingSectionRef.current = sectionId;
            setStreamingSection(sectionId);
            const current = activeSectionRef.current;
            const lastStreamed = lastStreamedSectionRef.current;
            if (current === null || current === lastStreamed) {
              setActiveSection(sectionId);
            }
          }
        }

        if (status === "complete" || status === "error") {
          flushPendingDeltas();
          lastStreamedSectionRef.current = streamingSectionRef.current;
          streamingSectionRef.current = null;
          setStreamingSection(null);
          setActiveEvidenceSearch(null);
        }

        setAnalysisProgress((prev) => {
          const steps = [...prev.steps];
          const existing = steps.findIndex(
            (s) => s.step === step && s.index === index,
          );

          if (existing >= 0) {
            const merged = { ...steps[existing], status };
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

          return { steps, isComplete };
        });
      }

      if (eventType === "evidence_search") {
        setActiveEvidenceSearch(item.query as string);
      }

      if (eventType === "evidence_search_complete") {
        setActiveEvidenceSearch(null);
        setEvidenceSearchCount((prev) => prev + 1);
      }

      if (eventType === "analysis_checkpoint") {
        checkpointReachedRef.current = true;
      }

      if (eventType === "stage_transition") {
        const newStage = item.stage as ConversationStage;
        setStage(newStage);
        setActiveEvidenceSearch(null);
        setStreamingSection(null);

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
  }, [data, setMessages, flushPendingDeltas]);

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
      evidenceSearchCount,
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
    evidenceSearchCount,
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
    setEvidenceSearchCount(0);
    setAnalysisSections(new Map());
    setActiveSection(null);
    setStreamingSection(null);
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
    setEvidenceSearchCount(0);
    setAnalysisSections((prev) => {
      const scanSection = prev.get("scan");
      if (scanSection) {
        const next = new Map<string, AnalysisSection>();
        next.set("scan", scanSection);
        return next;
      }
      return new Map();
    });
    setActiveSection(null);
    setStreamingSection(null);

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
    setActiveSection(sectionId);
  }, []);

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
          evidenceSearchCount={evidenceSearchCount}
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
            />
          </div>
        )}
      </div>
    </div>
  );
}
