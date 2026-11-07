"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheckBig } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { callApp, isInTownPass, type ReportDraft } from "@/lib/townpass-bridge";
import {
  ApiError,
  clearToken,
  createQuestion,
  getToken,
  uploadAudio,
  uploadImage,
  type Category,
} from "@/lib/forum-api";
import VoiceRecorder, { type VoiceClip } from "./voice-recorder";

const inputClass =
  "w-full rounded-2xl border border-tp-gray-100 bg-white px-4 py-3 text-[17px] text-tp-gray-900 outline-none placeholder:text-tp-gray-400 focus:border-tp-primary-500";

export default function NewPostForm() {
  const searchParams = useSearchParams();
  const isAppReport = searchParams.get("source") === "app-report";

  // 一般發文不選分類，交給後端自動分類；App 的問題回報固定是 app_usage
  const [category, setCategory] = useState<Category | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState<string | null>(null); // data URL
  const [audio, setAudio] = useState<VoiceClip | null>(null);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(isAppReport);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  // App 的標題列已顯示網頁 <title>，在 App 內就不再顯示頁面自己的標題
  const [inApp, setInApp] = useState(false);
  const requested = useRef(false);
  // 一般發文的防重送 ID；問題回報用草稿 ID
  const fallbackRequestId = useRef<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只能在 client 判斷是否在 App 內
    setInApp(isInTownPass());
  }, []);

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
        if (audio) {
          const media = await uploadAudio(token, audio.blob, audio.seconds);
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

  const header = inApp ? null : (
    <header className="flex h-16 shrink-0 items-center px-4">
      <h1 className="text-[17px] leading-tight font-bold text-tp-gray-950">發表文章</h1>
    </header>
  );

  if (loadingDraft) {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <span className="size-10 animate-spin rounded-full border-4 border-tp-primary-500 border-t-transparent" />
          <p className="text-[17px] text-tp-gray-700">正在載入回報內容…</p>
        </div>
      </>
    );
  }

  if (doneId) {
    return (
      <>
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <CircleCheckBig className="size-14 text-tp-success" />
          <p className="text-[19px] font-bold text-tp-gray-900">已發表</p>
          <p className="text-[13px] text-tp-gray-400">問題 ID：{doneId}</p>
          <Link
            href="/"
            className="mt-2 w-full max-w-xs rounded-2xl bg-tp-primary-500 py-4 text-[20px] font-bold text-white active:bg-tp-primary-600"
          >
            回首頁
          </Link>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      {header}

      <div className={cn("flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-4", inApp && "pt-4")}>
        {isAppReport && !draft && (
          <p className="rounded-2xl bg-tp-secondary-50 px-4 py-3 text-[15px] leading-snug text-tp-secondary-800 ring-1 ring-tp-secondary-200">
            沒有讀到回報草稿（可能已讀取過、超過 10 分鐘，或不在 App 內開啟），請手動填寫。
          </p>
        )}

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
          placeholder="內容"
          maxLength={5000}
          required={!image && !audio}
          // 填滿剩餘高度；有截圖時至少保留約 10 行
          className={cn(inputClass, "min-h-64 flex-1 shrink-0 resize-none")}
        />

        {image && (
          <figure className="flex flex-col items-start gap-2">
            {/* data URL 不需要 next/image 最佳化 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="問題截圖" className="max-h-96 rounded-2xl border border-tp-gray-100" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="min-h-10 text-[15px] font-medium text-tp-warn-200"
            >
              移除截圖
            </button>
          </figure>
        )}

        <VoiceRecorder value={audio} onChange={setAudio} disabled={submitting} />

        {draft && (
          <details className="rounded-2xl border border-tp-gray-100 bg-white px-4 py-3">
            <summary className="cursor-pointer text-[15px] text-tp-gray-700">裝置資訊（會一併送出）</summary>
            <pre className="mt-2 overflow-auto rounded-xl bg-tp-gray-50 p-2 text-[12px] whitespace-pre-wrap text-tp-gray-700">
              {JSON.stringify(draft.context, null, 2)}
            </pre>
          </details>
        )}

        {error && <p className="text-[15px] text-tp-warn-200">發文失敗：{error}</p>}
      </div>

      <div className="shrink-0 border-t border-tp-gray-100 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-tp-primary-500 py-4 text-[20px] font-bold text-white active:bg-tp-primary-600 disabled:opacity-50"
        >
          {submitting ? "送出中…" : "發表"}
        </button>
      </div>
    </form>
  );
}
