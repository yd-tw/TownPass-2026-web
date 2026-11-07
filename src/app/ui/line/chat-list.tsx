"use client";

import { MessageCircleQuestion, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Answer, QuestionDetail, QuestionSummary } from "./api/types";
import { QuestionAvatar } from "./avatar";
import { questionTags } from "./categories";
import { answerPreview, formatListTime } from "./format";
import { useBackLayer } from "./use-back-layer";

/*
 * 長輩版的列表刻意只留「搜尋」和「我要發問」：
 * 篩選標籤、排序、隱藏問題對只問過幾題的人來說都是干擾，
 * 而且隱藏後沒有地方找回來。最近有動靜的問題排在最上面。
 */

export type ChatListActions = {
  onOpen: (id: string) => void;
  onAsk: () => void;
};

type Row = {
  q: QuestionSummary;
  body: string;
  last: Answer | undefined;
  lastAt: string;
  /** 群組人數：自己＋回答過的人 */
  members: number;
};

export function ChatList({
  questions,
  details,
  answers,
  meId,
  now,
  loading,
  note,
  actions,
}: {
  questions: QuestionSummary[];
  details: Record<string, QuestionDetail>;
  answers: Record<string, Answer[]>;
  meId: string;
  now: number;
  loading: boolean;
  note?: string | null;
  actions: ChatListActions;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions
      .map((question): Row => {
        const list = answers[question.id] ?? [];
        const last = list.at(-1);
        return {
          q: question,
          body: details[question.id]?.body ?? (question.has_audio ? "（語音提問）" : question.has_video ? "（影片提問）" : "（附件提問）"),
          last,
          lastAt: last?.created_at ?? question.created_at,
          members:
            1 +
            new Set(list.filter((a) => a.author.id !== meId).map((a) => a.author.id))
              .size,
        };
      })
      .filter((r) => {
        if (!q) return true;
        if (r.body.toLowerCase().includes(q)) return true;
        if (questionTags(r.q).some((tag) => tag.toLowerCase().includes(q))) return true;
        return (answers[r.q.id] ?? []).some((a) =>
          (a.body ?? "").toLowerCase().includes(q),
        );
      })
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [questions, details, answers, meId, query]);

  return (
    <div className="relative flex h-full flex-col bg-tp-gray-50">
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="px-4 pt-4 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-tp-gray-100/70 px-3.5 text-tp-gray-600">
          <Search className="size-5 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋我的問題"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-tp-gray-950 outline-none placeholder:text-tp-gray-600"
          />
          {query && (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => setQuery("")}
              className="flex size-8 items-center justify-center rounded-full bg-tp-gray-400 text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      <ul className="divide-y divide-tp-gray-100 pb-24">
        {loading && (
          <li className="px-4 py-16 text-center text-[15px] text-tp-gray-600">
            載入中…
          </li>
        )}
        {!loading && rows.length === 0 && (
          <li className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <p className="text-[15px] text-tp-gray-600">
              {query ? "找不到符合的問題" : "還沒有問過問題"}
            </p>
            {!query && (
              <button
                type="button"
                onClick={actions.onAsk}
                className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-tp-primary-500 px-8 text-[18px] font-bold text-white shadow-sm active:bg-tp-primary-600"
              >
                <MessageCircleQuestion className="size-6" />
                我要發問
              </button>
            )}
          </li>
        )}
        {rows.map((row) => (
          <QuestionRow
            key={row.q.id}
            row={row}
            meId={meId}
            now={now}
            onOpen={() => actions.onOpen(row.q.id)}
          />
        ))}
      </ul>
      {note && <p className="px-4 pb-5 text-center text-[12px] text-tp-gray-600">{note}</p>}
      </div>

      {/* 我要發問：浮在右下角，拇指最好按到的位置 */}
      {(questions.length > 0 || query.trim()) && <button
        type="button"
        onClick={actions.onAsk}
        className="absolute right-4 bottom-4 z-20 flex h-14 items-center gap-2 rounded-full bg-tp-primary-500 pr-6 pl-5 text-[18px] font-bold text-white shadow-lg ring-1 ring-black/5 active:bg-tp-primary-600"
      >
        <Plus className="size-6" strokeWidth={2.8} />
        我要發問
      </button>}
    </div>
  );
}

function StatusChip({ q }: { q: QuestionSummary }) {
  if (q.status === "resolved") {
    return (
      <span className="shrink-0 rounded-md bg-tp-gray-500/15 px-1.5 text-[12px] leading-5 font-medium text-tp-gray-700">
        已解決
      </span>
    );
  }
  if (q.status === "in_progress") {
    return (
      <span className="shrink-0 rounded-md bg-tp-secondary-500/15 px-1.5 text-[12px] leading-5 font-medium text-tp-secondary-800">
        協助中
      </span>
    );
  }
  return null;
}

function QuestionRow({
  row,
  meId,
  now,
  onOpen,
}: {
  row: Row;
  meId: string;
  now: number;
  onOpen: () => void;
}) {
  const { q, last } = row;
  const preview = last ? answerPreview(last, meId) : "已送出，等待熱心的人回答";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-tp-gray-100/40 active:bg-tp-gray-100/60"
      >
        <QuestionAvatar q={q} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[15px] font-semibold text-tp-gray-950">
              {row.body}
            </span>
            {row.members > 1 && (
              <span className="shrink-0 text-[15px] text-tp-gray-600">
                ({row.members})
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusChip q={q} />
            <p className="truncate text-[15px] text-tp-gray-600">
              {preview.replace(/\n/g, " ")}
            </p>
          </div>
        </div>
        <span className="shrink-0 self-start pt-0.5 text-[12px] text-tp-gray-600 max-[300px]:hidden">
          {formatListTime(Date.parse(row.lastAt), now)}
        </span>
      </button>
    </li>
  );
}

/**
 * 發問視窗：分類只是一個小小的下拉選單（預設「未分類」，之後由志工分流），
 * 主角是大大的「發問」按鈕；按下後進入空的群組，用打字、拍照或錄音說明問題。
 */
export function AskSheet({
  onAsk,
  onClose,
}: {
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <div className="px-5 pt-6 pb-4">
        <h2 className="text-center text-[20px] font-bold">我要發問</h2>
        <p className="mt-1.5 text-center text-[15px] leading-relaxed text-tp-gray-700">
          按下「發問」後，
          <br />
          可以打字、拍照或錄音說明您的問題
        </p>
        <button
          type="button"
          onClick={onAsk}
          className="mt-4 w-full rounded-2xl bg-tp-primary-500 py-4 text-[20px] font-bold text-white shadow-sm active:bg-tp-primary-600"
        >
          發問
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-3 text-[15px] text-tp-gray-700"
        >
          取消
        </button>
      </div>
    </Sheet>
  );
}

/** 底部彈出視窗；手機的返回鍵也能關掉 */
export function Sheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  useBackLayer(true, onClose);
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 animate-in fade-in"
      />
      <div className="relative max-h-[90%] overflow-y-auto rounded-t-2xl bg-tp-gray-50 pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
        {children}
      </div>
    </div>
  );
}

/** 圖示按鈕：預設 48px，符合長輩好按的大小 */
export function IconButton({
  label,
  onClick,
  children,
  className,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-12 shrink-0 items-center justify-center rounded-full text-tp-gray-900 transition-colors hover:bg-black/5 active:bg-black/10 disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
