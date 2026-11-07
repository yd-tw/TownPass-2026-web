"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { Status } from "./types";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? "https://socket-tp2026.ydtw.net";

/** server.js 會把 payload 展開後加上 id（發送者 socket id）與 at 再轉發 */
export type SocketEvent = {
  id?: string;
  at?: number;
  room?: string;
  name?: string;
  text?: string;
  /** text | sticker | read | unsend；舊版 chat-box 沒有這個欄位，視為 text */
  kind?: string;
  cid?: string;
  replyTo?: unknown;
  targets?: unknown;
  target?: unknown;
};

export type Emit = (payload: Record<string, unknown>) => boolean;

export function useChatSocket(
  roomIds: string[],
  onEvent: (event: SocketEvent, emit: Emit) => void,
) {
  const socketRef = useRef<Socket | null>(null);
  const joinedRef = useRef(new Set<string>());
  const roomIdsRef = useRef(roomIds);
  const onEventRef = useRef(onEvent);
  const [status, setStatus] = useState<Status>("connecting");

  const emit = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket?.connected) return false;
    socket.emit("message", payload);
    return true;
  }, []);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    const joined = joinedRef.current;

    socket.on("connect", () => {
      setStatus("connected");
      // 重新連線後要重新加入所有房間
      joined.clear();
      for (const id of roomIdsRef.current) {
        socket.emit("join", id);
        joined.add(id);
      }
    });
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.io.on("reconnect_attempt", () => setStatus("connecting"));
    socket.on("message", (event: SocketEvent) => {
      if (event && typeof event === "object") onEventRef.current(event, emit);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      joined.clear();
    };
  }, [emit]);

  // 新增聊天室時加入對應的 socket 房間
  useEffect(() => {
    roomIdsRef.current = roomIds;
    const socket = socketRef.current;
    if (!socket?.connected) return;
    for (const id of roomIds) {
      if (!joinedRef.current.has(id)) {
        socket.emit("join", id);
        joinedRef.current.add(id);
      }
    }
  }, [roomIds]);


  return { status, emit };
}
