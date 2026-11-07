import { Mic, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryId, QuestionSummary } from "./api/types";
import { CATEGORY_STYLE } from "./categories";

// Claude 品牌色及其深淺變化
const PALETTE = [
  "#d97757",
  "#6a9bcc",
  "#788c5d",
  "#c6613f",
  "#b0aea5",
  "#4f7fae",
  "#5f7149",
  "#d4a27f",
  "#8a8780",
  "#a85a3c",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  return Math.abs(h);
}

/** 人的頭像：名字第一個字＋依名字固定的顏色 */
export function Avatar({
  name,
  size = 44,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initial = Array.from(name.trim())[0] ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: PALETTE[hash(name) % PALETTE.length],
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </span>
  );
}

/** 問題（群組）的頭像：有選分類就用分類圖示，否則是依問題固定顏色的群組圖示 */
export function CategoryAvatar({
  category,
  seed,
  size = 52,
}: {
  category: CategoryId;
  seed: string;
  size?: number;
}) {
  const style =
    category === "other"
      ? { icon: Users, color: PALETTE[hash(seed) % PALETTE.length] }
      : CATEGORY_STYLE[category];
  const { icon: Icon, color } = style;
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, background: color }}
    >
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} />
    </span>
  );
}

/**
 * 列表與選單裡的問題頭像：拍照問的顯示照片縮圖、錄音問的顯示麥克風，
 * 長輩一眼就認得出是哪一題；其他用分類圖示。
 */
export function QuestionAvatar({
  q,
  size = 56,
}: {
  q: Pick<QuestionSummary, "id" | "category" | "thumbnail_url" | "has_audio">;
  size?: number;
}) {
  if (q.thumbnail_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={q.thumbnail_url}
        alt=""
        aria-hidden
        className="shrink-0 rounded-full bg-claude-sand object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  if (q.has_audio) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-claude text-white"
        style={{ width: size, height: size }}
      >
        <Mic style={{ width: size * 0.48, height: size * 0.48 }} />
      </span>
    );
  }
  return <CategoryAvatar category={q.category} seed={q.id} size={size} />;
}
