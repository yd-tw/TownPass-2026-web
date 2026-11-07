import type { Metadata } from "next";
import LineApp from "@/app/ui/line/line-app";

export const metadata: Metadata = {
  title: "LINE 風格聊天室",
  description: "仿 LINE 手機版的聊天列表與聊天室，透過 socket.io 即時聊天",
};

export default function ChatPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-claude-sand font-sans sm:p-4">
      <LineApp />
    </main>
  );
}
