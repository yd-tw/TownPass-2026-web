import type { Metadata } from "next";
import { Suspense } from "react";
import NewPostForm from "./new-post-form";

export const metadata: Metadata = { title: "發表文章" };

export default function NewPostPage() {
  // 外框和首頁、/chat 一致：手機寬度的 App 框，桌面版置中加圓角陰影
  return (
    <main className="flex flex-1 items-center justify-center bg-tp-gray-200 font-sans sm:p-4">
      <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-tp-gray-50 sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-[2.25rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10">
        {/* useSearchParams 需要 Suspense 包住，否則 production build 會失敗 */}
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <span className="size-8 animate-spin rounded-full border-3 border-tp-primary-500 border-t-transparent" />
            </div>
          }
        >
          <NewPostForm />
        </Suspense>
      </div>
    </main>
  );
}
