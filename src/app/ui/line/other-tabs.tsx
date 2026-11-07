"use client";

import { MessageCircle, MessagesSquare, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tab } from "./types";

const NAV: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "chats", label: "聊天", icon: MessageCircle },
  { id: "forum", label: "討論串", icon: MessagesSquare },
];

export function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <nav className="grid shrink-0 grid-cols-2 border-t border-tp-gray-100 bg-white pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
      {NAV.map(({ id, label, icon: Icon }) => {
        const active = tab === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px]",
              // 分頁的選中樣式一致：品牌色＋較粗的線，不填滿
              active ? "font-bold text-tp-primary-500" : "text-tp-gray-600",
            )}
          >
            <Icon className="size-7" strokeWidth={active ? 2.4 : 1.8} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
