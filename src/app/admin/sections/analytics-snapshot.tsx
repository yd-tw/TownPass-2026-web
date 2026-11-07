"use client";

import type { AdminApi } from "../api";
import { Card, Empty, ErrorBox, Loading, SectionTitle, useAsync } from "../ui";
import { Legend, StatusBar } from "./analytics";

/**
 * 頁面問題分析的快照版：只留頁面名稱、頁面 ID（路由）、問題數和狀態長條，
 * 適合截圖或投影展示。統計範圍是全部時間；要篩選或看細節請用完整版。
 */
export function AnalyticsSnapshotSection({ api }: { api: AdminApi }) {
  const { data, error, loading, reload } = useAsync(() => api.pageAnalytics({}), [api]);
  const pages = data?.pages ?? [];
  const max = Math.max(1, ...pages.map((p) => p.question_count));

  return (
    <>
      <SectionTitle title="頁面問題分析" />
      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data ? (
        <Loading />
      ) : (
        data && (
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tp-gray-100 px-6 py-4">
              <h2 className="font-bold">頁面排行</h2>
              <Legend />
            </div>
            {pages.length === 0 ? (
              <Empty>還沒有帶頁面資訊的問題</Empty>
            ) : (
              <ul className="divide-y divide-tp-gray-100">
                {pages.map((p) => (
                  <li key={`${p.service_id} ${p.page_route}`} className="grid grid-cols-[minmax(0,14rem)_1fr_3rem] items-center gap-x-5 px-6 py-4 max-sm:grid-cols-[1fr_3rem] max-sm:gap-y-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-tp-gray-900">{p.page_title ?? p.page_route}</p>
                      <code className="block truncate font-mono text-xs text-tp-gray-500">{p.page_route}</code>
                    </div>
                    <div className="max-sm:col-span-2 max-sm:row-start-2">
                      <StatusBar page={p} max={max} thick />
                    </div>
                    <p className="text-right text-xl font-bold tabular-nums text-tp-gray-900 max-sm:row-start-1 max-sm:col-start-2" aria-label={`${p.question_count} 題`}>
                      {p.question_count}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      )}
    </>
  );
}
