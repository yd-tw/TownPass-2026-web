"use client";

import {
  Bell,
  ChevronRight,
  House,
  MessageCircle,
  MessageCircleQuestion,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionSummary } from "./api/types";
import { QuestionAvatar } from "./avatar";
import type { Tab } from "./types";

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "主頁", icon: House },
  { id: "chats", label: "聊天", icon: MessageCircle },
  { id: "forum", label: "討論串", icon: MessagesSquare },
];

export function BottomNav({
  tab,
  unread,
  onChange,
}: {
  tab: Tab;
  unread: number;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="grid shrink-0 grid-cols-3 border-t border-claude-sand bg-claude-ivory pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px]",
              // 三個分頁的選中樣式一致：品牌色＋較粗的線，不填滿
              active ? "font-bold text-claude-dark" : "text-stone-500",
            )}
          >
            <Icon className="size-7" strokeWidth={active ? 2.4 : 1.8} />
            {label}
            {id === "chats" && unread > 0 && (
              <span className="absolute top-0 left-1/2 ml-2 min-w-5.5 rounded-full bg-claude-dark px-1 text-center text-[12px] leading-5.5 font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export type HomeQuestion = {
  q: QuestionSummary;
  /** 還沒看過的新回答 */
  unread: number;
  /** 別人的回答數 */
  answered: number;
};

/** 問題的進度，用一句白話說 */
function statusText({ q, unread, answered }: HomeQuestion) {
  if (unread > 0) return { text: "有新回答", className: "font-bold text-claude-dark" };
  if (q.status === "resolved") return { text: "已解決", className: "text-claude-green" };
  if (q.status === "in_progress") return { text: "有人在協助您", className: "text-claude-blue" };
  if (answered > 0) return { text: `已有 ${answered} 人回答`, className: "text-stone-600" };
  return { text: "等待回答中", className: "text-stone-600" };
}

/**
 * 主頁只放長輩最需要的三件事：
 * 1. 有沒有人回答我（有新回答才出現，點了直接看）
 * 2. 我要發問（最大的按鈕）
 * 3. 我的問題進度（最多三題，各一句狀態）
 */
export function HomeTab({
  questions,
  onAsk,
  onOpen,
  onShowChats,
  note,
}: {
  /** 自己的問題，新的在前 */
  questions: HomeQuestion[];
  onAsk: () => void;
  onOpen: (id: string) => void;
  onShowChats: () => void;
  /** 目前的連線模式說明（示範模式、瀏覽器測試帳號）；在 App 內正式使用時不顯示 */
  note?: string | null;
}) {
  const withNew = questions.filter((x) => x.unread > 0);
  const recent = questions.slice(0, 3);

  return (
    <div className="flex h-full flex-col bg-claude-ivory">
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
        {withNew.length > 0 && (
          <button
            type="button"
            onClick={() => (withNew.length === 1 ? onOpen(withNew[0].q.id) : onShowChats())}
            className="mt-1 flex w-full items-center gap-3 rounded-2xl bg-claude/12 p-4 text-left ring-1 ring-claude/30 active:bg-claude/20"
          >
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-claude-dark text-white">
              <Bell className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[18px] font-bold text-claude-ink">
                {withNew.length === 1 ? "有人回答您了" : `${withNew.length} 個問題有新回答`}
              </span>
              <span className="block truncate text-[15px] text-stone-700">
                {withNew.length === 1
                  ? (withNew[0].q.title ?? "（內容待確認）")
                  : "點這裡查看"}
              </span>
            </span>
            <ChevronRight className="size-6 shrink-0 text-claude-dark" />
          </button>
        )}

        <button
          type="button"
          onClick={onAsk}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-claude py-6 text-[22px] font-bold text-white shadow-sm active:bg-claude-dark"
        >
          <MessageCircleQuestion className="size-8" />
          我要發問
        </button>
        <p className="mt-2 text-center text-[16px] text-stone-600">打字、拍照、錄音都可以</p>

        {recent.length > 0 && (
          <section className="mt-8">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-[18px] font-bold text-claude-ink">我的問題</h2>
              {questions.length > recent.length && (
                <button
                  type="button"
                  onClick={onShowChats}
                  className="flex min-h-11 items-center gap-0.5 text-[16px] text-claude-dark"
                >
                  全部
                  <ChevronRight className="size-5" />
                </button>
              )}
            </div>
            <ul className="overflow-hidden rounded-2xl border border-claude-sand bg-white">
              {recent.map((item) => {
                const status = statusText(item);
                return (
                  <li key={item.q.id} className="not-last:border-b not-last:border-claude-sand">
                    <button
                      type="button"
                      onClick={() => onOpen(item.q.id)}
                      className="flex min-h-18 w-full items-center gap-3 px-3 py-3 text-left active:bg-claude-sand/40"
                    >
                      <QuestionAvatar q={item.q} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-semibold text-claude-ink">
                          {item.q.title ?? "（內容待確認）"}
                        </p>
                        <p className={cn("text-[15px]", status.className)}>{status.text}</p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-stone-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {note && <p className="mt-8 text-center text-[12px] text-stone-500">{note}</p>}
      </div>
    </div>
  );
}
