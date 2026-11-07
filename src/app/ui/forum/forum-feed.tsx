"use client";

import { LoaderCircle, MapPin, MessageCircle, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { Avatar } from "@/app/ui/line/avatar";
import type { QuestionDetail } from "@/app/ui/line/api/types";
import { questionTags } from "@/app/ui/line/categories";
import { AudioBubble, ImageBubble, Lightbox, VideoBubble } from "@/app/ui/line/media";
import { useBackLayer } from "@/app/ui/line/use-back-layer";

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
  onRefresh,
  hasUpdates,
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
  onRefresh: () => Promise<void>;
  hasUpdates: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  nickname: string;
  now: number;
  loading: boolean;
  onAsk: () => void;
  onOpen: (id: string) => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullStart = useRef<{ x: number; y: number } | null>(null);
  const pullDistanceRef = useRef(0);
  useBackLayer(lightbox !== null, () => setLightbox(null));
  const query = search.trim().toLowerCase();
  const ids = new Set(questions.map((question) => question.id));
  const visible = query
    ? [
        ...questions,
        ...baseQuestions.filter((question) => !ids.has(question.id) && (question.body ?? "").toLowerCase().includes(query)),
      ]
    : questions;

  function resetPull() {
    pullStart.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }

  async function refresh() {
    if (refreshing || loading) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  function finishPull() {
    const shouldRefresh = pullDistanceRef.current >= 50;
    resetPull();
    if (shouldRefresh) void refresh();
  }

  return (
    <div className="relative flex h-full flex-col bg-tp-gray-50">
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        onScroll={(event) => {
          const list = event.currentTarget;
          if (hasMore && !loading && !loadingMore && !refreshing && list.scrollHeight - list.scrollTop - list.clientHeight < 180) onLoadMore();
        }}
        onTouchStart={(event) => {
          if (event.currentTarget.scrollTop <= 0 && !refreshing && !loading) {
            pullStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
          } else {
            pullStart.current = null;
          }
        }}
        onTouchMove={(event) => {
          const start = pullStart.current;
          if (!start) return;
          const dx = event.touches[0].clientX - start.x;
          const dy = event.touches[0].clientY - start.y;
          if (Math.abs(dx) > Math.abs(dy) || event.currentTarget.scrollTop > 0) {
            resetPull();
            return;
          }
          const distance = Math.min(72, Math.max(0, dy * 0.6));
          pullDistanceRef.current = distance;
          setPullDistance(distance);
        }}
        onTouchEnd={finishPull}
        onTouchCancel={resetPull}
      >
        <div
          aria-live="polite"
          className="flex items-center justify-center overflow-hidden text-[13px] text-tp-gray-600"
          style={{ height: refreshing ? 48 : pullDistance }}
        >
          {(refreshing || pullDistance > 0) && (
            <span className="flex items-center gap-2">
              {refreshing && <LoaderCircle className="size-4 animate-spin" />}
              {refreshing ? "正在重新整理…" : pullDistance >= 50 ? "放開以重新整理" : "下拉以重新整理"}
            </span>
          )}
        </div>
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
          className="w-full border-b border-tp-gray-100 px-4 py-3 text-left hover:bg-tp-gray-100/35"
        >
          <span className="flex items-center gap-2.5"><Avatar name={nickname} size={40} /><span className="text-[15px] text-tp-gray-600">有什麼問題？</span></span>
        </button>

        {loading && <p className="py-12 text-center text-[15px] text-tp-gray-600">載入討論中…</p>}
        {!loading && visible.length === 0 && (
          <p className="py-12 text-center text-[15px] text-tp-gray-600">
            {query ? "找不到符合的討論" : "目前沒有討論串"}
          </p>
        )}
        <div className="divide-y divide-tp-gray-100">
          {visible.map((question) => (
            <article
              key={question.id}
              className="relative w-full px-4 py-3 transition-colors hover:bg-tp-gray-100/35"
            >
              <button
                type="button"
                onClick={() => onOpen(question.id)}
                aria-label={`開啟討論：${question.body ?? "內容待確認"}`}
                className="absolute inset-0 size-full text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tp-primary-500 active:bg-tp-gray-100/55"
              />
              <div className="pointer-events-none relative flex gap-2.5">
                <span className="flex shrink-0 flex-col items-center">
                  <Avatar name={question.author.nickname} size={40} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="mb-1 flex max-w-full items-center gap-1.5 text-[13px] text-tp-gray-800">
                    <span className="truncate">{question.author.nickname}</span>
                    {question.author.role === "bot" && <span className="shrink-0 rounded-full bg-tp-primary-50 px-1.5 font-semibold text-tp-primary-500">機器人</span>}
                  </span>
                  {question.body !== null ? (
                    <span className="block text-[15px] leading-relaxed whitespace-pre-wrap break-words text-tp-gray-900">{question.body}</span>
                  ) : question.hidden_parts.some((part) => part.part === "body") ? (
                    <span className="text-[15px] italic text-tp-gray-600">內容待確認個資，暫時隱藏</span>
                  ) : question.media.length === 0 ? (
                    <span className="text-[15px] text-tp-gray-600">內容待確認</span>
                  ) : null}
                  {question.media.length > 0 && (
                    <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                      {question.media.map((media) => (
                        <div key={media.id} className="pointer-events-auto max-w-full">
                          {media.kind === "image" ? (
                            <ImageBubble media={media} onOpen={setLightbox} />
                          ) : media.kind === "video" ? (
                            <VideoBubble media={media} />
                          ) : (
                            <AudioBubble media={media} self={false} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-tp-gray-600">
                    <span className="flex items-center gap-1" aria-label={`${question.answer_count} 則留言`}><MessageCircle className="size-4" />{question.answer_count}</span>
                    {question.location_sharing !== "off" && <span aria-label="已開啟附近通知" title="已開啟附近通知"><MapPin className="size-4" /></span>}
                    <time dateTime={question.created_at} className="whitespace-nowrap">{timeAgo(question.created_at, now)}</time>
                    {questionTags(question).map((tag) => <span key={tag} className="font-semibold text-tp-primary-500">#{tag.replace(/^#/, "")}</span>)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
        {hasMore && !loading && (
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className="min-h-11 w-full text-[15px] font-medium text-tp-primary-500 disabled:opacity-50">
            {loadingMore ? "載入更多討論…" : "載入更多討論"}
          </button>
        )}
      </div>
      {hasUpdates && !refreshing && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
          <button type="button" onClick={() => { void refresh(); }} className="pointer-events-auto min-h-10 rounded-full bg-tp-primary-500 px-4 text-[14px] font-semibold text-white shadow-md">
            有新內容，點此更新
          </button>
        </div>
      )}
      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
