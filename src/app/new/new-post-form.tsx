"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { callApp, isInTownPass, type ReportDraft } from "@/lib/townpass-bridge";
import {
  ApiError,
  CATEGORY_LABEL,
  clearToken,
  createQuestion,
  getToken,
  uploadImage,
  type Category,
} from "@/lib/forum-api";

const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-white/15 dark:bg-zinc-900";

export default function NewPostForm() {
  const searchParams = useSearchParams();
  const isAppReport = searchParams.get("source") === "app-report";

  const [category, setCategory] = useState<Category>("other");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null); // data URL
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(isAppReport);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const requested = useRef(false);
  // 一般發文的防重送 ID；問題回報用草稿 ID
  const fallbackRequestId = useRef<string | null>(null);

  useEffect(() => {
    // 草稿只能讀一次：Strict Mode 下 effect 會跑兩次，用 ref 防止第二次讀到 null
    if (!isAppReport || requested.current) return;
    requested.current = true;

    if (!isInTownPass()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 只能在 client 判斷是否在 App 內
      setLoadingDraft(false);
      return;
    }

    callApp<ReportDraft | null>("report_draft").then((d) => {
      setLoadingDraft(false);
      if (!d) return; // 已讀過、逾時（10 分鐘）或網域不符
      setDraft(d);
      setCategory("app_usage");
      setTitle(d.description ? `[問題回報] ${d.description.slice(0, 30)}` : "[問題回報]");
      setContent(d.description);
      setImage(d.image);
    });
  }, [isAppReport]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      let token = await getToken();

      const send = async () => {
        const media_ids: string[] = [];
        if (image) {
          const blob = await (await fetch(image)).blob(); // data URL → Blob
          const media = await uploadImage(token, blob, `report-${draft?.id ?? Date.now()}.png`);
          media_ids.push(media.id);
        }
        fallbackRequestId.current ??= crypto.randomUUID();
        return createQuestion(token, {
          title: title.trim().slice(0, 80) || undefined,
          body: content.trim() || undefined,
          media_ids: media_ids.length ? media_ids : undefined,
          language: "zh-TW",
          category,
          assistance_mode: "online",
          location_sharing: "off",
          // 裝置資訊放 context.extra，不併入內文
          context: draft
            ? {
                service_id: "townpass-app",
                service_name: "Town Pass",
                page_route: draft.context.route.split("?")[0],
                extra: { reportId: draft.id, ...draft.context },
              }
            : null,
          client_request_id: (draft?.id ?? fallbackRequestId.current).slice(0, 64),
        });
      };

      let question;
      try {
        question = await send();
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
        clearToken(); // token 失效：重建工作階段再試一次
        token = await getToken();
        question = await send();
      }
      setDoneId(question.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingDraft) {
    return <p className="p-4 text-sm text-zinc-500">正在載入回報內容…</p>;
  }

  if (doneId) {
    return (
      <div className="flex w-full max-w-lg flex-col items-center gap-3 rounded-2xl border border-black/10 bg-white p-6 text-center shadow-sm dark:border-white/15 dark:bg-zinc-900">
        <p className="font-semibold">已發表 ✓</p>
        <p className="text-xs text-zinc-500">問題 ID：{doneId}</p>
        <Link href="/" className="text-sm underline">
          回首頁
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-lg flex-col gap-4 self-start rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/15 dark:bg-zinc-900"
    >
      <h1 className="text-lg font-semibold">發表文章</h1>

      {isAppReport && !draft && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          沒有讀到回報草稿（可能已讀取過、超過 10 分鐘，或不在 App 內開啟），請手動填寫。
        </p>
      )}

      <select value={category} onChange={(e) => setCategory(e.target.value as Category)} className={inputClass}>
        {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="標題（選填，未填時取內容前 30 字）"
        maxLength={80}
        className={inputClass}
      />

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="內容"
        maxLength={5000}
        required={!image}
        className={inputClass}
      />

      {image && (
        <figure className="flex flex-col items-start gap-2">
          {/* data URL 不需要 next/image 最佳化 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="問題截圖" className="max-h-96 rounded-lg border border-black/10" />
          <button type="button" onClick={() => setImage(null)} className="text-xs text-red-600 underline">
            移除截圖
          </button>
        </figure>
      )}

      {draft && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">裝置資訊（會一併送出）</summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
            {JSON.stringify(draft.context, null, 2)}
          </pre>
        </details>
      )}

      {error && <p className="text-sm text-red-600">發文失敗：{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
      >
        {submitting ? "送出中…" : "發表"}
      </button>
    </form>
  );
}
