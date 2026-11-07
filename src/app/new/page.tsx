import type { Metadata } from "next";
import { Suspense } from "react";
import NewPostForm from "./new-post-form";

export const metadata: Metadata = { title: "發表文章" };

export default function NewPostPage() {
  // useSearchParams 需要 Suspense 包住，否則 production build 會失敗
  return (
    <main className="flex flex-1 justify-center bg-zinc-50 p-4 font-sans dark:bg-black">
      <Suspense fallback={<p className="p-4 text-sm text-zinc-500">載入中…</p>}>
        <NewPostForm />
      </Suspense>
    </main>
  );
}
