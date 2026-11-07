import type { Message, MessageKind, ReplyRef, Room } from "./types";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 範例聊天室與訊息；時間都相對於 now，所以「今天 / 昨天」標籤會正確 */
export function buildSamples(now: number) {
  const rooms: Room[] = [
    {
      id: "line-townpass",
      name: "台北通 TownPass",
      type: "official",
      status: "城市服務一站搞定",
      pinned: true,
      muted: false,
      hidden: false,
      unread: 1,
      createdAt: now - 30 * DAY,
    },
    {
      id: "lobby",
      name: "公開大廳",
      type: "group",
      status: "所有在線的人都能在這裡聊天",
      pinned: true,
      muted: false,
      hidden: false,
      unread: 0,
      createdAt: now - 30 * DAY,
    },
    {
      id: "line-family",
      name: "家人群組",
      type: "group",
      members: ["媽媽", "爸爸", "妹妹"],
      pinned: false,
      muted: false,
      hidden: false,
      unread: 3,
      createdAt: now - 30 * DAY,
    },
    {
      id: "line-ming",
      name: "小明",
      type: "friend",
      status: "期末加油💪",
      pinned: false,
      muted: false,
      hidden: false,
      unread: 2,
      createdAt: now - 30 * DAY,
    },
    {
      id: "line-project",
      name: "專題小組",
      type: "group",
      members: ["阿華", "Kevin", "小美", "Jason"],
      pinned: false,
      muted: true,
      hidden: false,
      unread: 0,
      createdAt: now - 30 * DAY,
    },
    {
      id: "line-hua",
      name: "阿華",
      type: "friend",
      status: "🏀",
      pinned: false,
      muted: false,
      hidden: false,
      unread: 0,
      createdAt: now - 30 * DAY,
    },
    {
      id: "line-weather",
      name: "天氣小幫手",
      type: "official",
      status: "每天早上推播天氣",
      pinned: false,
      muted: false,
      hidden: false,
      unread: 0,
      createdAt: now - 30 * DAY,
    },
  ];

  let seq = 0;
  const msg = (
    roomId: string,
    ago: number,
    sender: string | null,
    text: string,
    opts: {
      kind?: MessageKind;
      readBy?: number;
      replyTo?: ReplyRef;
      key?: string;
    } = {},
  ): Message => ({
    key: opts.key ?? `sample-${roomId}-${seq++}`,
    roomId,
    kind: opts.kind ?? "text",
    self: sender === null,
    senderId: sender === null ? "me" : `sample-${sender}`,
    senderName: sender ?? "你",
    text,
    at: now - ago,
    readBy: Array.from({ length: opts.readBy ?? 0 }, (_, i) => `sample-r${i}`),
    replyTo: opts.replyTo,
  });

  const messages: Record<string, Message[]> = {
    "line-townpass": [
      msg(
        "line-townpass",
        3 * DAY,
        "台北通 TownPass",
        "歡迎加入台北通！🎉\n在這裡可以查詢市政服務、活動資訊與最新公告。",
      ),
      msg("line-townpass", 3 * DAY - MIN, "台北通 TownPass", "11 月市民活動一覽", {
        kind: "image",
      }),
      msg(
        "line-townpass",
        2 * HOUR,
        "台北通 TownPass",
        "【停水通知】\n11/9（一）上午 9:00～下午 5:00 部分區域將暫停供水，請提前儲水備用。",
      ),
    ],
    lobby: [
      msg(
        "lobby",
        2 * DAY,
        null,
        "這裡的訊息會即時同步給所有開著這個頁面的人，打個招呼吧！",
        { kind: "system" },
      ),
    ],
    "line-family": [
      msg("line-family", DAY + 5 * HOUR, "媽媽", "今天晚上回家吃飯嗎？"),
      msg("line-family", DAY + 4 * HOUR, null, "會！大概七點到", { readBy: 3 }),
      msg("line-family", DAY + 4 * HOUR - 2 * MIN, "爸爸", "👍", {
        kind: "sticker",
      }),
      msg("line-family", 3 * HOUR, "妹妹", "夜市戰利品", { kind: "image" }),
      msg("line-family", 3 * HOUR - MIN, "妹妹", "要不要幫你帶一份雞排？"),
      msg("line-family", 40 * MIN, "媽媽", "記得帶傘，晚上會下雨 ☔"),
    ],
    "line-ming": [
      msg("line-ming", 3 * DAY, "小明", "下禮拜的報告分工好了嗎"),
      msg("line-ming", 3 * DAY - 10 * MIN, null, "好了，我負責第 2、3 章", {
        readBy: 1,
      }),
      msg("line-ming", 90 * MIN, "小明", "欸你報告寫完了嗎", {
        key: "sample-ming-ask",
      }),
      msg("line-ming", 85 * MIN, null, "還沒…今天要熬夜了 😭", {
        readBy: 1,
        replyTo: {
          key: "sample-ming-ask",
          name: "小明",
          text: "欸你報告寫完了嗎",
        },
      }),
      msg("line-ming", 12 * MIN, "小明", "我也是哈哈 明天一起去圖書館？"),
      msg("line-ming", 11 * MIN, "小明", "😆", { kind: "sticker" }),
    ],
    "line-project": [
      msg("line-project", DAY + 2 * HOUR, "阿華", "下週三前要交期中簡報喔"),
      msg("line-project", 65 * MIN, "Kevin", "簡報我放到雲端了，大家有空看一下"),
      msg("line-project", 62 * MIN, "小美", "收到～"),
      msg("line-project", 58 * MIN, null, "我晚上來改第三頁", { readBy: 4 }),
    ],
    "line-hua": [
      msg("line-hua", 5 * DAY, "阿華", "下次一起打球！"),
      msg("line-hua", 5 * DAY - 3 * MIN, null, "好啊 🏀", { readBy: 1 }),
    ],
    "line-weather": [
      msg(
        "line-weather",
        9 * DAY,
        "天氣小幫手",
        "☁️ 明日天氣\n台北市 多雲時陰 18–24°C\n降雨機率 40%，出門記得帶把傘。",
      ),
    ],
  };

  return { rooms, messages };
}

export const STICKERS = [
  "😆",
  "🥰",
  "😭",
  "👍",
  "🙏",
  "🎉",
  "😴",
  "🤔",
  "😡",
  "🥳",
  "🐻",
  "🐰",
  "☕",
  "🍜",
  "💯",
  "❤️",
];
