import type { Metadata } from "next";
import LineApp from "@/app/ui/line/line-app";

export const metadata: Metadata = {
  title: "我要發問",
  description: "發問者用的 LINE 風格介面：只看得到自己的問題，可以打字、拍照或錄音發問",
};

export default function ChatPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-claude-sand font-sans sm:p-4">
      <LineApp />
    </main>
  );
}
