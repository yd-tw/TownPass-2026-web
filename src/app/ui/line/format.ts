import type { Message } from "./types";

const DAY = 24 * 60 * 60 * 1000;

const clockFmt = new Intl.DateTimeFormat("zh-TW", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const weekdayShortFmt = new Intl.DateTimeFormat("zh-TW", { weekday: "short" });
const weekdayNarrowFmt = new Intl.DateTimeFormat("zh-TW", {
  weekday: "narrow",
});

function startOfDay(t: number) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayDiff(at: number, now: number) {
  return Math.round((startOfDay(now) - startOfDay(at)) / DAY);
}

export function isSameDay(a: number, b: number) {
  return startOfDay(a) === startOfDay(b);
}

/** 下午3:24 */
export function formatClock(at: number) {
  return clockFmt.format(at);
}

/** 聊天列表右上角的時間：今天顯示時間、昨天、週X、日期 */
export function formatListTime(at: number, now: number) {
  const diff = dayDiff(at, now);
  if (diff <= 0) return formatClock(at);
  if (diff === 1) return "昨天";
  if (diff < 7) return weekdayShortFmt.format(at);
  const d = new Date(at);
  if (d.getFullYear() === new Date(now).getFullYear()) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 聊天室裡的日期分隔：今天 / 昨天 / 11/5(四) */
export function formatDateDivider(at: number, now: number) {
  const diff = dayDiff(at, now);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  const d = new Date(at);
  const md = `${d.getMonth() + 1}/${d.getDate()}(${weekdayNarrowFmt.format(at)})`;
  return d.getFullYear() === new Date(now).getFullYear()
    ? md
    : `${d.getFullYear()}/${md}`;
}

/** 聊天列表、回覆預覽用的訊息摘要 */
export function summarize(m: Message) {
  const who = m.self ? "你" : m.senderName;
  if (m.unsent) return `${who}已收回訊息`;
  switch (m.kind) {
    case "sticker":
      return `${who}傳送了貼圖`;
    case "image":
      return `${who}傳送了照片`;
    default:
      return m.text;
  }
}
