"use client";

import { ArrowRight, Info } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/app/ui/line/categories";
import type { AdminApi, PageStat } from "../api";
import { Card, Empty, ErrorBox, Loading, SectionTitle, Select, formatTime, inputClass, timeAgo, useAsync } from "../ui";

/*
 * 頁面問題分析（GET /admin/analytics/pages）。
 * 狀態色取自城市通官方色票，並用資料視覺化檢查工具驗證過色盲可辨識：
 * 未解決 orange-600、協助中 grape、已解決 primary-500。
 * 已解決的青色對白底對比偏低，所以每段都有數字欄位，不只靠顏色。
 */
const SEGMENTS = [
  { key: "open_count", label: "未解決", color: "#e6692c" },
  { key: "in_progress_count", label: "協助中", color: "#5e73b4" },
  { key: "resolved_count", label: "已解決", color: "#2eb6c7" },
] as const;

type Range = "7" | "30" | "90" | "all" | "custom";
const RANGES: [Range, string][] = [
  ["7", "近 7 天"],
  ["30", "近 30 天"],
  ["90", "近 90 天"],
  ["all", "全部時間"],
  ["custom", "自訂"],
];

function startOfDay(date: string) {
  return new Date(`${date}T00:00:00`).toISOString();
}
function endOfDay(date: string) {
  return new Date(`${date}T23:59:59.999`).toISOString();
}

