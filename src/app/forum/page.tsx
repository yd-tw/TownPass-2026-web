import type { Metadata } from "next";
import LineApp from "@/app/ui/line/line-app";

export const metadata: Metadata = {
  title: "討論串",
  description: "瀏覽即時討論串並加入對話",
};

export default function ForumPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-tp-gray-200 font-sans sm:p-4">
      <LineApp />
    </main>
  );
}
