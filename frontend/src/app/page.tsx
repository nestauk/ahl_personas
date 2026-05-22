"use client";

import dynamic from "next/dynamic";

const ChatContainer = dynamic(
  () =>
    import("@/components/chat/ChatContainer").then((mod) => mod.ChatContainer),
  { ssr: false },
);

export default function Home() {
  return <ChatContainer />;
}
