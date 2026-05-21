"use client";

import { useChat } from "ai/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONValue } from "ai";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { TaxonomyHints } from "./TaxonomyHints";
import { Header } from "../ui/Header";
import { SpecificationSidebar } from "../specification/SpecificationSidebar";
import { buildSpecBlock, buildSpecMarkdown } from "@/lib/spec-helpers";
import {
  EMPTY_SPEC,
  TAXONOMY,
  type ConversationStage,
  type PolicySpecification,
  type SpecMetadata,
} from "@/lib/types";

function parseSpecFromData(
  data: JSONValue[] | undefined,
): SpecMetadata | null {
  if (!data || data.length === 0) return null;
  const latest = data[data.length - 1];
  if (
    latest &&
    typeof latest === "object" &&
    !Array.isArray(latest) &&
    "spec" in latest
  ) {
    return latest as unknown as SpecMetadata;
  }
  return null;
}

export function ChatContainer() {
  const [stage, setStage] = useState<ConversationStage>("specifying");
  const [specMeta, setSpecMeta] = useState<SpecMetadata>({
    spec: { ...EMPTY_SPEC },
    active_characteristic: null,
    policy_name: null,
  });

  const specMetaRef = useRef(specMeta);
  specMetaRef.current = specMeta;

  const stageRef = useRef(stage);
  stageRef.current = stage;

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
    },
    streamProtocol: "data",
  });

  useEffect(() => {
    const parsed = parseSpecFromData(data);
    if (parsed) {
      setSpecMeta(parsed);
    }
  }, [data]);

  const handleNewSession = useCallback(() => {
    setMessages([]);
    setStage("specifying");
    setSpecMeta({
      spec: { ...EMPTY_SPEC },
      active_characteristic: null,
      policy_name: null,
    });
    setData(undefined);
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

    setStage("chatting");
  }, [setMessages]);

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
          onProceed={handleProceed}
        />
      </div>
    </div>
  );
}
