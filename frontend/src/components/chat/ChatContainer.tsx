"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONValue } from "ai";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { TaxonomyHints } from "./TaxonomyHints";
import { EvidenceSearchIndicator } from "./EvidenceSearchIndicator";
import { Header } from "../ui/Header";
import { SpecificationSidebar } from "../specification/SpecificationSidebar";
import { buildSpecBlock, buildSpecMarkdown } from "@/lib/spec-helpers";
import {
  EMPTY_SPEC,
  TAXONOMY,
  createEmptyAnalysisProgress,
  type AnalysisProgress,
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
  const [stage, setStage] = useState<ConversationStage>("specifying");
  const [specMeta, setSpecMeta] = useState<SpecMetadata>({
    spec: { ...EMPTY_SPEC },
    active_characteristic: null,
    policy_name: null,
    policy_description: null,
  });
  const [proposedSubGroups, setProposedSubGroups] =
    useState<ProposedSubGroups | null>(null);
  const [confirmedSubGroups, setConfirmedSubGroups] = useState<
    SubGroup[] | null
  >(null);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress>(
    createEmptyAnalysisProgress(),
  );
  const [activeEvidenceSearch, setActiveEvidenceSearch] = useState<
    string | null
  >(null);

  const specMetaRef = useRef(specMeta);
  specMetaRef.current = specMeta;

  const stageRef = useRef(stage);
  stageRef.current = stage;

  const confirmedSubGroupsRef = useRef(confirmedSubGroups);
  confirmedSubGroupsRef.current = confirmedSubGroups;

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

    for (const item of data) {
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

      if (eventType === "analysis_step") {
        const step = item.step as AnalysisStep["step"];
        const status = item.status as AnalysisStep["status"];
        const index = item.index as number | undefined;
        const name = item.name as string | undefined;

        setAnalysisProgress((prev) => {
          const steps = [...prev.steps];
          const existing = steps.findIndex(
            (s) => s.step === step && s.index === index,
          );
          const updated: AnalysisStep = { step, index, name, status };

          if (existing >= 0) {
            steps[existing] = { ...steps[existing], ...updated };
          } else {
            steps.push(updated);
          }

          const isComplete =
            steps.length > 0 &&
            steps.every((s) => s.status === "complete" || s.status === "error");

          return { steps, isComplete };
        });

        if (status === "active" || status === "complete" || status === "error") {
          setActiveEvidenceSearch(null);
        }
      }

      if (eventType === "evidence_search") {
        setActiveEvidenceSearch(item.query as string);
      }

      if (eventType === "stage_transition") {
        const newStage = item.stage as ConversationStage;
        setStage(newStage);
        setActiveEvidenceSearch(null);
      }
    }
  }, [data]);

  const handleNewSession = useCallback(() => {
    setMessages([]);
    setStage("specifying");
    setSpecMeta({
      spec: { ...EMPTY_SPEC },
      active_characteristic: null,
      policy_name: null,
      policy_description: null,
    });
    setData(undefined);
    setProposedSubGroups(null);
    setConfirmedSubGroups(null);
    setAnalysisProgress(createEmptyAnalysisProgress());
    setActiveEvidenceSearch(null);
  }, [setMessages, setData]);

  const handleProceed = useCallback(() => {
    const currentMeta = specMetaRef.current;
    const md = buildSpecMarkdown(
      currentMeta.spec,
      currentMeta.policy_name,
      TAXONOMY,
    );
    const specBlock = buildSpecBlock(currentMeta);
    const confirmationContent = md + specBlock;

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
          "I've confirmed the policy specification. Please scan the modifier relevance and propose sub-groups for equity impact analysis.",
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
    setAnalysisProgress({
      steps: [...subgroupSteps, synthesisStep],
      isComplete: false,
    });

    append({
      role: "user",
      content: `Run the equity impact analysis for the ${subgroups.length} confirmed sub-groups.`,
    });
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

  const handleInsertHint = useCallback(
    (text: string) => {
      setInput((prev: string) => (prev ? `${prev}, ${text}` : text));
    },
    [setInput],
  );

  return (
    <div className="flex h-screen flex-col">
      <Header onNewSession={handleNewSession} stage={stage} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <MessageList
            messages={messages}
            isLoading={isLoading}
            stage={stage}
            onSelectPolicy={handleSelectPolicy}
          />
          <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
            {stage === "specifying" && (
              <div className="mx-auto max-w-3xl px-6 pt-3">
                <TaxonomyHints
                  activeCharacteristic={specMeta.active_characteristic}
                  onInsertHint={handleInsertHint}
                />
              </div>
            )}
            {activeEvidenceSearch && (
              <div className="mx-auto max-w-3xl px-6 pt-2">
                <EvidenceSearchIndicator query={activeEvidenceSearch} />
              </div>
            )}
            <ChatInput
              input={input}
              isLoading={isLoading}
              onInputChange={handleInputChange}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
        <SpecificationSidebar
          spec={specMeta.spec}
          stage={stage}
          activeCharacteristic={specMeta.active_characteristic}
          policyName={specMeta.policy_name}
          policyDescription={specMeta.policy_description}
          onProceed={handleProceed}
          proposedSubGroups={proposedSubGroups}
          confirmedSubGroups={confirmedSubGroups}
          analysisProgress={analysisProgress}
          onRunAnalysis={handleRunAnalysis}
          onRemoveSubGroup={handleRemoveSubGroup}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
