"use client";

import {
  BarChart3,
  ClipboardList,
  DatabaseZap,
  Inbox,
  LogOut,
  MessagesSquare,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { clearSession, createAdminApi, login, readSession, type AdminApi, type AdminSession, type QuestionFilter } from "./api";
import { createMockAdminApi } from "./mock-api";
import { AnalyticsSection } from "./sections/analytics";
import { AuditSection } from "./sections/audit";
import { CacheSection } from "./sections/cache";
import { ContentSection } from "./sections/content";
import { PendingSection } from "./sections/pending";
import { UsersSection } from "./sections/users";
import { Button, ToastProvider, errorText, inputClass } from "./ui";

export type SectionId = "analytics" | "pending" | "content" | "users" | "cache" | "audit";

const NAV: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "analytics", label: "頁面問題分析", icon: BarChart3 },
  { id: "pending", label: "待處理事項", icon: Inbox },
  { id: "content", label: "內容管理", icon: MessagesSquare },
  { id: "users", label: "使用者管理", icon: Users },
  { id: "cache", label: "語意快取評分", icon: DatabaseZap },
  { id: "audit", label: "稽核紀錄", icon: ClipboardList },
];

const noopSubscribe = () => () => {};

/** 只在瀏覽器掛載：登入狀態存在 sessionStorage，伺服器端預先渲染時讀不到 */
export default function AdminApp() {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <div className="min-h-dvh bg-tp-gray-50" />;
  return (
    <ToastProvider>
      <AdminGate />
    </ToastProvider>
  );
}

function AdminGate() {
  const demo = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "mock", []);
  const [session, setSession] = useState<AdminSession | null>(() => (demo ? null : readSession()));
  const api = useMemo<AdminApi | null>(() => {
    if (demo) return createMockAdminApi();
    if (!session) return null;
    return createAdminApi(session, () => {
      clearSession();
      setSession(null);
    });
  }, [demo, session]);

  if (!api) return <LoginScreen onLogin={setSession} />;
  return (
    <AdminShell
      api={api}
      onLogout={() => {
        clearSession();
        if (demo) window.location.search = "";
        else setSession(null);
      }}
    />
  );
}

function LoginScreen({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!id.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      onLogin(await login(id.trim()));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-tp-gray-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-tp-gray-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="flex size-10 items-center justify-center rounded-xl bg-tp-primary-500 text-white">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-tp-gray-900">論壇管理後台</h1>
            <p className="text-xs text-tp-gray-500">城市通 · 只有管理員可以使用</p>
          </div>
        </div>
        <label className="mt-6 block text-sm font-medium text-tp-gray-800">
          管理員 ID
          {/* 管理員 ID 等同通行碼：用密碼欄位，不讓瀏覽器記住或顯示在畫面上 */}
          <input
            type="password"
            autoComplete="off"
            value={id}
            onChange={(e) => setId(e.target.value)}
            className={cn(inputClass, "mt-1.5 w-full")}
            placeholder="向後端負責人索取"
          />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-tp-warn-200">{error}</p>}
        <Button type="submit" variant="primary" busy={busy} disabled={!id.trim()} className="mt-5 w-full">
          登入
        </Button>
        <p className="mt-4 text-center text-xs text-tp-gray-500">
          只想看介面？用{" "}
          <a href="?demo=mock" className="font-semibold text-tp-primary-500 underline">
            示範資料
          </a>{" "}
          開啟
        </p>
      </form>
    </main>
  );
}

function readHash(): SectionId {
  const h = window.location.hash.slice(1) as SectionId;
  return NAV.some((n) => n.id === h) ? h : "analytics";
}

function AdminShell({ api, onLogout }: { api: AdminApi; onLogout: () => void }) {
  const [section, setSection] = useState<SectionId>(readHash);
  /** 從頁面分析點進內容管理時帶過去的篩選 */
  const [contentFilter, setContentFilter] = useState<QuestionFilter>({});

  useEffect(() => {
    const onHash = () => setSection(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.title = `${NAV.find((n) => n.id === section)?.label ?? ""}｜論壇管理後台`;
  }, [section]);

  function go(id: SectionId) {
    // 記在網址的 # 後面：重新整理或分享連結時停在同一頁
    window.history.pushState(null, "", `#${id}`);
    setSection(id);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-tp-gray-50 text-tp-gray-900 lg:flex-row">
      <aside className="shrink-0 border-b border-tp-gray-100 bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3 lg:py-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-tp-primary-500 text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">論壇管理後台</p>
            <p className="truncate text-xs text-tp-gray-500">
              {api.me.nickname}
              {api.demo && " · 示範資料"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout} className="lg:hidden" aria-label="登出">
            <LogOut className="size-4" />
          </Button>
        </div>
        <nav aria-label="後台功能" className="no-scrollbar flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-3">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={section === id ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors",
                section === id ? "bg-tp-primary-50 font-bold text-tp-primary-500" : "text-tp-gray-700 hover:bg-tp-gray-50",
              )}
            >
              <Icon className="size-[18px]" />
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden border-t border-tp-gray-100 p-3 lg:block">
          {api.demo && <p className="mb-2 rounded-lg bg-tp-secondary-100 px-3 py-2 text-xs leading-relaxed text-tp-secondary-800">示範模式：資料只存在這個分頁，重新整理就會重置。</p>}
          <Button variant="ghost" onClick={onLogout} className="w-full justify-start">
            <LogOut className="size-4" />
            {api.demo ? "離開示範" : "登出"}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-5 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-6xl">
          {section === "analytics" && (
            <AnalyticsSection
              api={api}
              onOpenService={(serviceId) => {
                setContentFilter({ service_id: serviceId });
                go("content");
              }}
            />
          )}
          {section === "pending" && <PendingSection api={api} />}
          {section === "content" && <ContentSection key={JSON.stringify(contentFilter)} api={api} initialFilter={contentFilter} />}
          {section === "users" && <UsersSection api={api} />}
          {section === "cache" && <CacheSection api={api} />}
          {section === "audit" && <AuditSection api={api} />}
        </div>
      </main>
    </div>
  );
}
