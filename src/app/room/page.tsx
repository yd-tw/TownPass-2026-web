import type { Metadata } from "next";
import LineApp from "@/app/ui/line/line-app";

export const metadata: Metadata = {
  title: "討論串",
  description: "直接開啟指定討論串的聊天室",
};

export default function RoomPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-tp-gray-200 font-sans sm:p-4">
      <LineApp />
    </main>
  );
}
