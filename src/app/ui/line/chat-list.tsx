"use client";

import { BellOff, Pin, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Answer, CategoryId, QuestionSummary } from "./api/types";
import { META } from "./api/mock-api";
import { QuestionAvatar } from "./avatar";
import { categoryLabel } from "./categories";
import { answerPreview, formatListTime } from "./format";
import { unreadCount, type QuestionPrefs } from "./types";
import { useBackLayer } from "./use-back-layer";
import { useLongPress } from "./use-long-press";

/*
 * 長輩版的列表刻意只留「搜尋」和「我要發問」：
 * 篩選標籤、排序、全部已讀、隱藏問題對只問過幾題的人來說都是干擾，
 * 而且隱藏後沒有地方找回來。釘選、關閉提醒、標為已讀收在長按選單裡（同 LINE）。
 */

export type ChatListActions = {
  onOpen: (id: string) => void;
  onAsk: () => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
};

type Row = {
  q: QuestionSummary;
  prefs: QuestionPrefs;
  last: Answer | undefined;
  lastAt: string;
  unread: number;
  /** 群組人數：自己＋回答過的人 */
  members: number;
};

export function ChatList({
  questions,
  answers,
  prefs,
  meId,
  now,
  loading,
  actions,
}: {
  questions: QuestionSummary[];
  answers: Record<string, Answer[]>;
  prefs: Record<string, QuestionPrefs>;
  meId: string;
  now: number;
  loading: boolean;
  actions: ChatListActions;
}) {
  const [query, setQuery] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return questions
      .map((question): Row => {
        const p = prefs[question.id] ?? {
          pinned: false,
          muted: false,
          lastSeenAt: question.created_at,
        };
        const list = answers[question.id] ?? [];
        const last = list.at(-1);
        return {
          q: question,
          prefs: p,
          last,
          lastAt: last?.created_at ?? question.created_at,
          unread: unreadCount(list, meId, p.lastSeenAt),
          members:
            1 +
            new Set(list.filter((a) => a.author.id !== meId).map((a) => a.author.id))
              .size,
        };
      })
      .filter((r) => {
        if (!q) return true;
        if ((r.q.title ?? "").toLowerCase().includes(q)) return true;
        if (categoryLabel(r.q.category).includes(q)) return true;
        return (answers[r.q.id] ?? []).some((a) =>
          (a.body ?? "").toLowerCase().includes(q),
        );
      })
      .sort((a, b) => {
        if (a.prefs.pinned !== b.prefs.pinned) return a.prefs.pinned ? -1 : 1;
        return b.lastAt.localeCompare(a.lastAt);
      });
  }, [questions, answers, prefs, meId, query]);

  const sheetRow = rows.find((r) => r.q.id === sheetId);

  return (
    <div className="relative flex h-full flex-col bg-claude-ivory">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-[24px] font-bold tracking-tight">聊天</h1>
        <button
          type="button"
          onClick={actions.onAsk}
          className="flex h-12 items-center gap-1.5 rounded-full bg-claude pr-5 pl-4 text-[17px] font-bold text-white shadow-sm active:bg-claude-dark"
        >
          <Plus className="size-5" strokeWidth={2.8} />
          我要發問
        </button>
      </header>

      <div className="px-4 pb-3">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-claude-sand/70 px-3.5 text-stone-500">
          <Search className="size-5 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋我的問題"
            className="min-w-0 flex-1 bg-transparent text-[17px] text-stone-900 outline-none placeholder:text-stone-500"
          />
          {query && (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => setQuery("")}
              className="flex size-8 items-center justify-center rounded-full bg-stone-400 text-white"
            >
              <X className="size-4" />
            </button>
          )}
        </label>
      </div>

      <ul className="flex-1 overflow-y-auto pb-2">
        {loading && (
          <li className="px-4 py-16 text-center text-[17px] text-stone-500">
            載入中…
          </li>
        )}
        {!loading && rows.length === 0 && (
          <li className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <p className="text-[17px] text-stone-500">
              {query ? "找不到符合的問題" : "還沒有問過問題"}
            </p>
            {!query && (
              <button
                type="button"
                onClick={actions.onAsk}
                className="rounded-2xl bg-claude px-8 py-4 text-lg font-bold text-white"
              >
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
            onMenu={() => setSheetId(row.q.id)}
          />
        ))}
      </ul>

      {sheetRow && (
        <RowActionSheet
          row={sheetRow}
          onClose={() => setSheetId(null)}
          actions={actions}
        />
      )}
    </div>
  );
}

