"use client";

import { MapPin, MessageCircle, Search, X } from "lucide-react";
import { Avatar } from "@/app/ui/line/avatar";
import type { QuestionDetail } from "@/app/ui/line/api/types";
import { categoryLabel } from "@/app/ui/line/categories";
import { cn } from "@/lib/utils";

function timeAgo(value: string, now: number) {
  const minutes = Math.max(1, Math.floor((now - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

export function ForumFeed({
  questions,
  baseQuestions,
  search,
  onSearchChange,
  onLoadMore,
  hasMore,
  loadingMore,
  nickname,
  now,
  loading,
  onAsk,
  onOpen,
}: {
  questions: QuestionDetail[];
  baseQuestions: QuestionDetail[];
  search: string;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  nickname: string;
  now: number;
  loading: boolean;
  onAsk: () => void;
  onOpen: (id: string) => void;
}) {
  const query = search.trim().toLowerCase();
  const ids = new Set(questions.map((question) => question.id));
  const visible = query
    ? [
        ...questions,
        ...baseQuestions.filter((question) => !ids.has(question.id) && (question.body ?? "").toLowerCase().includes(query)),
      ]
    : questions;

  return (
    <div className="relative flex h-full flex-col bg-tp-gray-50">
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const list = event.currentTarget;
          if (hasMore && !loading && !loadingMore && list.scrollHeight - list.scrollTop - list.clientHeight < 180) onLoadMore();
        }}
      >
      <div className="px-4 pt-4 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-tp-gray-100/70 px-3.5 text-tp-gray-600">
          <Search className="size-5 shrink-0" />
          <input
            aria-label="搜尋標籤與已載入的問題內容"
            placeholder="搜尋標籤或問題內容"
            value={search}
            maxLength={50}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") onSearchChange(""); }}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-tp-gray-950 outline-none placeholder:text-tp-gray-600"
          />
          {search && (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => onSearchChange("")}
              className="flex size-8 items-center justify-center rounded-full bg-tp-gray-400 text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
        {query && <p className="px-1 pt-2 text-[12px] text-tp-gray-600">標籤搜尋全部討論；內文搜尋已載入的討論</p>}
      </div>

        <button
          type="button"
          onClick={onAsk}
          className="w-full px-4 py-3 text-left hover:bg-tp-gray-100/35"
        >
          <span className="flex items-center gap-2.5"><Avatar name={nickname} size={40} /><span className="text-[15px] text-tp-gray-600">有什麼問題？</span></span>
        </button>

        {loading && <p className="py-12 text-center text-[15px] text-tp-gray-600">載入討論中…</p>}
        {!loading && visible.length === 0 && (
          <p className="py-12 text-center text-[15px] text-tp-gray-600">
            {query ? "找不到符合的討論" : "目前沒有討論串"}
          </p>
        )}
        {visible.map((question) => (
          <button
            type="button"
            key={question.id}
            onClick={() => onOpen(question.id)}
            className="block w-full px-4 py-3 text-left transition-colors hover:bg-tp-gray-100/35 active:bg-tp-gray-100/55"
          >
            <span className="flex gap-2.5">
              <span className="flex shrink-0 flex-col items-center gap-1">
                <Avatar name={question.author.nickname} size={40} />
                {question.author.role === "bot" && <span className="text-[11px] font-semibold text-tp-primary-500">機器人</span>}
              </span>
              <span className="min-w-0 flex flex-col">
                <span className="block line-clamp-3 text-[15px] leading-relaxed whitespace-pre-wrap text-tp-gray-900">{question.body ?? "內容待確認"}</span>
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-tp-gray-600">
                  <span className="flex items-center gap-1" aria-label={`${question.answer_count} 則留言`}><MessageCircle className="size-4" />{question.answer_count}</span>
                  {question.location_sharing !== "off" && <span aria-label="已開啟附近通知" title="已開啟附近通知"><MapPin className="size-4" /></span>}
                  <time dateTime={question.created_at} className="whitespace-nowrap">{timeAgo(question.created_at, now)}</time>
                  <span
                    className={cn(
                      "font-semibold",
                      question.category === "uncategorized"
                        ? "text-tp-secondary-800"
                        : "text-tp-gray-800",
                    )}
                  >
                    #{categoryLabel(question.category)}
                  </span>
                  {(question.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className="font-semibold text-tp-primary-500">#{tag.replace(/^#/, "")}</span>)}
                </span>
              </span>
            </span>
          </button>
        ))}
        {hasMore && !loading && (
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="min-h-11 w-full text-[15px] font-medium text-tp-primary-500 disabled:opacity-50">
            {loadingMore ? "載入更多討論…" : "載入更多討論"}
          </button>
        )}
      </div>
    </div>
  );
}
