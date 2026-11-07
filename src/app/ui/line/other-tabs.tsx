"use client";

import {
  ChevronRight,
  House,
  MessageCircle,
  MessageCircleQuestion,
  MessagesSquare,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import type { Me, QuestionSummary } from "./api/types";
import { Avatar, QuestionAvatar } from "./avatar";
import { TabHeader } from "./tab-header";
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

export function HomeTab({
  me,
  stats,
  onNicknameChange,
  onAsk,
  onShowChats,
  recent,
  onOpen,
  note,
}: {
  me: Me | null;
  stats: { total: number; waiting: number; resolved: number };
  /** 最近的問題（最多 3 個），讓長輩在主頁就看到進度 */
  recent: { q: QuestionSummary; unread: number; preview: string }[];
  onOpen: (id: string) => void;
  onNicknameChange: (name: string) => Promise<boolean>;
  onAsk: () => void;
  onShowChats: () => void;
  /** 目前的連線模式說明（示範模式、瀏覽器測試帳號）；在 App 內正式使用時不顯示 */
  note?: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const nickname = me?.nickname ?? "…";

  async function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed && trimmed !== nickname) {
      if (!(await onNicknameChange(trimmed))) return;
    }
    setEditing(false);
  }

  return (
    <div className="flex h-full flex-col bg-claude-ivory">
      <TabHeader title="主頁" />
      <div className="flex-1 overflow-y-auto">
        <section className="flex items-center gap-4 px-4 py-4 max-[300px]:items-start max-[300px]:gap-2">
          <Avatar name={nickname} size={48} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form onSubmit={save} className="flex gap-2">
                <input
                  autoFocus
                  value={draft}
                  maxLength={30}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={save}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-claude-sand px-3 text-[17px] outline-none focus:border-claude"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(nickname);
                  setEditing(true);
                }}
                className="flex min-h-11 max-w-full items-center gap-1.5 text-[18px] font-bold"
              >
                <span className="truncate">{nickname}</span>
                <Pencil className="size-5 shrink-0 text-stone-500" />
              </button>
            )}
            <p className="mt-0.5 text-[13px] text-stone-600">
              回答您的人會看到這個暱稱，點名字可以修改
            </p>
          </div>
        </section>

        <section className="mx-4 grid grid-cols-3 overflow-hidden rounded-2xl border border-claude-sand bg-white max-[300px]:grid-cols-1">
          {(
            [
              ["我的問題", stats.total],
              ["等待回答", stats.waiting],
              ["已解決", stats.resolved],
            ] as const
          ).map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={onShowChats}
              className="flex flex-col items-center gap-0.5 py-4 not-last:border-r not-last:border-claude-sand max-[300px]:flex-row max-[300px]:justify-between max-[300px]:px-4 max-[300px]:not-last:border-r-0 max-[300px]:not-last:border-b"
            >
              <span className="text-[24px] font-bold text-claude-ink">{value}</span>
              <span className="text-[15px] text-stone-600">{label}</span>
            </button>
          ))}
        </section>

        <section className="px-4 py-6">
          <button
            type="button"
            onClick={onAsk}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-claude py-5 text-[20px] font-bold text-white shadow-sm active:bg-claude-dark"
          >
            <MessageCircleQuestion className="size-7" />
            我要發問
          </button>
          <p className="mt-3 text-center text-[15px] leading-relaxed text-stone-600">
            看不懂的公文、不確定是不是詐騙、不知道怎麼走，
            <br />
            都可以打字、拍照或錄音問大家。
          </p>
        </section>

        {recent.length > 0 && (
          <section className="px-4 pb-6">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-[17px] font-bold text-claude-ink">最近的問題</h2>
              <button
                type="button"
                onClick={onShowChats}
                className="flex min-h-11 items-center gap-0.5 text-[15px] text-claude-dark"
              >
                全部
                <ChevronRight className="size-4" />
              </button>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-claude-sand bg-white">
              {recent.map(({ q, unread, preview }) => (
                <li key={q.id} className="not-last:border-b not-last:border-claude-sand">
                  <button
                    type="button"
                    onClick={() => onOpen(q.id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-claude-sand/40"
                  >
                    <QuestionAvatar q={q} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold text-claude-ink">
                        {q.title ?? "（內容待確認）"}
                      </p>
                      <p className="truncate text-[14px] text-stone-600">{preview}</p>
                    </div>
                    {unread > 0 && (
                      <span className="min-w-6 rounded-full bg-claude-dark px-1.5 text-center text-[13px] leading-6 font-bold text-white">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {note && (
          <p className="px-4 pb-6 text-center text-[12px] text-stone-500">{note}</p>
        )}
      </div>
    </div>
  );
}
