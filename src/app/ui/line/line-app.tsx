"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ChatList, type ChatListActions } from "./chat-list";
import { ChatRoom } from "./chat-room";
import { BottomNav, HomeTab, PlaceholderTab } from "./other-tabs";
import { buildSamples } from "./sample-data";
import type { Message, ReplyRef, Room, Tab } from "./types";
import { useChatSocket, type Emit, type SocketEvent } from "./use-chat-socket";

const NICK_KEY = "line-demo-nickname";
const MAX_LENGTH = 500;

const noopSubscribe = () => () => {};

/**
 * LINE 風格的聊天 App。
 * 範例資料的時間是相對於「現在」產生的，而 Cache Components 會預先渲染
 * Client Component，所以整個 App 只在瀏覽器端掛載，伺服器端只輸出外框。
 */
export default function LineApp() {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-claude-ivory sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-[2.25rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10">
      {mounted ? (
        <LineAppInner />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <span className="size-8 animate-spin rounded-full border-3 border-claude border-t-transparent" />
        </div>
      )}
    </div>
  );
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // 非安全來源（例如用區網 IP 的 http 開啟）不能用 randomUUID
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readNickname() {
  try {
    const saved = localStorage.getItem(NICK_KEY);
    if (saved) return saved;
  } catch {
    // 無痕模式等情況讀不到 localStorage
  }
  return `訪客${Math.floor(1000 + Math.random() * 9000)}`;
}

function parseReply(value: unknown): ReplyRef | undefined {
  if (!value || typeof value !== "object") return undefined;
  const r = value as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.text !== "string") return undefined;
  return {
    key: typeof r.key === "string" ? r.key.slice(0, 64) : "",
    name: r.name.slice(0, 20),
    text: r.text.slice(0, 120),
  };
}

