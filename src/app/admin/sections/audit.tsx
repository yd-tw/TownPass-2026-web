"use client";

import { ChevronDown, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AdminApi, AuditEntry } from "../api";
import { Badge, Button, Card, Empty, ErrorBox, LoadMore, Loading, SectionTitle, Select, formatTime, inputClass, usePaged } from "../ui";

const ACTIONS: [string, string][] = [
  ["question.delete", "刪除問題"],
  ["answer.delete", "刪除回答"],
  ["question.edit", "修改問題"],
  ["answer.edit", "修改回答"],
  ["question.category", "修改分類"],
  ["question.tags", "修改標籤"],
  ["question.resolve", "標記已解決"],
  ["pii.accept", "同意遮蔽個資"],
  ["pii.deny", "拒絕遮蔽個資"],
  ["user.role", "設定身份"],
  ["user.ban", "停權"],
  ["user.unban", "解除停權"],
];
const ACTION_LABEL = Object.fromEntries(ACTIONS);
const TARGET_LABEL: Record<AuditEntry["target_type"], string> = { question: "問題", answer: "回答", user: "使用者", pii_report: "個資標記" };

export function AuditSection({ api }: { api: AdminApi }) {
  const [action, setAction] = useState("");
  const [targetInput, setTargetInput] = useState("");
  const [adminInput, setAdminInput] = useState("");
  const [filter, setFilter] = useState<{ target_id?: string; admin_id?: string }>({});
  const list = usePaged((cursor) => api.auditLog({ action: action || undefined, ...filter }, cursor), [api, action, filter]);

  return (
    <>
      <SectionTitle title="稽核紀錄" desc="管理員做過的刪除和修改，由新到舊。紀錄不能修改或刪除。" />
      <p className="mb-4 flex items-start gap-2 rounded-xl bg-tp-warn-200/10 px-4 py-3 text-xs leading-relaxed text-tp-warn-200">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        紀錄可能含有被刪內容裡的個資，只能在後台查看，請勿截圖或轉傳。
      </p>
      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        aria-label="篩選"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter({ target_id: targetInput.trim() || undefined, admin_id: adminInput.trim() || undefined });
        }}
      >
        <Select label="動作" value={action} onChange={setAction} options={[["", "全部動作"], ...ACTIONS]} />
        <input value={targetInput} onChange={(e) => setTargetInput(e.target.value)} placeholder="對象 ID" aria-label="對象 ID" className={cn(inputClass, "w-40 font-mono")} />
        <input value={adminInput} onChange={(e) => setAdminInput(e.target.value)} placeholder="管理員 ID" aria-label="管理員 ID" className={cn(inputClass, "w-40 font-mono")} />
        <Button type="submit">查詢</Button>
      </form>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      <Card className="overflow-hidden">
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <Empty>沒有符合的紀錄</Empty>
        ) : (
          <ul className="divide-y divide-tp-gray-100">
            {list.items.map((e) => (
              <AuditRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
        <LoadMore hasMore={list.hasMore} busy={list.loadingMore} onClick={list.loadMore} />
      </Card>
    </>
  );
}

function AuditRow({ entry: e }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const destructive = e.action.endsWith(".delete") || e.action === "user.ban";
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left text-sm hover:bg-tp-gray-50">
        <span className="w-24 shrink-0 text-xs whitespace-nowrap text-tp-gray-500">{formatTime(e.created_at)}</span>
        <Badge tone={destructive ? "warn" : "gray"}>{ACTION_LABEL[e.action] ?? e.action}</Badge>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-tp-gray-500">{TARGET_LABEL[e.target_type]}</span> <code className="font-mono text-xs">{e.target_id}</code>
        </span>
        <span className="text-xs text-tp-gray-600">{e.admin.nickname}</span>
        <ChevronDown className={cn("size-4 text-tp-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-5 pb-4">
          <Detail detail={e.detail} deleted={e.action.endsWith(".delete")} />
        </div>
      )}
    </li>
  );
}

function pretty(v: unknown) {
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/** 修改有 before／after 就左右對照；刪除顯示保留下來的原文 */
function Detail({ detail, deleted }: { detail: Record<string, unknown>; deleted: boolean }) {
  const keys = Object.keys(detail ?? {});
  if (keys.length === 0) return <p className="text-xs text-tp-gray-500">沒有其他細節</p>;
  if ("before" in detail && "after" in detail) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {(["before", "after"] as const).map((k) => (
          <div key={k}>
            <p className="mb-1 text-xs font-semibold text-tp-gray-600">{k === "before" ? "修改前" : "修改後"}</p>
            <pre className={cn("max-h-64 overflow-auto rounded-lg p-3 text-xs leading-relaxed whitespace-pre-wrap", k === "before" ? "bg-tp-warn-200/5" : "bg-tp-primary-50")}>{pretty(detail[k])}</pre>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-tp-gray-600">{deleted ? "刪除時保留的原文" : "細節"}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-tp-gray-50 p-3 text-xs leading-relaxed whitespace-pre-wrap">{pretty(detail)}</pre>
    </div>
  );
}
