"use client";

import {
  Bell,
  BellOff,
  Calendar,
  Camera,
  ChartBar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Contact,
  Copy,
  File,
  Image as ImageIcon,
  Images,
  Link,
  MapPin,
  Menu,
  Mic,
  NotebookPen,
  Phone,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  Smile,
  Trash2,
  Undo2,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { IconButton } from "./chat-list";
import { formatClock, formatDateDivider, isSameDay, summarize } from "./format";
import { STICKERS } from "./sample-data";
import type { Message, ReplyRef, Room, Status } from "./types";
import { useLongPress } from "./use-long-press";

const CHAT_BG = "#f0eee6";
const SELF_BUBBLE = "#d97757";
const MAX_LENGTH = 500;
const GROUP_GAP = 5 * 60 * 1000;
const UNSEND_LIMIT = 24 * 60 * 60 * 1000;

export type ChatRoomProps = {
  room: Room;
  messages: Message[];
  now: number;
  status: Status;
  nickname: string;
  unreadElsewhere: number;
  unreadMarkerKey: string | null;
  onBack: () => void;
  onSend: (kind: "text" | "sticker", text: string, replyTo?: ReplyRef) => void;
  onRetry: (key: string) => void;
  onUnsend: (key: string) => void;
  onDelete: (key: string) => void;
  onToggleMute: () => void;
  onHide: () => void;
  notify: (text: string) => void;
};

type Item =
  | { type: "date"; key: string; label: string }
  | { type: "unread"; key: string }
  | { type: "msg"; key: string; m: Message; first: boolean };

export function ChatRoom(props: ChatRoomProps) {
  const { room, messages, now, status, notify } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [text, setText] = useState("");
  const [panel, setPanel] = useState<"plus" | "sticker" | null>(null);
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const [menu, setMenu] = useState<{ m: Message; top: number } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIdx, setMatchIdx] = useState(0);
  const [showJump, setShowJump] = useState(false);

  const isGroup = room.type === "group";

  const items = useMemo(() => {
    const out: Item[] = [];
    let prev: Message | undefined;
    for (const m of messages) {
      const newDay = !prev || !isSameDay(prev.at, m.at);
      if (newDay) {
        out.push({
          type: "date",
          key: `date-${m.key}`,
          label: formatDateDivider(m.at, now),
        });
      }
      if (m.key === props.unreadMarkerKey) {
        out.push({ type: "unread", key: `unread-${m.key}` });
      }
      const first =
        newDay ||
        m.key === props.unreadMarkerKey ||
        !prev ||
        prev.kind === "system" ||
        prev.unsent === true ||
        prev.self !== m.self ||
        prev.senderId !== m.senderId ||
        m.at - prev.at > GROUP_GAP;
      out.push({ type: "msg", key: m.key, m, first });
      prev = m;
    }
    return out;
  }, [messages, now, props.unreadMarkerKey]);

  // ---- 搜尋 ----
  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? messages
            .filter(
              (m) =>
                m.kind === "text" &&
                !m.unsent &&
                m.text.toLowerCase().includes(q),
            )
            .map((m) => m.key)
        : [],
    [messages, q],
  );
  const currentMatch = matches.length
    ? matches[matches.length - 1 - Math.min(matchIdx, matches.length - 1)]
    : null;

  useEffect(() => {
    if (!currentMatch) return;
    listRef.current
      ?.querySelector(`[data-key="${CSS.escape(currentMatch)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [currentMatch]);

  // ---- 捲動 ----
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const marker = list.querySelector("[data-unread-marker]");
    if (marker instanceof HTMLElement) {
      list.scrollTop = marker.offsetTop - 80;
      // 停在未讀分隔線，不要被下面「捲到最底」的 effect 蓋掉
      nearBottomRef.current = false;
    } else {
      list.scrollTop = list.scrollHeight;
    }
    // 只在進入聊天室時執行
  }, []);

  const lastKey = messages.at(-1)?.key;
  const lastSelf = messages.at(-1)?.self;
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (lastSelf || nearBottomRef.current) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
  }, [lastKey, lastSelf]);

  useEffect(() => {
    const list = listRef.current;
    if (list && nearBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [panel, replyTo]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    nearBottomRef.current = near;
    setShowJump(!near);
  }

  // ---- 傳送 ----
  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    props.onSend("text", trimmed.slice(0, MAX_LENGTH), replyTo ?? undefined);
    setText("");
    setReplyTo(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 中文輸入法選字時按 Enter 不送出
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function openMenu(m: Message, el: HTMLElement) {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let top = r.top - box.top - 76;
    if (top < 60) top = r.bottom - box.top + 8;
    top = Math.min(top, box.height - 90);
    setMenu({ m, top });
  }

  const members = useMemo(() => {
    const names = new Set(room.members ?? []);
    for (const m of messages) {
      if (!m.self && m.kind !== "system") names.add(m.senderName);
    }
    return [...names];
  }, [room.members, messages]);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20 flex flex-col animate-in duration-200 slide-in-from-right"
      style={{ background: CHAT_BG }}
    >
      {searching ? (
        <header className="flex h-13 shrink-0 items-center gap-2 px-2">
          <label className="flex h-9 flex-1 items-center gap-2 rounded-lg bg-claude-ivory px-3 text-stone-500">
            <Search className="size-4 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchIdx(0);
              }}
              placeholder="搜尋聊天記錄"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-stone-900 outline-none"
            />
            {q && (
              <span className="shrink-0 text-xs text-stone-500">
                {matches.length
                  ? `${Math.min(matchIdx, matches.length - 1) + 1}/${matches.length}`
                  : "0 筆"}
              </span>
            )}
          </label>
          <IconButton
            label="較舊的結果"
            onClick={() =>
              setMatchIdx((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)))
            }
          >
            <ChevronUp className="size-5" />
          </IconButton>
          <IconButton
            label="較新的結果"
            onClick={() => setMatchIdx((i) => Math.max(i - 1, 0))}
          >
            <ChevronDown className="size-5" />
          </IconButton>
          <button
            type="button"
            onClick={() => {
              setSearching(false);
              setQuery("");
            }}
            className="px-1 text-[15px] font-medium text-stone-900"
          >
            取消
          </button>
        </header>
      ) : (
        <header className="flex h-13 shrink-0 items-center gap-1 pr-1 pl-0.5">
          <button
            type="button"
            onClick={props.onBack}
            aria-label="返回聊天列表"
            className="flex h-10 items-center rounded-full pr-1 text-stone-900 hover:bg-black/5"
          >
            <ChevronLeft className="size-7" />
            {props.unreadElsewhere > 0 && (
              <span className="-ml-1 text-[15px] font-medium">
                {props.unreadElsewhere > 99 ? "99+" : props.unreadElsewhere}
              </span>
            )}
          </button>
          <h1 className="flex min-w-0 flex-1 items-center gap-1 text-[17px] font-bold text-stone-900">
            <span className="truncate">{room.name}</span>
            {room.members && (
              <span className="shrink-0 font-normal">
                ({room.members.length + 1})
              </span>
            )}
            {room.muted && (
              <BellOff className="size-4 shrink-0" aria-label="已關閉提醒" />
            )}
          </h1>
          <IconButton label="搜尋" onClick={() => setSearching(true)}>
            <Search className="size-5.5" />
          </IconButton>
          <IconButton label="通話" onClick={() => notify("通話功能為示意，尚未實作")}>
            <Phone className="size-5.5" />
          </IconButton>
          <IconButton label="聊天室選單" onClick={() => setDrawerOpen(true)}>
            <Menu className="size-6" />
          </IconButton>
        </header>
      )}

      {status !== "connected" && (
        <p className="shrink-0 bg-claude/15 py-1 text-center text-xs text-claude-dark">
          {status === "connecting" ? "連線中…" : "目前離線，訊息無法傳送"}
        </p>
      )}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-3 pt-1 pb-3"
        aria-live="polite"
      >
        {items.length === 0 && (
          <p className="mt-10 text-center text-sm text-stone-500">
            還沒有訊息，傳個貼圖打招呼吧！
          </p>
        )}
        {items.map((item) => {
          if (item.type === "date") {
            return (
              <div key={item.key} className="my-3 flex justify-center">
                <span className="rounded-full bg-claude-sand px-3 py-0.5 text-xs text-stone-600">
                  {item.label}
                </span>
              </div>
            );
          }
          if (item.type === "unread") {
            return (
              <div
                key={item.key}
                data-unread-marker
                className="my-3 flex justify-center"
              >
                <span className="rounded-full bg-claude/12 px-3 py-1 text-xs text-claude-dark">
                  以下為尚未閱讀的訊息
                </span>
              </div>
            );
          }
          return (
            <MessageRow
              key={item.key}
              m={item.m}
              first={item.first}
              showName={isGroup || item.m.senderName !== room.name}
              isGroup={isGroup}
              query={q}
              active={item.key === currentMatch}
              onMenu={openMenu}
              onRetry={props.onRetry}
            />
          );
        })}
      </div>

      {showJump && (
        <button
          type="button"
          aria-label="捲到最新訊息"
          onClick={() =>
            listRef.current?.scrollTo({
              top: listRef.current.scrollHeight,
              behavior: "smooth",
            })
          }
          className="absolute right-3 z-10 flex size-9 items-center justify-center rounded-full bg-claude-ivory text-stone-700 shadow-md ring-1 ring-claude-sand"
          style={{ bottom: panel ? 330 : 72 }}
        >
          <ChevronDown className="size-5" />
        </button>
      )}

      {replyTo && (
        <div className="flex shrink-0 items-center gap-3 border-t border-claude-sand bg-claude-ivory px-4 py-2">
          <Reply className="size-4 shrink-0 text-claude" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-stone-800">回覆 {replyTo.name}</p>
            <p className="truncate text-stone-500">{replyTo.text}</p>
          </div>
          <IconButton label="取消回覆" className="size-7" onClick={() => setReplyTo(null)}>
            <X className="size-4" />
          </IconButton>
        </div>
      )}

      <div className="flex shrink-0 items-end gap-0.5 border-t border-claude-sand bg-claude-ivory px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <IconButton
          label="更多功能"
          onClick={() => setPanel((p) => (p === "plus" ? null : "plus"))}
        >
          <Plus
            className={cn(
              "size-6 transition-transform",
              panel === "plus" && "rotate-45",
            )}
          />
        </IconButton>
        {!text && (
          <>
            <IconButton label="相機" onClick={() => notify("相機為示意功能")}>
              <Camera className="size-6" />
            </IconButton>
            <IconButton label="照片" onClick={() => notify("傳送照片為示意功能")}>
              <ImageIcon className="size-6" />
            </IconButton>
          </>
        )}
        <div className="mx-1 flex min-h-9 flex-1 items-end rounded-[18px] bg-claude-sand/70 pr-0.5 pl-3.5">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={MAX_LENGTH}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setPanel(null)}
            placeholder="Aa"
            aria-label="輸入訊息"
            className="field-sizing-content max-h-28 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-2 text-[15px] leading-5 outline-none placeholder:text-stone-400"
          />
          <IconButton
            label="貼圖"
            className={cn("size-8", panel === "sticker" && "text-claude")}
            onClick={() => setPanel((p) => (p === "sticker" ? null : "sticker"))}
          >
            <Smile className="size-5.5" />
          </IconButton>
        </div>
        {text.trim() ? (
          <IconButton label="傳送" className="text-claude" onClick={send}>
            <SendHorizontal className="size-6" />
          </IconButton>
        ) : (
          <IconButton label="語音訊息" onClick={() => notify("語音訊息為示意功能")}>
            <Mic className="size-6" />
          </IconButton>
        )}
      </div>

      {panel === "plus" && <PlusPanel notify={notify} />}
      {panel === "sticker" && (
        <div className="grid h-64 shrink-0 grid-cols-4 content-start gap-2 overflow-y-auto border-t border-claude-sand bg-claude-ivory p-3">
          {STICKERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => props.onSend("sticker", s)}
              className="flex aspect-square items-center justify-center rounded-xl text-5xl transition-transform hover:bg-claude-sand/40 active:scale-90"
              aria-label={`傳送貼圖 ${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {menu && (
        <MessageMenu
          m={menu.m}
          top={menu.top}
          now={now}
          onClose={() => setMenu(null)}
          onReply={() => {
            setReplyTo({
              key: menu.m.key,
              name: menu.m.self ? props.nickname : menu.m.senderName,
              text: summarize(menu.m),
            });
            inputRef.current?.focus();
          }}
          onCopy={async () => {
            try {
              await navigator.clipboard.writeText(menu.m.text);
              notify("已複製");
            } catch {
              notify("無法存取剪貼簿");
            }
          }}
          onUnsend={() => props.onUnsend(menu.m.key)}
          onDelete={() => props.onDelete(menu.m.key)}
        />
      )}

      {drawerOpen && (
        <RoomDrawer
          room={room}
          members={members}
          nickname={props.nickname}
          onClose={() => setDrawerOpen(false)}
          onToggleMute={props.onToggleMute}
          onHide={props.onHide}
          notify={notify}
        />
      )}
    </div>
  );
}

function MessageRow({
  m,
  first,
  showName,
  isGroup,
  query,
  active,
  onMenu,
  onRetry,
}: {
  m: Message;
  first: boolean;
  showName: boolean;
  isGroup: boolean;
  query: string;
  active: boolean;
  onMenu: (m: Message, el: HTMLElement) => void;
  onRetry: (key: string) => void;
}) {
  const press = useLongPress((el) => onMenu(m, el));

  if (m.kind === "system" || m.unsent) {
    return (
      <div data-key={m.key} className="my-2 flex justify-center px-6">
        <span className="rounded-full bg-claude-sand px-3 py-1 text-center text-xs whitespace-pre-wrap text-stone-600">
          {m.unsent ? summarize(m) : m.text}
        </span>
      </div>
    );
  }

  const readCount = m.readBy.length;
  const readLabel =
    m.self && readCount > 0 ? (isGroup ? `已讀 ${readCount}` : "已讀") : null;

  const meta = (
    <div
      className={cn(
        "flex shrink-0 flex-col pb-0.5 text-[10px] leading-tight text-stone-500",
        m.self ? "items-end" : "items-start",
      )}
    >
      {m.failed ? (
        <button
          type="button"
          onClick={() => onRetry(m.key)}
          className="mb-0.5 flex items-center gap-0.5 text-red-600"
          title="重新傳送"
        >
          <CircleAlert className="size-3.5" />
          重送
        </button>
      ) : (
        readLabel && <span>{readLabel}</span>
      )}
      <span>{formatClock(m.at)}</span>
    </div>
  );

  const content = (
    <div
      {...press}
      className={cn(
        "min-w-0 select-none [-webkit-touch-callout:none]",
        active && "rounded-[18px] ring-3 ring-claude/50",
      )}
    >
      <Content m={m} tail={first} query={query} />
    </div>
  );

  if (m.self) {
    return (
      <div
        data-key={m.key}
        className={cn(
          "flex items-end justify-end gap-1.5 pl-14",
          first ? "mt-3" : "mt-1",
        )}
      >
        {meta}
        {content}
      </div>
    );
  }

  return (
    <div
      data-key={m.key}
      className={cn("flex items-start gap-2 pr-10", first ? "mt-3" : "mt-1")}
    >
      <div className="w-9 shrink-0">
        {first && <Avatar name={m.senderName} size={36} />}
      </div>
      <div className="flex min-w-0 flex-col items-start">
        {first && showName && (
          <span className="mb-1 max-w-full truncate text-[11px] text-stone-600">
            {m.senderName}
          </span>
        )}
        <div className="flex max-w-full items-end gap-1.5">
          {content}
          {meta}
        </div>
      </div>
    </div>
  );
}

function Content({
  m,
  tail,
  query,
}: {
  m: Message;
  tail: boolean;
  query: string;
}) {
  if (m.kind === "sticker") {
    return (
      <div className="px-1 text-[72px] leading-none" role="img" aria-label="貼圖">
        {m.text}
      </div>
    );
  }
  if (m.kind === "image") {
    return (
      <div className="flex h-36 w-52 flex-col items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-[#f3d9cb] via-claude-sand to-[#c9dbeb] text-stone-700 shadow-sm">
        <ImageIcon className="size-8" />
        <span className="px-3 text-center text-xs font-medium">{m.text}</span>
      </div>
    );
  }
  const color = m.self ? SELF_BUBBLE : "#ffffff";
  return (
    <div
      className={cn(
        "relative rounded-[18px] px-3 py-2 text-[15px] leading-snug wrap-break-word whitespace-pre-wrap",
        m.self ? "text-white" : "text-claude-ink shadow-[0_1px_1px_rgb(20_20_19/0.06)]",
        tail && (m.self ? "rounded-tr-[4px]" : "rounded-tl-[4px]"),
      )}
      style={{ background: color }}
    >
      {tail && (
        <svg
          aria-hidden
          width="9"
          height="12"
          viewBox="0 0 9 12"
          className={cn(
            "absolute top-0",
            m.self ? "-right-[7px] -scale-x-100" : "-left-[7px]",
          )}
        >
          <path d="M9 0H1.2C.2 0-.3 1.2.4 1.9L9 12Z" fill={color} />
        </svg>
      )}
      {m.replyTo && (
        <div
          className={cn(
            "mb-1.5 border-b pb-1.5 text-xs",
            m.self
              ? "border-white/30 text-white/80"
              : "border-black/10 text-stone-500",
          )}
        >
          <p className={cn("font-semibold", m.self ? "text-white" : "text-stone-700")}>
            {m.replyTo.name}
          </p>
          <p className="line-clamp-2">{m.replyTo.text}</p>
        </div>
      )}
      <Highlight text={m.text} query={query} />
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  while (i < text.length) {
    const found = lower.indexOf(query, i);
    if (found === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (found > i) parts.push(text.slice(i, found));
    parts.push(
      <mark key={found} className="rounded-sm bg-[#f6d77a] text-claude-ink">
        {text.slice(found, found + query.length)}
      </mark>,
    );
    i = found + query.length;
  }
  return <>{parts}</>;
}

function MessageMenu({
  m,
  top,
  now,
  onClose,
  onReply,
  onCopy,
  onUnsend,
  onDelete,
}: {
  m: Message;
  top: number;
  now: number;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onUnsend: () => void;
  onDelete: () => void;
}) {
  const actions: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: "回覆", icon: Reply, run: onReply },
    ...(m.kind === "text" ? [{ label: "複製", icon: Copy, run: onCopy }] : []),
    ...(m.self && !m.failed && now - m.at < UNSEND_LIMIT
      ? [{ label: "收回", icon: Undo2, run: onUnsend }]
      : []),
    { label: "刪除", icon: Trash2, run: onDelete },
  ];
  return (
    <div className="absolute inset-0 z-30">
      <button
        type="button"
        aria-label="關閉選單"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/10"
      />
      <div
        role="menu"
        className="absolute left-1/2 flex -translate-x-1/2 gap-1 rounded-2xl bg-claude-ivory p-1.5 shadow-xl ring-1 ring-black/5 animate-in zoom-in-95 fade-in"
        style={{ top }}
      >
        {actions.map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            role="menuitem"
            onClick={() => {
              run();
              onClose();
            }}
            className="flex w-14 flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-stone-700 hover:bg-claude-sand/60"
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const PLUS_ITEMS: { label: string; icon: LucideIcon }[] = [
  { label: "照片", icon: Images },
  { label: "相機", icon: Camera },
  { label: "語音通話", icon: Phone },
  { label: "位置資訊", icon: MapPin },
  { label: "聯絡資訊", icon: Contact },
  { label: "檔案", icon: File },
  { label: "投票", icon: ChartBar },
  { label: "活動", icon: Calendar },
];

function PlusPanel({ notify }: { notify: (text: string) => void }) {
  return (
    <div className="grid h-64 shrink-0 grid-cols-4 content-center gap-y-5 border-t border-claude-sand bg-claude-ivory px-3">
      {PLUS_ITEMS.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          onClick={() => notify(`「${label}」為示意功能`)}
          className="flex flex-col items-center gap-1.5 text-xs text-stone-600"
        >
          <span className="flex size-13 items-center justify-center rounded-full border border-claude-sand text-stone-700 transition-colors hover:bg-claude-sand/40">
            <Icon className="size-6" />
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

function RoomDrawer({
  room,
  members,
  nickname,
  onClose,
  onToggleMute,
  onHide,
  notify,
}: {
  room: Room;
  members: string[];
  nickname: string;
  onClose: () => void;
  onToggleMute: () => void;
  onHide: () => void;
  notify: (text: string) => void;
}) {
  const quick: { label: string; icon: LucideIcon; run: () => void }[] = [
    {
      label: room.muted ? "開啟提醒" : "關閉提醒",
      icon: room.muted ? BellOff : Bell,
      run: onToggleMute,
    },
    { label: "邀請", icon: UserPlus, run: () => notify("邀請為示意功能") },
    { label: "相簿", icon: Images, run: () => notify("相簿為示意功能") },
    { label: "記事本", icon: NotebookPen, run: () => notify("記事本為示意功能") },
  ];
  const links: { label: string; icon: LucideIcon }[] = [
    { label: "照片・影片", icon: ImageIcon },
    { label: "檔案", icon: File },
    { label: "連結", icon: Link },
    { label: "活動", icon: Calendar },
  ];
  const typeLabel =
    room.type === "official" ? "官方帳號" : room.type === "group" ? "群組" : "好友";

  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        aria-label="關閉聊天室選單"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 animate-in fade-in"
      />
      <aside className="absolute inset-y-0 right-0 flex w-[84%] flex-col bg-claude-ivory shadow-2xl animate-in duration-200 slide-in-from-right">
        <div className="flex justify-end p-2">
          <IconButton label="關閉" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="flex flex-col items-center px-4 pb-4">
          <Avatar name={room.name} type={room.type} size={72} />
          <p className="mt-2 max-w-full truncate text-lg font-bold">
            {room.name}
          </p>
          <p className="max-w-full truncate text-xs text-stone-500">
            {room.status ?? typeLabel}
          </p>
        </div>
        <div className="grid grid-cols-4 border-y border-claude-sand/70 py-3">
          {quick.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={run}
              className="flex flex-col items-center gap-1 text-[11px] text-stone-600"
            >
              <Icon className="size-6 text-stone-800" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          <ul>
            {links.map(({ label, icon: Icon }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => notify(`「${label}」為示意功能`)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-[15px] hover:bg-claude-sand/40"
                >
                  <Icon className="size-5 text-stone-500" />
                  <span className="flex-1 text-left">{label}</span>
                  <ChevronRight className="size-4 text-stone-300" />
                </button>
              </li>
            ))}
          </ul>
          {room.type === "group" && (
            <section className="border-t border-claude-sand/70 py-2">
              <h2 className="px-5 py-2 text-xs font-semibold text-stone-500">
                成員{room.members ? ` ${room.members.length + 1}` : ""}
              </h2>
              <ul>
                <li className="flex items-center gap-3 px-5 py-2">
                  <Avatar name={nickname} size={32} />
                  <span className="truncate text-sm">{nickname}（你）</span>
                </li>
                {members.map((name) => (
                  <li key={name} className="flex items-center gap-3 px-5 py-2">
                    <Avatar name={name} size={32} />
                    <span className="truncate text-sm">{name}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <button
          type="button"
          onClick={onHide}
          className="border-t border-claude-sand/70 py-4 text-[15px] text-red-500 hover:bg-red-50"
        >
          隱藏聊天室
        </button>
      </aside>
    </div>
  );
}
