"use client";

import {
  Clapperboard,
  House,
  MessageCircle,
  Newspaper,
  Pencil,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { IconButton } from "./chat-list";
import type { Room, Status, Tab } from "./types";

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "home", label: "主頁", icon: House },
  { id: "chats", label: "聊天", icon: MessageCircle },
  { id: "voom", label: "VOOM", icon: Clapperboard },
  { id: "news", label: "新聞", icon: Newspaper },
  { id: "wallet", label: "錢包", icon: Wallet },
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
    <nav className="grid shrink-0 grid-cols-5 border-t border-claude-sand bg-claude-ivory pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-col items-center gap-0.5 text-[10px]",
              active ? "font-semibold text-stone-900" : "text-stone-400",
            )}
          >
            <Icon
              className="size-6"
              strokeWidth={active ? 2.4 : 1.8}
              fill={active && id === "chats" ? "currentColor" : "none"}
            />
            {label}
            {id === "chats" && unread > 0 && (
              <span className="absolute -top-0.5 left-1/2 ml-1.5 min-w-4.5 rounded-full bg-claude px-1 text-center text-[10px] leading-4.5 font-semibold text-white">
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
  nickname,
  onNicknameChange,
  status,
  rooms,
  onOpen,
}: {
  nickname: string;
  onNicknameChange: (name: string) => void;
  status: Status;
  rooms: Room[];
  onOpen: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname);
  const friends = rooms.filter((r) => r.type === "friend" && !r.hidden);
  const groups = rooms.filter((r) => r.type === "group" && !r.hidden);

  function save(e: FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (trimmed) onNicknameChange(trimmed);
    setEditing(false);
  }

  return (
    <div className="flex h-full flex-col bg-claude-ivory">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-[22px] font-bold tracking-tight">主頁</h1>
        <IconButton label="設定">
          <Settings className="size-6" />
        </IconButton>
      </header>
      <div className="flex-1 overflow-y-auto">
        <section className="flex items-center gap-4 px-4 py-4">
          <Avatar name={nickname} size={64} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form onSubmit={save} className="flex gap-2">
                <input
                  autoFocus
                  value={draft}
                  maxLength={20}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={save}
                  className="min-w-0 flex-1 rounded-md border border-claude-sand px-2 py-1 text-base outline-none focus:border-claude"
                />
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(nickname);
                  setEditing(true);
                }}
                className="flex max-w-full items-center gap-1.5 text-lg font-bold"
              >
                <span className="truncate">{nickname}</span>
                <Pencil className="size-4 shrink-0 text-stone-400" />
              </button>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
              <span
                className={cn(
                  "size-2 rounded-full",
                  status === "connected"
                    ? "bg-claude-green"
                    : status === "connecting"
                      ? "bg-claude"
                      : "bg-red-500",
                )}
              />
              {status === "connected"
                ? "已連線，其他人會看到這個暱稱"
                : status === "connecting"
                  ? "連線中…"
                  : "已離線"}
            </p>
          </div>
        </section>
        <RoomSection title="群組" rooms={groups} onOpen={onOpen} />
        <RoomSection title="好友" rooms={friends} onOpen={onOpen} />
      </div>
    </div>
  );
}

function RoomSection({
  title,
  rooms,
  onOpen,
}: {
  title: string;
  rooms: Room[];
  onOpen: (id: string) => void;
}) {
  if (rooms.length === 0) return null;
  return (
    <section className="border-t border-claude-sand/70 py-2">
      <h2 className="px-4 py-2 text-xs font-semibold text-stone-500">
        {title} {rooms.length}
      </h2>
      <ul>
        {rooms.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-claude-sand/40"
            >
              <Avatar name={r.name} type={r.type} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium">{r.name}</p>
                {r.status && (
                  <p className="truncate text-xs text-stone-500">{r.status}</p>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PlaceholderTab({ tab }: { tab: Tab }) {
  const item = NAV.find((n) => n.id === tab) ?? NAV[0];
  const Icon = item.icon;
  return (
    <div className="flex h-full flex-col bg-claude-ivory">
      <header className="px-4 pt-4 pb-2">
        <h1 className="text-[22px] font-bold tracking-tight">{item.label}</h1>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-stone-400">
        <Icon className="size-12" strokeWidth={1.4} />
        <p className="text-sm">這個分頁只是示意，尚未實作</p>
      </div>
    </div>
  );
}
