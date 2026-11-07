"use client";

import { Bot, CircleCheckBig, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { META } from "@/app/ui/line/api/mock-api";
import type { CategoryId } from "@/app/ui/line/api/types";
import { questionManualTags, questionSystemTag } from "@/app/ui/line/categories";
import type { AdminApi, Answer, QuestionDetail } from "../api";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorBox,
  Loading,
  RoleBadge,
  Select,
  StatusBadge,
  SystemTagBadge,
  categoryOf,
  errorText,
  formatTime,
  inputClass,
  useAsync,
  useToast,
} from "../ui";

const CATEGORY_OPTIONS = META.categories.map((c) => [c.id, c.label] as const);
const TAG_PATTERN = /^[\p{L}\p{N} _\-·]{1,20}$/u;

/**
 * 問題詳情（右側抽屜）：內容、媒體、回答、頁面資訊和 context.extra。
 * 修改或刪除別人的內容時，作者會收到 content_moderated 通知。
 */
export function QuestionPanel({
  api,
  questionId,
  onClose,
  onChanged,
}: {
  api: AdminApi;
  questionId: string;
  onClose: () => void;
  /** 內容有變（含刪除）時通知列表重抓 */
  onChanged: () => void;
}) {
  const notify = useToast();
  const { data, error, loading, reload } = useAsync(
    () => Promise.all([api.getQuestion(questionId), api.listAnswers(questionId)]),
    [api, questionId],
  );
  const [confirm, setConfirm] = useState<null | { kind: "question" } | { kind: "answer"; answer: Answer }>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && !confirm && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirm, onClose]);

  /** 執行一個操作；成功就重抓並通知列表 */
  async function run(action: () => Promise<unknown>, done: string) {
    try {
      await action();
      notify(done);
      reload();
      onChanged();
      return true;
    } catch (e) {
      notify(errorText(e), "error");
      return false;
    }
  }

  const [q, answers] = data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 animate-in fade-in" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal
        aria-label="問題詳情"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col bg-tp-gray-50 shadow-2xl animate-in slide-in-from-right duration-200"
      >
        <header className="flex items-center gap-2 border-b border-tp-gray-100 bg-white px-5 py-3">
          <h2 className="flex-1 font-bold">問題詳情</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="關閉">
            <X className="size-5" />
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && <ErrorBox message={error} onRetry={reload} />}
          {loading && !q && <Loading />}
          {q && answers && (
            <>
              <QuestionEditor key={`${q.id}-${q.title}-${q.body}`} api={api} q={q} run={run} onDelete={() => setConfirm({ kind: "question" })} />
              <Organize key={`org-${q.id}-${q.tags.join(",")}`} api={api} q={q} run={run} />
              <ContextBlock q={q} />
              <section>
                <h3 className="mb-2 text-sm font-bold text-tp-gray-800">回答（{answers.length}）</h3>
                {answers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-tp-gray-200 py-6 text-center text-sm text-tp-gray-500">還沒有人回答</p>
                ) : (
                  <ul className="space-y-2">
                    {answers.map((a) => (
                      <AnswerItem key={`${a.id}-${a.body}`} api={api} answer={a} run={run} onDelete={() => setConfirm({ kind: "answer", answer: a })} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>

      {confirm && q && (
        <ConfirmDialog
          danger
          title={confirm.kind === "question" ? "刪除這個問題？" : "刪除這則回答？"}
          body={
            <>
              <p>沒有還原功能，內容只會留在稽核紀錄，媒體檔會真的刪除。</p>
              {confirm.kind === "answer" && confirm.answer.is_accepted && <p className="mt-2 font-semibold text-tp-warn-200">這是已採納的回答。</p>}
              <p className="mt-2">作者會收到通知。</p>
            </>
          }
          confirmLabel="刪除"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            if (confirm.kind === "question") {
              try {
                await api.deleteQuestion(q.id);
                notify("已刪除問題");
                onChanged();
                onClose();
              } catch (e) {
                notify(errorText(e), "error");
              }
            } else {
              await run(() => api.deleteAnswer(confirm.answer.id), "已刪除回答");
            }
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

type Run = (action: () => Promise<unknown>, done: string) => Promise<boolean>;

function QuestionEditor({ api, q, run, onDelete }: { api: AdminApi; q: QuestionDetail; run: Run; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(q.title ?? "");
  const [body, setBody] = useState(q.body ?? "");
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const hidden = q.hidden_parts.length > 0;

  async function save() {
    setBusy(true);
    const ok = await run(() => api.editQuestion(q.id, { title: title.trim(), body: body.trim() || null }), "已修改問題，作者會收到通知");
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <section className="rounded-2xl border border-tp-gray-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={q.status} />
        <SystemTagBadge q={q} />
        {hidden && (
          <Badge tone="warn">
            <EyeOff className="size-3" />
            個資待確認，一般使用者看不到部分內容
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-label="標題" className={`${inputClass} w-full font-semibold`} />
          <textarea value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} aria-label="內文" rows={6} className="w-full resize-y rounded-lg border border-tp-gray-200 p-3 text-sm leading-relaxed outline-none focus:border-tp-primary-500" />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setEditing(false)} disabled={busy}>
              取消
            </Button>
            <Button size="sm" variant="primary" busy={busy} disabled={!title.trim()} onClick={save}>
              儲存
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h3 className="mt-3 text-lg font-bold text-tp-gray-900">{q.title ?? "（標題待確認）"}</h3>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-tp-gray-800">{q.body ?? "（沒有文字內容）"}</p>
        </>
      )}

      {q.media.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {q.media.map((m) =>
            m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- 後端媒體網址，不經過 next/image
              <a key={m.id} href={m.url} target="_blank" rel="noreferrer"><img src={m.url} alt="附圖" className="h-28 rounded-lg border border-tp-gray-100 object-cover" /></a>
            ) : m.kind === "audio" ? (
              <audio key={m.id} src={m.url} controls className="h-10" />
            ) : (
              <video key={m.id} src={m.url} controls className="h-40 rounded-lg bg-black" />
            ),
          )}
        </div>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-tp-gray-500">
        {q.author.nickname} <RoleBadge role={q.author.role} /> · {formatTime(q.created_at)} · <code className="font-mono">{q.id}</code>
      </p>

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-tp-gray-100 pt-3">
          <Button size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            修改內容
          </Button>
          {q.status !== "resolved" && (
            <Button
              size="sm"
              busy={resolving}
              onClick={async () => {
                setResolving(true);
                await run(() => api.resolve(q.id), "已標記為已解決");
                setResolving(false);
              }}
            >
              <CircleCheckBig className="size-3.5" />
              標記已解決
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} className="ml-auto text-tp-warn-200 hover:bg-tp-warn-200/10">
            <Trash2 className="size-3.5" />
            刪除問題
          </Button>
        </div>
      )}
    </section>
  );
}

/**
 * 整理標籤：tags 第一個是後端決定的固定標籤（用分類代碼修改，不能刪），
 * 後面最多 5 個手動標籤（PUT /tags 只送手動標籤）。
 */
function Organize({ api, q, run }: { api: AdminApi; q: QuestionDetail; run: Run }) {
  const original = questionManualTags(q);
  const fixed = questionSystemTag(q)?.replace(/^#/, "");
  const [category, setCategory] = useState<CategoryId>(categoryOf(q));
  const [tags, setTags] = useState<string[]>(original);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<"category" | "tags" | null>(null);
  const tagsChanged = tags.join("\u0000") !== original.join("\u0000");
  const notify = useToast();

  function addTag() {
    const t = input.replace(/^#/, "").trim();
    if (!t) return;
    if (!TAG_PATTERN.test(t)) {
      notify("標籤 1 到 20 字，只能有文字、數字、空白、-、_、·", "error");
      return;
    }
    if (tags.length >= 5) {
      notify("標籤最多 5 個", "error");
      return;
    }
    if (t === fixed) {
      setInput("");
      return;
    }
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
    setInput("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addTag();
    }
  }

  return (
    <section className="grid gap-4 rounded-2xl border border-tp-gray-100 bg-white p-4 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-bold text-tp-gray-800">固定標籤</h3>
        <div className="flex gap-2">
          <Select label="固定標籤" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="flex-1" />
          <Button
            size="md"
            variant="primary"
            disabled={category === categoryOf(q)}
            busy={busy === "category"}
            onClick={async () => {
              setBusy("category");
              await run(() => api.setCategory(q.id, category), "已修改固定標籤");
              setBusy(null);
            }}
          >
            套用
          </Button>
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold text-tp-gray-800">手動標籤（{tags.length}/5）</h3>
        <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-tp-gray-200 px-2 py-1.5 focus-within:border-tp-primary-500">
          {fixed && (
            <span className="inline-flex items-center rounded-md bg-tp-gray-100 px-1.5 py-0.5 text-xs font-semibold text-tp-gray-600" title="固定標籤由後端決定，請用左邊的選單修改">
              #{fixed}
            </span>
          )}
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-0.5 rounded-md bg-tp-primary-50 py-0.5 pr-0.5 pl-1.5 text-xs font-semibold text-tp-primary-700">
              #{t}
              <button type="button" aria-label={`移除標籤 ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))} className="rounded p-0.5 hover:bg-tp-primary-100">
                <X className="size-3" />
              </button>
            </span>
          ))}
          {tags.length < 5 && (
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onBlur={addTag} maxLength={21} placeholder="輸入後按 Enter" aria-label="新增標籤" className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-tp-gray-400" />
          )}
        </div>
        <div className="mt-2 flex justify-end gap-2">
          {tagsChanged && (
            <Button size="sm" variant="ghost" onClick={() => setTags(original)}>
              還原
            </Button>
          )}
          <Button
            size="sm"
            variant="primary"
            disabled={!tagsChanged}
            busy={busy === "tags"}
            onClick={async () => {
              setBusy("tags");
              await run(() => api.setTags(q.id, tags), "已更新手動標籤");
              setBusy(null);
            }}
          >
            <Plus className="size-3.5" />
            儲存標籤
          </Button>
        </div>
      </div>
    </section>
  );
}

function ContextBlock({ q }: { q: QuestionDetail }) {
  const c = q.context;
  return (
    <section className="rounded-2xl border border-tp-gray-100 bg-white p-4">
      <h3 className="mb-2 text-sm font-bold text-tp-gray-800">頁面資訊</h3>
      {!c ? (
        <p className="text-sm text-tp-gray-500">沒有頁面資訊（例如直接從論壇發問）</p>
      ) : (
        <>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-tp-gray-500">功能</dt>
            <dd>
              {c.service_name} <code className="text-xs text-tp-gray-500">{c.service_id}</code>
            </dd>
            <dt className="text-tp-gray-500">頁面</dt>
            <dd>
              {c.page_title ?? "—"} {c.page_route && <code className="text-xs text-tp-gray-500">{c.page_route}</code>}
            </dd>
          </dl>
          {c.extra && Object.keys(c.extra).length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-tp-primary-500">裝置資訊與瀏覽過的頁面（context.extra）</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-tp-gray-50 p-3 text-xs leading-relaxed text-tp-gray-800">{JSON.stringify(c.extra, null, 2)}</pre>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function AnswerItem({ api, answer, run, onDelete }: { api: AdminApi; answer: Answer; run: Run; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(answer.body ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <li className="rounded-xl border border-tp-gray-100 bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold">{answer.author.nickname}</span>
        <RoleBadge role={answer.author.role} />
        {answer.cached_from && (
          <Badge tone="grape">
            <Bot className="size-3" />
            語意快取的舊解答
          </Badge>
        )}
        {answer.is_accepted && <Badge tone="primary">已採納</Badge>}
        {answer.hidden_parts.length > 0 && <Badge tone="warn">個資待確認</Badge>}
        <span className="ml-auto text-xs text-tp-gray-500">
          {formatTime(answer.created_at)} · 👍 {answer.votes.upvotes}
        </span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} rows={4} aria-label="回答內容" className="w-full resize-y rounded-lg border border-tp-gray-200 p-2.5 text-sm outline-none focus:border-tp-primary-500" />
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={busy} onClick={() => setEditing(false)}>
              取消
            </Button>
            <Button
              size="sm"
              variant="primary"
              busy={busy}
              disabled={!body.trim()}
              onClick={async () => {
                setBusy(true);
                const ok = await run(() => api.editAnswer(answer.id, body.trim()), "已修改回答，作者會收到通知");
                setBusy(false);
                if (ok) setEditing(false);
              }}
            >
              儲存
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-tp-gray-800">{answer.body ?? "（只有附件）"}</p>
      )}
      {!editing && (
        <div className="mt-2 flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            修改
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete} className="text-tp-warn-200 hover:bg-tp-warn-200/10">
            <Trash2 className="size-3.5" />
            刪除
          </Button>
        </div>
      )}
    </li>
  );
}
