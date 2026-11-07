import type { Answer } from "./api/types";

export type Tab = "home" | "chats" | "forum";

/** 只存在前端的列表偏好（後端沒有這些欄位） */
export type QuestionPrefs = {
  pinned: boolean;
  muted: boolean;
  /** 看過這個時間以前的回答；之後別人的回答算未讀 */
  lastSeenAt: string;
};

/** 聊天室輸入列要送出的內容 */
export type Outgoing =
  | { kind: "text"; text: string }
  | { kind: "images"; files: File[] }
  | { kind: "video"; file: File }
  | { kind: "audio"; blob: Blob; duration: number };

/** notify 的語氣：error 會留在畫面上直到按「知道了」 */
export type Notify = (text: string, tone?: "info" | "error") => void;

export function unreadCount(
  answers: Answer[] | undefined,
  meId: string,
  lastSeenAt: string | undefined,
) {
  if (!answers || !lastSeenAt) return 0;
  return answers.filter(
    (a) => a.author.id !== meId && a.created_at > lastSeenAt,
  ).length;
}
