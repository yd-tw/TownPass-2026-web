"use client";

import { MapPin, MessageCircle, Search, X } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/app/ui/line/avatar";
import type { QuestionDetail } from "@/app/ui/line/api/types";

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
}: {
  questions: QuestionDetail[];
  nickname: string;
  now: number;
  loading: boolean;
  onAsk: () => void;
  onOpen: (id: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const visible = questions.filter((question) =>
    !query || [question.body ?? "", ...(question.tags ?? [])].join(" ").toLowerCase().includes(query),
  );

  function closeSearch() {
    setSearch("");
    setSearchOpen(false);
  }

  return (
    <div className="relative flex h-full flex-col bg-claude-ivory">
      <header className="flex h-16 shrink-0 items-center justify-between px-4">
        <h1 className="text-[22px] font-bold tracking-tight text-claude-ink">討論串</h1>
        <button
          type="button"
          aria-label="搜尋討論串"
          aria-expanded={searchOpen}
          onClick={() => searchOpen ? closeSearch() : setSearchOpen(true)}
          className="flex size-11 items-center justify-center rounded-full text-claude-ink hover:bg-claude-sand/60"
        >
          <Search className="size-6" />
        </button>
      </header>

      {searchOpen && (
        <div className="absolute top-14 right-4 left-4 z-10 flex h-12 items-center gap-2 rounded-xl border border-claude-sand bg-white px-3 shadow-lg">
          <Search className="size-5 shrink-0 text-stone-500" />
          <input
            autoFocus
            aria-label="搜尋問題或標籤"
            placeholder="搜尋問題或標籤"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") closeSearch(); }}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          <button type="button" aria-label="關閉搜尋" onClick={closeSearch} className="p-1 text-stone-500"><X className="size-5" /></button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={onAsk}
          className="w-full px-4 py-3 text-left hover:bg-claude-sand/35"
        >
          <span className="flex items-center gap-2.5"><Avatar name={nickname} size={40} /><span className="text-[15px] text-stone-500">有什麼問題？</span></span>
        </button>

        {loading && <p className="py-12 text-center text-[15px] text-stone-500">載入討論中…</p>}
        {!loading && visible.length === 0 && <p className="py-12 text-center text-[15px] text-stone-500">{query ? "找不到符合的討論" : "目前沒有討論串"}</p>}
        {visible.map((question) => (
          <button
            type="button"
            key={question.id}
            onClick={() => onOpen(question.id)}
            className="block w-full px-4 py-3 text-left transition-colors hover:bg-claude-sand/35 active:bg-claude-sand/55"
          >
            <span className="flex gap-2.5">
              <Avatar name={question.author.nickname} size={40} />
              <span className="flex flex-col">
                <span className="block line-clamp-3 text-[15px] leading-relaxed whitespace-pre-wrap text-stone-800">{question.body ?? "內容待確認"}</span>
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-stone-500">
                  <span className="flex items-center gap-1" aria-label={`${question.answer_count} 則留言`}><MessageCircle className="size-4" />{question.answer_count}</span>
                  {question.location_sharing !== "off" && <span aria-label="已開啟附近通知" title="已開啟附近通知"><MapPin className="size-4" /></span>}
                  <time dateTime={question.created_at} className="whitespace-nowrap">{timeAgo(question.created_at, now)}</time>
                  {(question.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className="rounded-md bg-claude/10 px-1.5 py-1 font-semibold text-claude-dark">#{tag.replace(/^#/, "")}</span>)}
                </span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
