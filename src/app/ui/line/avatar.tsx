import { Mic, Users, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CategoryId, QuestionSummary } from "./api/types";
import { CATEGORY_STYLE, questionSystemTag } from "./categories";
import { META } from "./api/mock-api";

// Claude 品牌色及其深淺變化
const PALETTE = [
  "#468d9b",
  "#356c77",
  "#22474e",
  "#b07d2c",
  "#738995",
  "#5e6d76",
  "#e6692c",
  "#ae501f",
  "#475259",
  "#e5464b",
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

/** 問題（群組）的頭像：有選分類就用分類圖示；未分類或「其他」用依問題固定顏色的群組圖示 */
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
    category === "uncategorized" || category === "other"
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
 * 列表與選單裡的問題頭像：拍照顯示縮圖、錄音顯示麥克風、影片顯示攝影機，
 * 長輩一眼就認得出是哪一題；其他用分類圖示。
 */
export function QuestionAvatar({
  q,
  size = 56,
}: {
  q: Pick<QuestionSummary, "id" | "category" | "system_tag" | "tags" | "thumbnail_url" | "has_audio" | "has_video">;
  size?: number;
}) {
  if (q.thumbnail_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={q.thumbnail_url}
        alt=""
        aria-hidden
        className="shrink-0 rounded-full bg-tp-gray-100 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  if (q.has_audio) {
    return (
      <span
        aria-hidden
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-tp-primary-500 text-white"
        style={{ width: size, height: size }}
      >
        <Mic style={{ width: size * 0.48, height: size * 0.48 }} />
      </span>
    );
  }
  if (q.has_video) {
    return (
      <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-tp-primary-500 text-white" style={{ width: size, height: size }}>
        <Video style={{ width: size * 0.48, height: size * 0.48 }} />
      </span>
    );
  }
  const category = META.categories.find((item) => item.label === questionSystemTag(q)?.replace(/^#/, ""))?.id ?? q.category ?? "uncategorized";
  return <CategoryAvatar category={category} seed={q.id} size={size} />;
}