export function AnalyticsSection({ api, onOpenService }: { api: AdminApi; onOpenService: (serviceId: string) => void }) {
  const [range, setRange] = useState<Range>("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [service, setService] = useState("");
  // 「功能」選單：記住看過的所有功能，篩選後選單也不會變少
  const [services, setServices] = useState<Record<string, string>>({});

  const { data, error, loading, reload } = useAsync(
    async () => {
      // 「近 N 天」在送出請求時才以現在時間往回推
      const filter =
        range === "custom"
          ? { since: from ? startOfDay(from) : undefined, until: to ? endOfDay(to) : undefined }
          : range === "all"
            ? {}
            : { since: new Date(Date.now() - Number(range) * 86_400_000).toISOString() };
      const result = await api.pageAnalytics({ ...filter, service_id: service || undefined });
      setServices((prev) => {
        const next = { ...prev };
        for (const p of result.pages) next[p.service_id] = p.service_name;
        return next;
      });
      return result;
    },
    [api, range, from, to, service],
  );

  const maxCount = Math.max(1, ...(data?.pages ?? []).map((p) => p.question_count));
  const onlyRoot = !!data && data.pages.length > 0 && data.pages.every((p) => p.page_route === "/");

  return (
    <>
      <SectionTitle title="頁面問題分析" desc="使用者最常在哪些頁面遇到問題，依問題數排序。帶 +dialog、+sheet 的路由算同一個頁面。" />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="篩選">
        <Select label="時間範圍" value={range} onChange={setRange} options={RANGES} />
        {range === "custom" && (
          <>
            <input type="date" aria-label="開始日期" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            <span className="text-sm text-tp-gray-500">到</span>
            <input type="date" aria-label="結束日期" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </>
        )}
        <Select
          label="功能"
          value={service}
          onChange={setService}
          options={[["", "全部功能"], ...Object.entries(services).sort((a, b) => a[1].localeCompare(b[1], "zh-TW"))] as [string, string][]}
        />
      </div>

      {error && <ErrorBox message={error} onRetry={reload} />}
      {loading && !data && <Loading />}

      {data && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="問題總數" value={data.total_questions} />
            <StatTile
              label="有頁面資訊"
              value={data.questions_with_page}
              hint={data.total_questions ? `佔 ${Math.round((data.questions_with_page / data.total_questions) * 100)}%` : undefined}
            />
            <StatTile label="沒有頁面資訊" value={data.questions_without_page} hint="例如直接從論壇發問" />
          </div>

          {onlyRoot && (
            <p className="flex items-start gap-2 rounded-xl bg-tp-secondary-100 px-4 py-3 text-sm text-tp-secondary-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              頁面幾乎都是「/」：舊版 App 不會回傳 screen，請確認手機裝的是新版城市通 App。
            </p>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tp-gray-100 px-5 py-4">
              <h2 className="font-bold">頁面排行</h2>
              <Legend />
            </div>
            {data.pages.length === 0 ? (
              <Empty>這段時間沒有帶頁面資訊的問題</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-tp-gray-500">
                      <th className="w-10 py-2.5 pl-5 font-medium">#</th>
                      <th className="py-2.5 pr-3 font-medium">頁面</th>
                      <th className="w-[30%] py-2.5 pr-3 font-medium">狀態分布</th>
                      <Th>問題</Th>
                      <Th>未解決</Th>
                      <Th>已解決</Th>
                      <Th>沒人回答</Th>
                      <th className="py-2.5 pr-5 text-right font-medium">最後發問</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pages.map((p, i) => (
                      <PageRow key={`${p.service_id} ${p.page_route}`} rank={i + 1} page={p} max={maxCount} onOpenService={onOpenService} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function Th({ children }: { children: string }) {
  return <th className="py-2.5 pr-3 text-right font-medium whitespace-nowrap">{children}</th>;
}

function StatTile({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-tp-gray-600">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-tp-gray-900">{value.toLocaleString("zh-TW")}</p>
      {hint && <p className="mt-0.5 text-xs text-tp-gray-500">{hint}</p>}
    </Card>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-tp-gray-700" aria-label="圖例">
      {SEGMENTS.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function PageRow({ rank, page, max, onOpenService }: { rank: number; page: PageStat; max: number; onOpenService: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const segments = SEGMENTS.map((s) => ({ ...s, value: page[s.key] })).filter((s) => s.value > 0);
  const topCategories = page.categories.slice(0, 3);
  const unresolved = page.open_count + page.in_progress_count;

  return (
    <tr className="group border-t border-tp-gray-100 align-top hover:bg-tp-gray-50/60">
      <td className="py-3.5 pl-5 tabular-nums text-tp-gray-500">{rank}</td>
      <td className="py-3.5 pr-3">
        <p className="font-semibold text-tp-gray-900">{page.page_title ?? page.page_route}</p>
        <p className="mt-0.5 text-xs text-tp-gray-500">
          {page.service_name} · <code className="font-mono">{page.page_route}</code>
        </p>
        {topCategories.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1" aria-label="最常見的問題類型">
            {topCategories.map((c) => (
              <span key={c.category} className="rounded-md bg-tp-gray-100 px-1.5 py-0.5 text-xs text-tp-gray-700">
                {categoryLabel(c.category)} <span className="font-semibold tabular-nums">{c.count}</span>
              </span>
            ))}
          </p>
        )}
        <button
          type="button"
          onClick={() => onOpenService(page.service_id)}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-tp-primary-500 opacity-80 hover:underline group-hover:opacity-100"
        >
          看「{page.service_name}」的問題 <ArrowRight className="size-3" />
        </button>
      </td>
      <td className="py-3.5 pr-3">
        {/* 長度依問題數，分段依狀態；段與段之間留 2px 白縫 */}
        <div className="relative pt-1.5" onMouseLeave={() => setHover(null)}>
          <div className="flex h-3.5 gap-[2px]" style={{ width: `${(page.question_count / max) * 100}%`, minWidth: 6 }} role="img" aria-label={segments.map((s) => `${s.label} ${s.value} 題`).join("、")}>
            {segments.map((s, i) => (
              <span
                key={s.key}
                onMouseEnter={() => setHover(i)}
                className={cn("h-full transition-opacity first:rounded-l last:rounded-r", hover !== null && hover !== i && "opacity-40")}
                style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
              />
            ))}
          </div>
          {hover !== null && segments[hover] && (
            <div role="tooltip" className="pointer-events-none absolute top-full left-0 z-10 mt-1.5 rounded-lg bg-tp-gray-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg">
              <span className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ background: segments[hover].color }} />
              {segments[hover].label} <span className="font-semibold tabular-nums">{segments[hover].value}</span> 題（
              {Math.round((segments[hover].value / page.question_count) * 100)}%）
            </div>
          )}
        </div>
      </td>
      <td className="py-3.5 pr-3 text-right text-base font-bold tabular-nums">{page.question_count}</td>
      <td className={cn("py-3.5 pr-3 text-right tabular-nums", unresolved > 0 ? "font-semibold text-tp-gray-900" : "text-tp-gray-500")}>
        {unresolved}
        {page.in_progress_count > 0 && <span className="block text-xs font-normal text-tp-gray-500">協助中 {page.in_progress_count}</span>}
      </td>
      <td className="py-3.5 pr-3 text-right tabular-nums text-tp-gray-700">{page.resolved_count}</td>
      <td className={cn("py-3.5 pr-3 text-right tabular-nums", page.unanswered_count > 0 ? "font-semibold text-tp-warn-200" : "text-tp-gray-500")}>{page.unanswered_count}</td>
      <td className="py-3.5 pr-5 text-right whitespace-nowrap text-tp-gray-600" title={formatTime(page.last_asked_at)}>
        {timeAgo(page.last_asked_at)}
      </td>
    </tr>
  );
}
