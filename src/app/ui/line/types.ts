export type Tab = "home" | "chats" | "forum";

/** 聊天室輸入列要送出的內容 */
export type Outgoing =
  | { kind: "text"; text: string }
  | {
      kind: "media";
      text?: string;
      files: { kind: "image" | "video"; file: File; duration?: number }[];
      /** 有待傳附件時錄音，和附件一起送出 */
      audio?: { blob: Blob; duration: number };
    }
  | { kind: "audio"; blob: Blob; duration: number };

/** notify 的語氣：error 會留在畫面上直到按「知道了」 */
export type Notify = (text: string, tone?: "info" | "error") => void;
