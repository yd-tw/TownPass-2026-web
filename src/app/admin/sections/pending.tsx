"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CategoryId } from "@/app/ui/line/api/types";
import type { AdminApi, PiiReport, PiiStatus, QuestionDetail } from "../api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  SectionTitle,
  Select,
  errorText,
  formatTime,
  timeAgo,
  useAdminMeta,
  usePaged,
  useToast,
} from "../ui";
import { QuestionPanel } from "./question-panel";

export function PendingSection({ api }: { api: AdminApi }) {
  const [tab, setTab] = useState<"classify" | "pii">("classify");
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <>
      <SectionTitle title="待處理事項" desc="分類器沒有把握的問題，以及等待決定的個資標記。" />
      <div className="mb-4 flex gap-1 rounded-xl bg-tp-gray-100 p-1 sm:w-fit" role="tablist">
        {(
          [
            ["classify", "待分類問題"],
            ["pii", "個資標記"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn("flex-1 rounded-lg px-4 py-2 text-sm font-semibold sm:flex-none", tab === id ? "bg-white text-tp-primary-500 shadow-sm" : "text-tp-gray-600")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "classify" ? <Classify api={api} onOpen={setOpenId} /> : <PiiReports api={api} onOpen={setOpenId} />}
      {openId && <QuestionPanel api={api} questionId={openId} onClose={() => setOpenId(null)} onChanged={() => {}} />}
    </>
  );
}

function Classify({ api, onOpen }: { api: AdminApi; onOpen: (id: string) => void }) {
  const meta = useAdminMeta();
  const options = meta.categories.filter((c) => c.id !== "uncategorized").map((c) => [c.id, c.label] as const);
  const list = usePaged((cursor) => api.listQuestions({ category: "uncategorized" }, cursor), [api]);
  return (
    <>
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      <Card className="overflow-hidden">
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.items.length === 0 ? (
          <Empty>沒有待分類的問題 🎉</Empty>
        ) : (
          <ul className="divide-y divide-tp-gray-100">
            {list.items.map((q) => (
              <ClassifyRow key={q.id} api={api} q={q} options={options} onOpen={onOpen} onDone={() => list.setItems((x) => x.filter((y) => y.id !== q.id))} />
            ))}
          </ul>
        )}
        <LoadMore hasMore={list.hasMore} busy={list.loadingMore} onClick={list.loadMore} />
      </Card>
    </>
  );
}

function ClassifyRow({ api, q, options, onOpen, onDone }: { api: AdminApi; q: QuestionDetail; options: readonly (readonly [CategoryId, string])[]; onOpen: (id: string) => void; onDone: () => void }) {
  const [category, setCategory] = useState<CategoryId>("other");
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(q.id)} className="line-clamp-2 break-words text-left font-semibold hover:text-tp-primary-500">
          {q.body ?? (q.hidden_parts.some((part) => part.part === "body") ? "（內文待個資確認）" : q.media.length > 0 ? "（只有附件）" : "（沒有文字內容）")}
        </button>
        <p className="mt-0.5 text-xs text-tp-gray-500">
          {q.author.nickname} · {timeAgo(q.created_at)}
          {q.context && ` · ${q.context.service_name}${q.context.page_title ? `／${q.context.page_title}` : ""}`}
        </p>
      </div>
      <Select label="選擇固定標籤" value={category} onChange={setCategory} options={options} />
      <Button
        variant="primary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.setCategory(q.id, category);
            notify(`已分類為「${options.find((c) => c[0] === category)?.[1]}」`);
            onDone();
          } catch (e) {
            notify(errorText(e), "error");
          } finally {
            setBusy(false);
          }
        }}
      >
        分類
      </Button>
    </li>
  );
}

const PII_STATUS: [PiiStatus | "", string][] = [
  ["pending", "待處理"],
  ["accepted", "已遮蔽"],
  ["denied", "已恢復顯示"],
  ["", "全部"],
];