function StatusChip({ q }: { q: QuestionSummary }) {
  if (q.status === "resolved") {
    return (
      <span className="shrink-0 rounded-md bg-claude-green/15 px-1.5 text-[13px] leading-5 font-medium text-claude-green">
        已解決
      </span>
    );
  }
  if (q.status === "in_progress") {
    return (
      <span className="shrink-0 rounded-md bg-claude-blue/15 px-1.5 text-[13px] leading-5 font-medium text-claude-blue">
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
  onMenu,
}: {
  row: Row;
  meId: string;
  now: number;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const press = useLongPress(onMenu);
  const { q, prefs, last, unread } = row;
  const preview = last ? answerPreview(last, meId) : "已送出，等待熱心的人回答";
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        {...press}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors select-none [-webkit-touch-callout:none] hover:bg-claude-sand/40 active:bg-claude-sand/60"
      >
        <QuestionAvatar q={q} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[17px] font-semibold text-stone-900">
              {q.title ?? "（內容待確認）"}
            </span>
            {row.members > 1 && (
              <span className="shrink-0 text-[17px] text-stone-500">
                ({row.members})
              </span>
            )}
            {prefs.muted && (
              <BellOff className="size-4 shrink-0 text-stone-500" aria-label="已關閉提醒" />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <StatusChip q={q} />
            <p className="truncate text-[15px] text-stone-500">
              {preview.replace(/\n/g, " ")}
            </p>
          </div>
        </div>
        <div className="flex min-h-12 shrink-0 flex-col items-end justify-between self-stretch py-0.5">
          <span className="text-[13px] text-stone-500">
            {formatListTime(Date.parse(row.lastAt), now)}
          </span>
          <div className="flex items-center gap-1">
            {prefs.pinned && (
              <Pin className="size-4 rotate-45 text-stone-500" aria-label="已釘選" />
            )}
            {unread > 0 && (
              <span
                className={cn(
                  "min-w-6 rounded-full px-1.5 text-center text-[13px] leading-6 font-bold text-white",
                  prefs.muted ? "bg-stone-400" : "bg-claude-dark",
                )}
                aria-label={`${unread} 則新回答`}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function RowActionSheet({
  row,
  onClose,
  actions,
}: {
  row: Row;
  onClose: () => void;
  actions: ChatListActions;
}) {
  const id = row.q.id;
  const items: { label: string; run: () => void }[] = [
    {
      label: row.prefs.pinned ? "取消釘選" : "釘選在最上面",
      run: () => actions.onTogglePin(id),
    },
    {
      label: row.prefs.muted ? "開啟提醒" : "關閉提醒",
      run: () => actions.onToggleMute(id),
    },
    ...(row.unread > 0
      ? [{ label: "標為已讀", run: () => actions.onMarkRead(id) }]
      : []),
  ];
  return (
    <Sheet onClose={onClose}>
      <p className="truncate px-4 pt-4 pb-2 text-center text-[15px] font-semibold text-stone-500">
        {row.q.title ?? "（內容待確認）"}
      </p>
      <ul className="divide-y divide-claude-sand/70">
        {items.map((item) => (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => {
                item.run();
                onClose();
              }}
              className="w-full px-4 py-4 text-[17px] text-stone-900 hover:bg-claude-sand/40"
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="h-2 bg-claude-sand/60" />
      <button
        type="button"
        onClick={onClose}
        className="w-full px-4 py-4 text-[17px] text-stone-600 hover:bg-claude-sand/40"
      >
        取消
      </button>
    </Sheet>
  );
}

/**
 * 發問視窗：分類只是一個小小的下拉選單（預設「其他」，之後由志工分流），
 * 主角是大大的「發問」按鈕；按下後進入空的群組，用打字、拍照或錄音說明問題。
 */
export function AskSheet({
  onAsk,
  onClose,
}: {
  onAsk: (category: CategoryId) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<CategoryId>("other");
  return (
    <Sheet onClose={onClose}>
      <div className="px-5 pt-6 pb-4">
        <h2 className="text-center text-[22px] font-bold">我要發問</h2>
        <p className="mt-1.5 text-center text-[17px] leading-relaxed text-stone-600">
          按下「發問」後，
          <br />
          可以打字、拍照或錄音說明您的問題
        </p>
        <label className="mt-5 flex items-center justify-center gap-2 text-[15px] text-stone-600">
          分類
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryId)}
            className="h-10 rounded-lg border border-claude-sand bg-white px-2 text-[15px] text-stone-800 outline-none focus:border-claude"
          >
            {META.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onAsk(category)}
          className="mt-4 w-full rounded-2xl bg-claude py-4 text-[22px] font-bold text-white shadow-sm active:bg-claude-dark"
        >
          發問
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-3 text-[17px] text-stone-600"
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
      <div className="relative max-h-[90%] overflow-y-auto rounded-t-2xl bg-claude-ivory pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
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
        "inline-flex size-12 shrink-0 items-center justify-center rounded-full text-stone-800 transition-colors hover:bg-black/5 active:bg-black/10 disabled:opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
}
