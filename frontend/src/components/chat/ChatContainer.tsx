"use client";

import { useChat } from "ai/react";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { Header } from "../ui/Header";

export function ChatContainer() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
  } = useChat({
    api: "http://localhost:8000/api/v1/chat",
    streamProtocol: "text",
  });

  const handleNewSession = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-screen flex-col">
      <Header onNewSession={handleNewSession} />
      <MessageList messages={messages} isLoading={isLoading} />
      <ChatInput
        input={input}
        isLoading={isLoading}
        onInputChange={handleInputChange}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