function LineAppInner() {
  const [initial] = useState(() => buildSamples(Date.now()));
  const [rooms, setRooms] = useState<Room[]>(initial.rooms);
  const [messages, setMessages] = useState<Record<string, Message[]>>(
    initial.messages,
  );
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("chats");
  const [active, setActive] = useState<{
    id: string;
    marker: string | null;
  } | null>(null);
  const [nickname, setNickname] = useState(readNickname);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(
    null,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback(
    (text: string) => setToast({ text, id: Date.now() }),
    [],
  );

  const roomKey = rooms.map((r) => r.id).join("\n");
  const roomIds = useMemo(() => roomKey.split("\n"), [roomKey]);

  const updateRoom = (id: string, patch: (r: Room) => Partial<Room>) =>
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch(r) } : r)),
    );

  const updateMessages = (
    roomId: string,
    fn: (list: Message[]) => Message[],
  ) =>
    setMessages((prev) => ({ ...prev, [roomId]: fn(prev[roomId] ?? []) }));

  function handleEvent(e: SocketEvent, emitNow: Emit) {
    const roomId = typeof e.room === "string" ? e.room : null;
    if (!roomId || !rooms.some((r) => r.id === roomId)) return;
    const sender = typeof e.id === "string" ? e.id : "unknown";
    const kind = e.kind ?? "text";

    if (kind === "read") {
      const targets = new Set(
        Array.isArray(e.targets)
          ? e.targets.filter((t): t is string => typeof t === "string")
          : [],
      );
      if (targets.size === 0) return;
      updateMessages(roomId, (list) =>
        list.map((m) =>
          m.self && targets.has(m.key) && !m.readBy.includes(sender)
            ? { ...m, readBy: [...m.readBy, sender] }
            : m,
        ),
      );
      return;
    }

    if (kind === "unsend") {
      const target = e.target;
      if (typeof target !== "string") return;
      updateMessages(roomId, (list) =>
        list.map((m) =>
          m.key === target && m.senderId === sender ? { ...m, unsent: true } : m,
        ),
      );
      return;
    }

    if (kind !== "text" && kind !== "sticker") return;
    const text = typeof e.text === "string" ? e.text.trim().slice(0, MAX_LENGTH) : "";
    if (!text) return;
    const at = typeof e.at === "number" ? e.at : Date.now();
    const key =
      typeof e.cid === "string" && e.cid && e.cid.length <= 64
        ? e.cid
        : `${sender}-${at}`;
    if ((messages[roomId] ?? []).some((m) => m.key === key)) return;

    const isActive = active?.id === roomId;
    const name =
      typeof e.name === "string" && e.name.trim()
        ? e.name.trim().slice(0, 20)
        : "訪客";
    updateMessages(roomId, (list) => [
      ...list,
      {
        key,
        roomId,
        kind,
        self: false,
        senderId: sender,
        senderName: name,
        text,
        at,
        readBy: [],
        replyTo: parseReply(e.replyTo),
        live: true,
        readSent: isActive,
      },
    ]);
    // 收到新訊息時，被隱藏的聊天室會重新出現（跟 LINE 一樣）
    updateRoom(roomId, (r) => ({
      hidden: false,
      unread: isActive ? r.unread : r.unread + 1,
    }));
    if (isActive) emitNow({ room: roomId, kind: "read", targets: [key] });
  }

  const { status, emit } = useChatSocket(roomIds, handleEvent);

  /** 對還沒回報已讀的即時訊息送出已讀 */
  function sendRead(roomId: string) {
    const pending = (messages[roomId] ?? [])
      .filter((m) => !m.self && m.live && !m.readSent)
      .map((m) => m.key);
    if (pending.length === 0) return;
    if (emit({ room: roomId, kind: "read", targets: pending })) {
      const set = new Set(pending);
      updateMessages(roomId, (list) =>
        list.map((m) => (set.has(m.key) ? { ...m, readSent: true } : m)),
      );
    }
  }

  function openRoom(id: string) {
    const room = rooms.find((r) => r.id === id);
    if (!room) return;
    const list = messages[id] ?? [];
    const marker =
      room.unread > 0
        ? (list[Math.max(0, list.length - room.unread)]?.key ?? null)
        : null;
    setActive({ id, marker });
    updateRoom(id, () => ({ unread: 0, hidden: false }));
    sendRead(id);
  }

  function send(
    roomId: string,
    kind: "text" | "sticker",
    text: string,
    replyTo?: ReplyRef,
  ) {
    const key = makeId();
    const ok = emit({ room: roomId, cid: key, name: nickname, kind, text, replyTo });
    updateMessages(roomId, (list) => [
      ...list,
      {
        key,
        roomId,
        kind,
        self: true,
        senderId: "me",
        senderName: nickname,
        text,
        at: Date.now(),
        readBy: [],
        replyTo,
        failed: !ok,
      },
    ]);
    if (!ok) notify("目前離線，訊息未送出");
  }

  function retry(roomId: string, key: string) {
    const m = (messages[roomId] ?? []).find((x) => x.key === key);
    if (!m || m.kind === "system" || m.kind === "image") return;
    const ok = emit({
      room: roomId,
      cid: m.key,
      name: nickname,
      kind: m.kind,
      text: m.text,
      replyTo: m.replyTo,
    });
    if (!ok) {
      notify("仍然離線，請稍後再試");
      return;
    }
    updateMessages(roomId, (list) =>
      list.map((x) =>
        x.key === key ? { ...x, failed: false, at: Date.now() } : x,
      ),
    );
  }

  function unsend(roomId: string, key: string) {
    if (!emit({ room: roomId, kind: "unsend", target: key })) {
      notify("離線時無法收回訊息");
      return;
    }
    updateMessages(roomId, (list) =>
      list.map((m) => (m.key === key ? { ...m, unsent: true } : m)),
    );
  }

  function changeNickname(name: string) {
    setNickname(name);
    try {
      localStorage.setItem(NICK_KEY, name);
    } catch {
      // 忽略：只是記住暱稱的便利功能
    }
  }

  const listActions: ChatListActions = {
    onOpen: openRoom,
    onTogglePin: (id) => updateRoom(id, (r) => ({ pinned: !r.pinned })),
    onToggleMute: (id) => updateRoom(id, (r) => ({ muted: !r.muted })),
    onMarkRead: (id) => {
      updateRoom(id, () => ({ unread: 0 }));
      sendRead(id);
    },
    onHide: (id) => {
      updateRoom(id, () => ({ hidden: true }));
      notify("已隱藏聊天室，收到新訊息時會再出現");
    },
    onMarkAllRead: () => {
      setRooms((prev) => prev.map((r) => ({ ...r, unread: 0 })));
      for (const r of rooms) sendRead(r.id);
      notify("已將所有聊天標為已讀");
    },
    onCreate: (name) => {
      const id = `line-custom:${name}`;
      const existing = rooms.find((r) => r.id === id);
      if (existing) {
        openRoom(id);
        return;
      }
      const at = Date.now();
      setRooms((prev) => [
        ...prev,
        {
          id,
          name,
          type: "group",
          status: "輸入相同名稱就能加入這個聊天室",
          pinned: false,
          muted: false,
          hidden: false,
          unread: 0,
          createdAt: at,
        },
      ]);
      updateMessages(id, () => [
        {
          key: `system-${id}-${at}`,
          roomId: id,
          kind: "system",
          self: true,
          senderId: "me",
          senderName: nickname,
          text: `你建立了聊天室「${name}」\n其他人輸入相同名稱就會加入`,
          at,
          readBy: [],
        },
      ]);
      setActive({ id, marker: null });
    },
  };

  const activeRoom = active ? rooms.find((r) => r.id === active.id) : undefined;
  const totalUnread = rooms.reduce(
    (sum, r) => sum + (r.hidden ? 0 : r.unread),
    0,
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "chats" ? (
          <ChatList
            rooms={rooms}
            messages={messages}
            now={now}
            status={status}
            actions={listActions}
          />
        ) : tab === "home" ? (
          <HomeTab
            nickname={nickname}
            onNicknameChange={changeNickname}
            status={status}
            rooms={rooms}
            onOpen={openRoom}
          />
        ) : (
          <PlaceholderTab tab={tab} />
        )}
      </div>
      <BottomNav tab={tab} unread={totalUnread} onChange={setTab} />

      {activeRoom && active && (
        <ChatRoom
          key={activeRoom.id}
          room={activeRoom}
          messages={messages[activeRoom.id] ?? []}
          now={now}
          status={status}
          nickname={nickname}
          unreadElsewhere={totalUnread}
          unreadMarkerKey={active.marker}
          onBack={() => setActive(null)}
          onSend={(kind, text, replyTo) =>
            send(activeRoom.id, kind, text, replyTo)
          }
          onRetry={(key) => retry(activeRoom.id, key)}
          onUnsend={(key) => unsend(activeRoom.id, key)}
          onDelete={(key) =>
            updateMessages(activeRoom.id, (list) =>
              list.filter((m) => m.key !== key),
            )
          }
          onToggleMute={() =>
            updateRoom(activeRoom.id, (r) => ({ muted: !r.muted }))
          }
          onHide={() => {
            updateRoom(activeRoom.id, () => ({ hidden: true }));
            setActive(null);
          }}
          notify={notify}
        />
      )}

      {toast && (
        <div
          key={toast.id}
          className="pointer-events-none absolute inset-x-0 bottom-24 z-50 flex justify-center px-6"
          role="status"
        >
          <span className="rounded-full bg-claude-ink/90 px-4 py-2 text-center text-sm text-white animate-in fade-in zoom-in-95">
            {toast.text}
          </span>
        </div>
      )}
    </>
  );
}
