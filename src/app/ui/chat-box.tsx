"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { io, type Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://socket-tp2026.ydtw.net";
const ROOM = "lobby";
const MAX_LENGTH = 500;

type ChatMessage = {
  key: string;
  id: string;
  name: string;
  text: string;
  at: number;
  self: boolean;
};

type Status = "connecting" | "connected" | "disconnected";

const STATUS_LABEL: Record<Status, string> = {
  connecting: "連線中…",
  connected: "已連線",
  disconnected: "已斷線",
};

const STATUS_COLOR: Record<Status, string> = {
  connecting: "bg-amber-400",
  connected: "bg-emerald-500",
  disconnected: "bg-red-500",
};

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatBox() {
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      socket.emit("join", ROOM);
    });
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.io.on("reconnect_attempt", () => setStatus("connecting"));

    socket.on("message", (msg: Partial<ChatMessage>) => {
      const msgText = msg?.text;
      if (typeof msgText !== "string" || !msgText.trim()) return;
      setMessages((prev) => [
        ...prev,
        {
          key: `${msg.id}-${msg.at}-${Math.random()}`,
          id: String(msg.id ?? ""),
          name: typeof msg.name === "string" && msg.name ? msg.name : "訪客",
          text: msgText.slice(0, MAX_LENGTH),
          at: typeof msg.at === "number" ? msg.at : Date.now(),
          self: false,
        },
      ]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // 有新訊息時捲到最底
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const socket = socketRef.current;
    const trimmed = text.trim();
    if (!socket?.connected || !trimmed) return;

    const displayName =
      name.trim() || `訪客-${(socket.id ?? "").slice(0, 4)}`;
    const at = Date.now();

    socket.emit("message", { room: ROOM, name: displayName, text: trimmed });
    setMessages((prev) => [
      ...prev,
      {
        key: `self-${at}`,
        id: socket.id ?? "",
        name: displayName,
        text: trimmed,
        at,
        self: true,
      },
    ]);
    setText("");
  }

  return (
    <section className="flex h-[min(600px,80vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/15 dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h2 className="font-semibold">聊天室</h2>
        <span className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <span className={`h-2 w-2 rounded-full ${STATUS_COLOR[status]}`} />
          {STATUS_LABEL[status]}
        </span>
      </header>

      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="m-auto text-sm text-zinc-400">還沒有訊息，說聲嗨吧！</p>
        )}
        {messages.map((m) => (
          <div
            key={m.key}
            className={`flex max-w-[80%] flex-col gap-1 ${m.self ? "self-end items-end" : "self-start items-start"}`}
          >
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {m.self ? "我" : m.name} · {formatTime(m.at)}
            </span>
            <p
              className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                m.self
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-black/10 p-3 dark:border-white/15"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="暱稱（選填）"
          maxLength={20}
          className="rounded-lg border border-black/10 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-white/15"
        />
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={status === "connected" ? "輸入訊息…" : "等待連線…"}
            maxLength={MAX_LENGTH}
            disabled={status !== "connected"}
            className="flex-1 rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-white/15"
          />
          <button
            type="submit"
            disabled={status !== "connected" || !text.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            送出
          </button>
        </div>
      </form>
    </section>
  );
}
