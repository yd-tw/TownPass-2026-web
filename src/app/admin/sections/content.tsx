"use client";

import { EyeOff, Search, X } from "lucide-react";
import { useState } from "react";
import { META } from "@/app/ui/line/api/mock-api";
import type { CategoryId } from "@/app/ui/line/api/types";
import { questionManualTags } from "@/app/ui/line/categories";
import type { AdminApi, QuestionFilter, QuestionStatus } from "../api";
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  RoleBadge,
  SectionTitle,
  Select,
  StatusBadge,
  SystemTagBadge,
  timeAgo,
  usePaged,
} from "../ui";
import { QuestionPanel } from "./question-panel";

const LANGUAGE_LABEL: Record<string, string> = { "zh-TW": "中文", en: "English", ja: "日本語", ko: "한국어", vi: "Tiếng Việt", id: "Bahasa Indonesia", th: "ไทย", tl: "Tagalog" };

export function ContentSection({ api, initialFilter }: { api: AdminApi; initialFilter: QuestionFilter }) {
  const [filter, setFilter] = useState<QuestionFilter>(initialFilter);
  const [tagInput, setTagInput] = useState(initialFilter.tag_q ?? "");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = usePaged((cursor) => api.listQuestions(filter, cursor), [api, filter]);

  const set = (patch: Partial<QuestionFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const hasFilter = Object.values(filter).some(Boolean);

  return (
    <>
      <SectionTitle title="內容管理" desc="點一則問題可以看詳情、修改、刪除、整理固定標籤與手動標籤。修改或刪除別人的內容時，作者會收到通知。" />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="篩選">
        <Select
          label="狀態"
          value={filter.status ?? ""}
          onChange={(v) => set({ status: (v || undefined) as QuestionStatus | undefined })}
          options={[["", "全部狀態"], ["open", "未解決"], ["in_progress", "協助中"], ["resolved", "已解決"]]}
        />
        <Select
          label="固定標籤"
          value={filter.category ?? ""}
          onChange={(v) => set({ category: (v || undefined) as CategoryId | undefined })}
          options={[["", "全部固定標籤"], ...META.categories.map((c) => [c.id, c.label] as [string, string])]}
        />
        <Select
          label="語言"
          value={filter.language ?? ""}
          onChange={(v) => set({ language: v || undefined })}
          options={[["", "全部語言"], ...META.languages.map((l) => [l, LANGUAGE_LABEL[l] ?? l] as [string, string])]}
        />
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            set({ tag_q: tagInput.trim() || undefined });
          }}
        >
          <label className="flex h-10 items-center gap-1.5 rounded-lg border border-tp-gray-200 bg-white px-2.5 focus-within:border-tp-primary-500">
            <Search className="size-4 text-tp-gray-400" />
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="搜尋標籤（含固定標籤）" aria-label="搜尋標籤" className="w-44 bg-transparent text-sm outline-none placeholder:text-tp-gray-400" />
          </label>
          <Button type="submit" size="md">
            搜尋
          </Button>
        </form>
        {filter.service_id && (
          <span className="inline-flex h-10 items-center gap-1 rounded-lg bg-tp-primary-50 pr-1 pl-3 text-sm text-tp-primary-700">
            功能：<code>{filter.service_id}</code>
            <button type="button" aria-label="清除功能篩選" onClick={() => set({ service_id: undefined })} className="rounded p-1 hover:bg-tp-primary-100">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        {hasFilter && (
          <Button
            variant="ghost"
            onClick={() => {
              setTagInput("");
              setFilter({});
            }}
          >
            清除篩選
          </Button>
        )}
      </div>
      <p className="mb-3 text-xs text-tp-gray-500">後端還不能搜尋標題或內文，目前只能用標籤搜尋。</p>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      <Card className="overflow-hidden">
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <Empty>沒有符合的問題</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-tp-gray-100 text-left text-xs text-tp-gray-500">
                  <th className="py-2.5 pl-5 font-medium">問題</th>
                  <th className="py-2.5 pr-3 font-medium">狀態</th>
                  <th className="py-2.5 pr-3 font-medium">發問者</th>
                  <th className="py-2.5 pr-3 font-medium">頁面</th>
                  <th className="py-2.5 pr-3 text-right font-medium">回答</th>
                  <th className="py-2.5 pr-5 text-right font-medium">時間</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((q) => (
                  <tr key={q.id} onClick={() => setOpenId(q.id)} className="cursor-pointer border-b border-tp-gray-100 last:border-0 hover:bg-tp-primary-50/50">
                    <td className="max-w-md py-3 pl-5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(q.id); }} className="text-left font-semibold text-tp-gray-900 hover:text-tp-primary-500">
                        {q.title ?? "（標題待確認）"}
                      </button>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <SystemTagBadge q={q} />
                        {questionManualTags(q).map((t) => (
                          <span key={t} className="text-xs font-semibold text-tp-primary-500">#{t}</span>
                        ))}
                        {q.hidden_parts.length > 0 && <EyeOff className="size-3.5 text-tp-warn-200" aria-label="有個資待確認的內容" />}
                      </div>
                    </td>
                    <td className="py-3 pr-3"><StatusBadge status={q.status} /></td>
                    <td className="py-3 pr-3">
                      <span className="inline-flex items-center gap-1">{q.author.nickname}<RoleBadge role={q.author.role} /></span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-tp-gray-600">
                      {q.context ? (
                        <>
                          {q.context.service_name}
                          {q.context.page_title && <span className="block text-tp-gray-500">{q.context.page_title}</span>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">{q.answer_count}</td>
                    <td className="py-3 pr-5 text-right whitespace-nowrap text-tp-gray-600">{timeAgo(q.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <LoadMore hasMore={list.hasMore} busy={list.loadingMore} onClick={list.loadMore} />
      </Card>

      {openId && <QuestionPanel api={api} questionId={openId} onClose={() => setOpenId(null)} onChanged={list.reload} />}
    </>
  );
}
