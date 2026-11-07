import type { Metadata } from "next";
import LineApp from "@/app/ui/line/line-app";

export const metadata: Metadata = {
  title: "我要發問",
  description: "直接開啟新問題聊天室；App 問題回報（?source=app-report）會帶入截圖與裝置資訊",
};

export default function NewQuestionPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-tp-gray-200 font-sans sm:p-4">
      <LineApp ask />
    </main>
  );
}
