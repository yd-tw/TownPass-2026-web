"use client";

import { LoaderCircle, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { META } from "@/app/ui/line/api/mock-api";
import { isUncategorized, questionSystemTag } from "@/app/ui/line/categories";
import type { CategoryId } from "@/app/ui/line/api/types";
import { ApiError, type Page, type QuestionStatus, type QuestionSummary, type UserRole } from "./api";

// ---- 錯誤訊息 ----

export function errorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.code === "FORBIDDEN") return `權限不足：${e.message}`;
    return e.message;
  }
  return "連線失敗，請稍後再試";
}

// ---- 提示訊息 ----

type Toast = { id: number; text: string; tone: "info" | "error" };
const ToastContext = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    // 錯誤要等使用者關掉，一般提示 4 秒後消失
    if (tone === "info") setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-xl px-4 py-3 text-sm text-white shadow-lg animate-in fade-in slide-in-from-bottom-2",
              t.tone === "error" ? "bg-tp-warn-200" : "bg-tp-gray-900",
            )}
          >
            <p className="flex-1 leading-relaxed">{t.text}</p>
            <button type="button" aria-label="關閉" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} className="-mr-1 rounded p-0.5 opacity-80 hover:opacity-100">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---- 載入資料 ----

/** 依 deps 載入一次；回傳 reload 讓操作後重抓 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let cancelled = false;
    // 在 then 裡才 setState，不在 effect 本體同步呼叫
    Promise.resolve()
      .then(() => {
        if (!cancelled) setState((s) => ({ ...s, loading: true, error: undefined }));
        return fn();
      })
      .then((data) => {
        if (!cancelled) setState({ data, loading: false });
      })
      .catch((e) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: errorText(e) }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps 由呼叫端決定
  }, [...deps, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/** 依 next_cursor 分頁的列表：先載第一頁，按「載入更多」再接下一頁 */
export function usePaged<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  });
  const first = useAsync(() => fetchRef.current(null), deps);
  const [firstData, setFirstData] = useState<Page<T> | undefined>(undefined);
  if (first.data !== firstData) {
    // 第一頁換了（篩選改變或重抓）：重設列表
    setFirstData(first.data);
    setItems(first.data?.items ?? []);
    setNext(first.data?.next ?? null);
  }
  const notify = useToast();
  async function loadMore() {
    if (!next || more) return;
    setMore(true);
    try {
      const p = await fetchRef.current(next);
      setItems((x) => [...x, ...p.items]);
      setNext(p.next);
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      setMore(false);
    }
  }
  return { items, setItems, loading: first.loading, error: first.error, reload: first.reload, hasMore: !!next, loadingMore: more, loadMore };
}

// ---- 元件 ----

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  busy?: boolean;
};

/** 官方用法：主要按鈕 primary-500 白字粗體 */
export function Button({ variant = "secondary", size = "md", busy, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        variant === "primary" && "bg-tp-primary-500 text-white hover:bg-tp-primary-600",
        variant === "secondary" && "border border-tp-gray-200 bg-white text-tp-gray-800 hover:bg-tp-gray-50",
        variant === "danger" && "bg-tp-warn-200 text-white hover:bg-tp-warn-200/90",
        variant === "ghost" && "text-tp-gray-700 hover:bg-tp-gray-100",
        className,
      )}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl border border-tp-gray-100 bg-white", className)}>{children}</section>;
}

