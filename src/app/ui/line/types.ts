export type RoomType = "friend" | "group" | "official";

export type Room = {
  /** 同時也是 socket.io 的房間名稱 */
  id: string;
  name: string;
  type: RoomType;
  /** 群組成員（不含自己）；未知則不顯示人數 */
  members?: string[];
  /** 狀態消息 / 聊天室說明 */
  status?: string;
  pinned: boolean;
  muted: boolean;
  hidden: boolean;
  unread: number;
  createdAt: number;
};

export type MessageKind = "text" | "sticker" | "image" | "system";

export type ReplyRef = {
  key: string;
  name: string;
  text: string;
};

export type Message = {
  key: string;
  roomId: string;
  kind: MessageKind;
  self: boolean;
  /** 對方的 socket id，或範例資料中的假 id；自己為 "me" */
  senderId: string;
  senderName: string;
  text: string;
  at: number;
  /** 自己的訊息：已讀者的 id */
  readBy: string[];
  replyTo?: ReplyRef;
  unsent?: boolean;
  /** 自己的訊息因為未連線而沒送出 */
  failed?: boolean;
  /** 從 socket 收到的訊息（只有這種需要回傳已讀） */
  live?: boolean;
  /** 已經對這則訊息送出已讀 */
  readSent?: boolean;
};

export type Status = "connecting" | "connected" | "disconnected";

export type Tab = "home" | "chats" | "voom" | "news" | "wallet";