function PiiReports({ api, onOpen }: { api: AdminApi; onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<PiiStatus | "">("pending");
  const list = usePaged((cursor) => api.listPiiReports(status || undefined, cursor), [api, status]);
  const [confirm, setConfirm] = useState<{ report: PiiReport; kind: "accept" | "deny" } | null>(null);
  const notify = useToast();

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Select label="狀態" value={status} onChange={setStatus} options={PII_STATUS} />
        <p className="text-xs text-tp-gray-500">發問者沒有回應時，內容會一直隱藏，可以在這裡決定。</p>
      </div>
      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      {list.loading && list.items.length === 0 ? (
        <Loading />
      ) : list.items.length === 0 ? (
        <Card>
          <Empty>{status === "pending" ? "沒有待處理的個資標記" : "沒有符合的標記"}</Empty>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.items.map((r) => (
            <PiiCard key={r.id} report={r} onOpen={onOpen} onDecide={(kind) => setConfirm({ report: r, kind })} />
          ))}
        </ul>
      )}
      <LoadMore hasMore={list.hasMore} busy={list.loadingMore} onClick={list.loadMore} />

      {confirm && (
        <ConfirmDialog
          danger={confirm.kind === "accept"}
          title={confirm.kind === "accept" ? "同意遮蔽？" : "拒絕並恢復顯示？"}
          body={
            confirm.kind === "accept" ? (
              <p>
                遮蔽後<strong className="text-tp-warn-200">無法復原</strong>，被標記的部分會永久遮住。
              </p>
            ) : (
              <p>被標記的內容會恢復顯示給所有人。</p>
            )
          }
          confirmLabel={confirm.kind === "accept" ? "同意遮蔽" : "恢復顯示"}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              if (confirm.kind === "accept") await api.acceptPii(confirm.report.id);
              else await api.denyPii(confirm.report.id);
              notify(confirm.kind === "accept" ? "已遮蔽" : "已恢復顯示");
              list.reload();
            } catch (e) {
              notify(errorText(e), "error");
            }
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

/** 依 code point 切開文字，把標記範圍框起來 */
function HighlightedText({ text, ranges }: { text: string; ranges: { start: number; end: number }[] }) {
  const chars = Array.from(text);
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const r of ranges) for (let i = Math.max(0, r.start); i < Math.min(chars.length, r.end); i++) marked[i] = true;
  const parts: { text: string; mark: boolean }[] = [];
  chars.forEach((c, i) => {
    const last = parts.at(-1);
    if (last && last.mark === marked[i]) last.text += c;
    else parts.push({ text: c, mark: marked[i] });
  });
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap text-tp-gray-800">
      {parts.map((p, i) =>
        p.mark ? (
          <mark key={i} className="rounded bg-tp-warn-200/15 px-0.5 text-tp-warn-200 ring-1 ring-tp-warn-200/40">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

function PiiCard({ report: r, onOpen, onDecide }: { report: PiiReport; onOpen: (id: string) => void; onDecide: (kind: "accept" | "deny") => void }) {
  const isImage = !!r.media_id;
  return (
    <li className="flex flex-col rounded-2xl border border-tp-gray-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={r.status === "pending" ? "warn" : r.status === "accepted" ? "gray" : "primary"}>
          {r.status === "pending" ? "待處理" : r.status === "accepted" ? "已遮蔽" : "已恢復顯示"}
        </Badge>
        <Badge>{r.target_type === "question" ? "問題" : "回答"}{isImage ? "的圖片" : r.text_field === "title" ? "的標題" : "的內文"}</Badge>
        <span className="ml-auto text-xs text-tp-gray-500" title={formatTime(r.created_at)}>{timeAgo(r.created_at)}</span>
      </div>

      <div className="mt-3 flex-1">
        {isImage ? (
          r.preview_url ? (
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element -- 短效預覽連結 */}
              <img src={r.preview_url} alt="被標記的圖片" className="block max-h-56 max-w-full rounded-lg border border-tp-gray-100" />
              {(r.regions ?? []).map((g, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="absolute rounded-sm border-2 border-tp-warn-200 bg-tp-warn-200/20"
                  style={{ left: `${g.x * 100}%`, top: `${g.y * 100}%`, width: `${g.w * 100}%`, height: `${g.h * 100}%` }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-tp-gray-500">圖片預覽已過期或無法顯示，標記了 {r.regions?.length ?? 0} 個區域</p>
          )
        ) : r.original_text ? (
          <HighlightedText text={r.original_text} ranges={r.text_ranges ?? []} />
        ) : (
          <p className="text-sm text-tp-gray-500">標記了 {r.text_ranges?.length ?? 0} 段文字{r.status !== "pending" && "（處理後不再提供原文）"}</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-tp-gray-100 pt-3">
        <Button size="sm" variant="ghost" onClick={() => onOpen(r.question_id)}>
          看問題
        </Button>
        {r.status === "pending" && (
          <>
            <Button size="sm" className="ml-auto" onClick={() => onDecide("deny")}>
              拒絕並恢復顯示
            </Button>
            <Button size="sm" variant="danger" onClick={() => onDecide("accept")}>
              同意遮蔽
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
