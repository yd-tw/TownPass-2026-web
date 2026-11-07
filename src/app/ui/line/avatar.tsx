import { cn } from "@/lib/utils";
import type { RoomType } from "./types";

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

export function Avatar({
  name,
  type,
  size = 44,
  className,
}: {
  name: string;
  type?: RoomType;
  size?: number;
  className?: string;
}) {
  const bg =
    type === "official" ? "#141413" : PALETTE[hash(name) % PALETTE.length];
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
        background: bg,
        fontSize: Math.round(size * 0.42),
      }}
    >
      {initial}
    </span>
  );
}
