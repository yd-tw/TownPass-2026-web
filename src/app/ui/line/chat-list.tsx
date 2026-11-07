"use client";

import {
  BellOff,
  CheckCheck,
  ChevronDown,
  MessageCirclePlus,
  Pin,
  ScanLine,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { formatListTime, summarize } from "./format";
import type { Message, Room, RoomType, Status } from "./types";
import { useLongPress } from "./use-long-press";

type Filter = "all" | RoomType | "unread";
type Sort = "time" | "unread" | "name";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "friend", label: "好友" },
  { id: "group", label: "群組" },
  { id: "official", label: "官方帳號" },
  { id: "unread", label: "未讀" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "time", label: "依接收時間" },
  { id: "unread", label: "依未讀訊息" },
  { id: "name", label: "依名稱" },
];

export type ChatListActions = {
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleMute: (id: string) => void;
  onMarkRead: (id: string) => void;
  onHide: (id: string) => void;
  onMarkAllRead: () => void;
  onCreate: (name: string) => void;
};

export function lastVisible(list: Message[] | undefined) {
  return list?.at(-1);
}

export function ChatList({
  rooms,
  messages,
  now,
  status,
  actions,
}: {
  rooms: Room[];
  messages: Record<string, Message[]>;
  now: number;
  status: Status;
  actions: ChatListActions;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("time");
  const [sortOpen, setSortOpen] = useState(false);
  const [sheetRoom, setSheetRoom] = useState<Room | null>(null);
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const lastAt = (r: Room) => lastVisible(messages[r.id])?.at ?? r.createdAt;
    return rooms
      .filter((r) => !r.hidden)
      .filter((r) => {
        if (filter === "all") return true;
        if (filter === "unread") return r.unread > 0;
        return r.type === filter;
      })
      .filter((r) => {
        if (!q) return true;
        if (r.name.toLowerCase().includes(q)) return true;
        return (messages[r.id] ?? []).some(
          (m) => !m.unsent && m.text.toLowerCase().includes(q),
        );
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sort === "unread" && a.unread !== b.unread)
          return b.unread - a.unread;
        if (sort === "name") return a.name.localeCompare(b.name, "zh-Hant");
        return lastAt(b) - lastAt(a);
      });
  }, [rooms, messages, filter, query, sort]);

  return (
    <div className="relative flex h-full flex-col bg-claude-ivory">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-1 text-[22px] font-bold tracking-tight"
            aria-haspopup="menu"
            aria-expanded={sortOpen}
          >
            聊天
            <ChevronDown className="size-5 text-stone-500" />
          </button>
          {sortOpen && (
            <>
              <button
                type="button"
                aria-label="關閉"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setSortOpen(false)}
              />
              <ul
                role="menu"
                className="absolute top-full left-0 z-40 mt-1 w-40 overflow-hidden rounded-xl bg-claude-ivory py-1 shadow-lg ring-1 ring-black/5"
              >
                {SORTS.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sort === s.id}
                      onClick={() => {
                        setSort(s.id);
                        setSortOpen(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2.5 text-left text-sm hover:bg-claude-sand/40",
                        sort === s.id && "font-semibold text-claude",
                      )}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="全部標為已讀" onClick={actions.onMarkAllRead}>
            <CheckCheck className="size-6" />
          </IconButton>
          <IconButton label="建立聊天" onClick={() => setCreating(true)}>
            <MessageCirclePlus className="size-6" />
          </IconButton>
        </div>
      </header>

      <div className="px-4">
        <label className="flex h-9 items-center gap-2 rounded-lg bg-claude-sand/70 px-3 text-stone-500">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-stone-900 outline-none placeholder:text-stone-400"
          />
          {query ? (
            <button
              type="button"
              aria-label="清除搜尋"
              onClick={() => setQuery("")}
              className="rounded-full bg-stone-400 p-0.5 text-white"
            >
              <X className="size-3" />
            </button>
          ) : (
            <ScanLine className="size-4 shrink-0" aria-hidden />
          )}
        </label>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1 text-[13px] font-medium transition-colors",
              filter === f.id
                ? "border-claude-ink bg-claude-ink text-claude-ivory"
                : "border-claude-sand text-stone-700 hover:bg-claude-sand/40",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {status !== "connected" && (
        <p className="mx-4 mb-1 rounded-md bg-claude/10 px-3 py-1.5 text-xs text-claude-dark">
          {status === "connecting" ? "連線中…" : "目前離線，新訊息暫時無法收發"}
        </p>
      )}

      <ul className="flex-1 overflow-y-auto pb-2">
        {visible.length === 0 && (
          <li className="px-4 py-16 text-center text-sm text-stone-400">
            {query ? "沒有符合的聊天" : "沒有聊天"}
          </li>
        )}
        {visible.map((room) => (
          <ChatRow
            key={room.id}
            room={room}
            last={lastVisible(messages[room.id])}
            now={now}
            onOpen={() => actions.onOpen(room.id)}
            onMenu={() => setSheetRoom(room)}
          />
        ))}
      </ul>

      {sheetRoom && (
        <RoomActionSheet
          room={rooms.find((r) => r.id === sheetRoom.id) ?? sheetRoom}
          onClose={() => setSheetRoom(null)}
          actions={actions}
        />
      )}
      {creating && (
        <CreateRoomDialog
          onClose={() => setCreating(false)}
          onCreate={(name) => {
            setCreating(false);
            actions.onCreate(name);
          }}
        />
      )}
    </div>
  );
}

function ChatRow({
  room,
  last,
  now,
  onOpen,
  onMenu,
}: {
  room: Room;
  last: Message | undefined;
  now: number;
  onOpen: () => void;
  onMenu: () => void;
}) {
  const press = useLongPress(onMenu);
  const preview = last ? summarize(last) : (room.status ?? "");
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        {...press}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors select-none [-webkit-touch-callout:none] hover:bg-claude-sand/40 active:bg-claude-sand/60"
      >
        <Avatar name={room.name} type={room.type} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-[15px] font-semibold text-stone-900">
              {room.name}
            </span>
            {room.members && (
              <span className="shrink-0 text-[15px] text-stone-400">
                ({room.members.length + 1})
              </span>
            )}
            {room.type === "official" && (
              <ShieldCheck
                className="size-4 shrink-0 text-claude"
                aria-label="官方帳號"
              />
            )}
            {room.muted && (
              <BellOff
                className="size-3.5 shrink-0 text-stone-400"
                aria-label="已關閉提醒"
              />
            )}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-stone-500">
            {preview.replace(/\n/g, " ")}
          </p>
        </div>
        <div className="flex min-h-11 shrink-0 flex-col items-end justify-between self-stretch py-1">
          <span className="text-[11px] text-stone-400">
            {last ? formatListTime(last.at, now) : ""}
          </span>
          <div className="flex items-center gap-1">
            {room.pinned && (
              <Pin
                className="size-3.5 rotate-45 text-stone-400"
                aria-label="已釘選"
              />
            )}
            {room.unread > 0 && (
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-semibold text-white",
                  room.muted ? "bg-stone-300" : "bg-claude",
                )}
                aria-label={`${room.unread} 則未讀`}
              >
                {room.unread > 999 ? "999+" : room.unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

function RoomActionSheet({
  room,
  onClose,
  actions,
}: {
  room: Room;
  onClose: () => void;
  actions: ChatListActions;
}) {
  const items: { label: string; run: () => void; danger?: boolean }[] = [
    {
      label: room.pinned ? "取消釘選" : "釘選聊天室",
      run: () => actions.onTogglePin(room.id),
    },
    {
      label: room.muted ? "開啟提醒" : "關閉提醒",
      run: () => actions.onToggleMute(room.id),
    },
    ...(room.unread > 0
      ? [{ label: "標為已讀", run: () => actions.onMarkRead(room.id) }]
      : []),
    { label: "隱藏", run: () => actions.onHide(room.id), danger: true },
  ];
  return (
    <Sheet onClose={onClose}>
      <p className="truncate px-4 pt-4 pb-2 text-center text-sm font-semibold text-stone-500">
        {room.name}
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
              className={cn(
                "w-full px-4 py-3.5 text-[15px] hover:bg-claude-sand/40",
                item.danger ? "text-red-500" : "text-stone-900",
              )}
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
        className="w-full px-4 py-3.5 text-[15px] text-stone-500 hover:bg-claude-sand/40"
      >
        取消
      </button>
    </Sheet>
  );
}

function CreateRoomDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
  }
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-6 animate-in fade-in">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-2xl bg-claude-ivory p-5 shadow-xl animate-in zoom-in-95"
      >
        <h2 className="text-center text-base font-bold">建立聊天</h2>
        <p className="mt-1 text-center text-xs text-stone-500">
          輸入相同名稱的人會進到同一個聊天室
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          placeholder="聊天室名稱"
          className="mt-4 w-full rounded-lg border border-claude-sand px-3 py-2 text-[15px] outline-none focus:border-claude"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-claude-sand/60 py-2 text-sm font-medium text-stone-700"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-lg bg-claude py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            建立
          </button>
        </div>
      </form>
    </div>
  );
}

export function Sheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="關閉"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 animate-in fade-in"
      />
      <div className="relative overflow-hidden rounded-t-2xl bg-claude-ivory pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
        {children}
      </div>
    </div>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full text-stone-800 transition-colors hover:bg-black/5 active:bg-black/10",
        className,
      )}
    >
      {children}
    </button>
  );
}
