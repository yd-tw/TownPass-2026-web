import type { ReactNode } from "react";

/**
 * 主頁、聊天、討論串共用的標題列：固定 64px 高、標題垂直置中，
 * 切換分頁時標題和下面的內容都不會跳動。右側按鈕請控制在 48px 以內。
 */
export function TabHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
      <h1 className="text-[22px] font-bold tracking-tight text-claude-ink">{title}</h1>
      {action && <div className="flex shrink-0 items-center">{action}</div>}
    </header>
  );
}
