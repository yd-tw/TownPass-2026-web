"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminApi } from "../api";
import { Badge, Card, Empty, ErrorBox, Loading, SectionTitle, formatTime, timeAgo, useAsync } from "../ui";

/** 規格：score 降到 -3 就不再被引用 */
const BLOCK_AT = -3;

/**
 * 語意快取評分（GET /admin/analytics/cache）。
 * 後端已依分數由低到高排序，最常配對錯的解答在最前面。
 */
export function CacheSection({ api }: { api: AdminApi }) {
  const { data, error, loading, reload } = useAsync(() => api.cacheAnalytics(), [api]);

  return (
    <>
      <SectionTitle title="語意快取評分" desc="被機器人引用過的解答，分數最低的排在最前面，找出常配對錯的內容。" />
      <div className="mb-4 flex items-start gap-2 rounded-xl bg-tp-gray-100 px-4 py-3 text-xs leading-relaxed text-tp-gray-700">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>加分：</strong>機器人回覆後 10 分鐘內發問者標記已解決且沒有別人回答，或採納機器人的回答。
          <strong className="ml-2">扣分：</strong>發問者對機器人的回答按倒讚，或採納別人的回答。分數降到 {BLOCK_AT} 就不再被引用。
        </p>
      </div>
      {error && <ErrorBox message={error} onRetry={reload} />}
      <Card className="overflow-hidden">
        {loading && !data ? (
          <Loading />
        ) : !data || data.length === 0 ? (
          <Empty>還沒有被機器人引用過的解答</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead>
                <tr className="border-b border-tp-gray-100 text-left text-xs text-tp-gray-500">
                  <th className="py-2.5 pl-5 font-medium">分數</th>
                  <th className="py-2.5 pr-3 font-medium">解答</th>
                  <th className="py-2.5 pr-3 text-right font-medium">引用次數</th>
                  <th className="py-2.5 pr-3 text-right font-medium">正面回饋</th>
                  <th className="py-2.5 pr-3 text-right font-medium">負面回饋</th>
                  <th className="py-2.5 pr-3 font-medium">狀態</th>
                  <th className="py-2.5 pr-5 text-right font-medium">更新</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.source_answer_id} className={cn("border-b border-tp-gray-100 align-top last:border-0", c.blocked && "text-tp-gray-500")}>
                    <td className="py-3 pl-5">
                      <span className={cn("text-base font-bold tabular-nums", c.score < 0 ? "text-tp-warn-200" : c.score > 0 ? "text-tp-primary-700" : "text-tp-gray-700")}>
                        {c.score > 0 ? `+${c.score}` : c.score}
                      </span>
                    </td>
                    <td className="max-w-md py-3 pr-3">
                      {c.question_title === null && c.answer_body === null ? (
                        <p className="text-tp-gray-500">（來源已被刪除）</p>
                      ) : (
                        <>
                          <p className="font-semibold text-tp-gray-900">{c.question_title ?? "（問題已刪除）"}</p>
                          <p className="mt-0.5 line-clamp-2 text-tp-gray-700">{c.answer_body ?? "（解答已刪除）"}</p>
                        </>
                      )}
                      <p className="mt-1 font-mono text-[11px] text-tp-gray-400">{c.source_answer_id}</p>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{c.reply_count}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">{c.positive_count}</td>
                    <td className={cn("py-3 pr-3 text-right tabular-nums", c.negative_count > c.positive_count && "font-semibold text-tp-warn-200")}>{c.negative_count}</td>
                    <td className="py-3 pr-3">{c.blocked ? <Badge tone="warn">已停止引用</Badge> : <Badge tone="primary">引用中</Badge>}</td>
                    <td className="py-3 pr-5 text-right whitespace-nowrap text-tp-gray-600" title={formatTime(c.updated_at)}>
                      {timeAgo(c.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
