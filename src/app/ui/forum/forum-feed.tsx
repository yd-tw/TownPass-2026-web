"use client";

import { MapPin, MessageCircle, Search, X } from "lucide-react";
import { useState } from "react";
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
  nickname,
  now,
  loading,
  onAsk,
  onOpen,
  filter,
  onFilterChange,
}: {
  questions: QuestionDetail[];
  nickname: string;
  now: number;
  loading: boolean;
  onAsk: () => void;
  onOpen: (id: string) => void;
  /** 全部，或只看等志工分類的問題（GET /questions?category=uncategorized） */
  filter: "all" | "uncategorized";
  onFilterChange: (filter: "all" | "uncategorized") => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = questions.filter((question) =>
    !query || [question.body ?? "", ...(question.tags ?? [])].join(" ").toLowerCase().includes(query),
  );

  return (
    <div className="relative flex h-full flex-col bg-tp-gray-50">
      <div className="px-4 pt-4 pb-2">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-tp-gray-100/70 px-3.5 text-tp-gray-600">
          <Search className="size-5 shrink-0" />
          <input
            aria-label="搜尋問題或標籤"
            placeholder="搜尋問題或標籤"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") setSearch(""); }}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-tp-gray-950 outline-none placeholder:text-tp-gray-600"
          />
          {search && (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => setSearch("")}
              className="flex size-8 items-center justify-center rounded-full bg-tp-gray-400 text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      <div className="flex gap-2 px-4 pb-2" role="group" aria-label="篩選討論串">
        {(
          [
            ["all", "全部"],
            ["uncategorized", "待分類"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => onFilterChange(id)}
            className={cn(
              "min-h-10 rounded-full border px-4 text-[15px] font-medium transition-colors",
              filter === id
                ? "border-tp-primary-700 bg-tp-primary-700 text-white"
                : "border-tp-gray-100 text-tp-gray-800 hover:bg-tp-gray-100/40",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
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
            {query
              ? "找不到符合的討論"
              : filter === "uncategorized"
                ? "目前沒有待分類的問題，謝謝大家！"
                : "目前沒有討論串"}
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
              <Avatar name={question.author.nickname} size={40} />
              <span className="flex flex-col">
                <span className="block line-clamp-3 text-[15px] leading-relaxed whitespace-pre-wrap text-tp-gray-900">{question.body ?? "內容待確認"}</span>
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-tp-gray-600">
                  <span className="flex items-center gap-1" aria-label={`${question.answer_count} 則留言`}><MessageCircle className="size-4" />{question.answer_count}</span>
                  {question.location_sharing !== "off" && <span aria-label="已開啟附近通知" title="已開啟附近通知"><MapPin className="size-4" /></span>}
                  <time dateTime={question.created_at} className="whitespace-nowrap">{timeAgo(question.created_at, now)}</time>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-1 font-semibold",
                      question.category === "uncategorized"
                        ? "bg-tp-secondary-100 text-tp-secondary-800"
                        : "bg-tp-gray-100 text-tp-gray-800",
                    )}
                  >
                    {categoryLabel(question.category)}
                  </span>
                  {(question.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className="rounded-md bg-tp-primary-500/10 px-1.5 py-1 font-semibold text-tp-primary-700">#{tag.replace(/^#/, "")}</span>)}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
