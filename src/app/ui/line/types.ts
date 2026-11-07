export type Tab = "home" | "chats" | "forum";

/** 聊天室輸入列要送出的內容 */
export type Outgoing =
  | { kind: "text"; text: string }
  | { kind: "images"; files: File[] }
  /** duration 讀不到時（例如部分 WebM）為 undefined */
  | { kind: "video"; file: File; duration?: number }
  | { kind: "audio"; blob: Blob; duration: number };

/** notify 的語氣：error 會留在畫面上直到按「知道了」 */
export type Notify = (text: string, tone?: "info" | "error") => void;
