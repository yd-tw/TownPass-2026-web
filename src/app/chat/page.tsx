import type { Metadata } from "next";
import LineApp from "@/app/ui/line/line-app";

export const metadata: Metadata = {
  title: "聊天",
  description: "查看自己的問題與聊天室，並發出新問題",
};

export default function ChatPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-tp-gray-200 font-sans sm:p-4">
      <LineApp />
    </main>
  );
}