export function SectionTitle({ title, desc, action }: { title: string; desc?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-tp-gray-900">{title}</h1>
        {desc && <p className="mt-1 text-sm text-tp-gray-600">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "gray", className }: { children: ReactNode; tone?: "gray" | "primary" | "warn" | "secondary" | "grape"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        tone === "gray" && "bg-tp-gray-100 text-tp-gray-700",
        tone === "primary" && "bg-tp-primary-50 text-tp-primary-700",
        tone === "warn" && "bg-tp-warn-200/10 text-tp-warn-200",
        tone === "secondary" && "bg-tp-secondary-100 text-tp-secondary-800",
        tone === "grape" && "bg-[#5e73b4]/12 text-[#46579a]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const STATUS_LABEL: Record<QuestionStatus, string> = { open: "未解決", in_progress: "協助中", resolved: "已解決" };

export function StatusBadge({ status }: { status: QuestionStatus }) {
  return <Badge tone={status === "resolved" ? "primary" : status === "in_progress" ? "grape" : "secondary"}>{STATUS_LABEL[status]}</Badge>;
}

type TagSource = Pick<QuestionSummary, "system_tag" | "category" | "tags">;

/** 固定標籤（system_tag）：後端決定，未分類時用黃色提醒 */
export function SystemTagBadge({ q }: { q: TagSource }) {
  const tag = questionSystemTag(q);
  if (!tag) return null;
  return (
    <Badge tone={isUncategorized(q) ? "secondary" : "gray"} className="gap-0.5">
      <span aria-hidden>#</span>
      {tag.replace(/^#/, "")}
    </Badge>
  );
}

/** 固定標籤對應的分類代碼（PUT /questions/{id}/category 要傳代碼） */
export function categoryOf(q: TagSource): CategoryId {
  if (q.category) return q.category;
  const tag = questionSystemTag(q)?.replace(/^#/, "");
  return META.categories.find((c) => c.label === tag)?.id ?? "uncategorized";
}

export const ROLE_LABEL: Record<UserRole, string> = { user: "一般使用者", admin: "管理員", bot: "機器人" };

export function RoleBadge({ role }: { role: UserRole }) {
  if (role === "user") return null;
  return <Badge tone={role === "admin" ? "primary" : "grape"}>{role === "bot" ? "🤖 機器人" : "管理員"}</Badge>;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn("h-10 rounded-lg border border-tp-gray-200 bg-white px-2.5 text-sm text-tp-gray-900 outline-none focus:border-tp-primary-500 disabled:opacity-50", className)}
    >
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export const inputClass =
  "h-10 rounded-lg border border-tp-gray-200 bg-white px-3 text-sm text-tp-gray-900 outline-none placeholder:text-tp-gray-400 focus:border-tp-primary-500";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-12 text-center text-sm text-tp-gray-500">{children}</p>;
}

export function Loading() {
  return (
    <div className="flex justify-center py-12 text-tp-gray-500">
      <LoaderCircle className="size-6 animate-spin" aria-label="載入中" />
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-tp-warn-200/10 px-4 py-3 text-sm text-tp-warn-200">
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          重試
        </Button>
      )}
    </div>
  );
}

export function LoadMore({ hasMore, busy, onClick }: { hasMore: boolean; busy: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-tp-gray-100 p-3">
      <Button size="sm" busy={busy} onClick={onClick}>
        載入更多
      </Button>
    </div>
  );
}

/** 二次確認；需要填原因時帶 input */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  input,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  input?: { label: string; placeholder?: string; maxLength?: number };
  onCancel: () => void;
  onConfirm: (value: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-in fade-in" onClick={() => !busy && onCancel()}>
      <div role="alertdialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl animate-in zoom-in-95">
        <h2 className="text-lg font-bold text-tp-gray-900">{title}</h2>
        <div className="mt-2 text-sm leading-relaxed text-tp-gray-700">{body}</div>
        {input && (
          <label className="mt-4 block text-sm text-tp-gray-700">
            {input.label}
            <textarea
              autoFocus
              value={value}
              maxLength={input.maxLength}
              placeholder={input.placeholder}
              onChange={(e) => setValue(e.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-lg border border-tp-gray-200 p-2.5 text-sm outline-none focus:border-tp-primary-500"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={busy} onClick={onCancel}>
            取消
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            busy={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(value.trim());
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- 時間 ----

const dateTime = new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const t = Date.parse(value);
  return Number.isNaN(t) ? value : dateTime.format(t);
}

export function timeAgo(value: string, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  if (m < 1) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  if (m < 1440) return `${Math.floor(m / 60)} 小時前`;
  return `${Math.floor(m / 1440)} 天前`;
}
