"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type TouchEvent,
} from "react";
import { createMockApi, META } from "./api/mock-api";
import { getCurrentLocation } from "./api/location";
import { connectBackend, getIdentity } from "./api/session";
import { createDeferredApi, type DeferredApi } from "./api/deferred-api";
import { ForumFeed } from "@/app/ui/forum/forum-feed";
import {
  ApiError,
  type Answer,
  type AskerApi,
  type Me,
  type Meta,
  type QuestionDetail,
  type QuestionSummary,
} from "./api/types";
import { ChatRoom, type PendingMedia } from "./chat-room";
import { ChatList, type ChatListActions } from "./chat-list";
import { BottomNav } from "./other-tabs";
import type { Notify, Outgoing, Tab } from "./types";
import { callApp, isInTownPass, type ReportDraft } from "@/lib/townpass-bridge";

const NICK_KEY = "line-demo-nickname";

const noopSubscribe = () => () => {};

/**
 * 發問者用的 LINE 風格畫面：只看得到自己問的問題，每個問題是一個聊天室。
 * 範例資料的時間是相對於「現在」產生的，而 Cache Components 會預先渲染
 * Client Component，所以整個 App 只在瀏覽器端掛載，伺服器端只輸出外框。
 */
const TAB_TITLE: Record<Tab, string> = { chats: "聊天", forum: "討論串" };

/**
 * @param ask 一開啟就進入新問題聊天室（/new「我要發問」）
 */
export default function LineApp({ ask = false }: { ask?: boolean }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-tp-gray-50 sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-[2.25rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10">
      {mounted ? (
        <LineAppInner ask={ask} />
      ) : ask ? (
        // 我要發問：掛載前先鋪聊天室的底色，不顯示轉圈
        <div className="flex-1 bg-tp-gray-100" />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <Connecting />
        </div>
      )}
    </div>
  );
}

/** 掛載前和連線中用同一個畫面，切換時才不會跳一下 */
function Connecting() {
  return (
    <>
      <span className="size-10 animate-spin rounded-full border-4 border-tp-primary-500 border-t-transparent" />
      <p className="text-[17px] text-tp-gray-700">連線中…</p>
    </>
  );
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      return crypto.randomUUID();
    } catch {
      // 非安全來源（例如用區網 IP 的 http 開啟）不能用 randomUUID
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readNickname() {
  try {
    const saved = localStorage.getItem(NICK_KEY);
    if (saved) return saved;
  } catch {
    // 無痕模式等情況讀不到 localStorage
  }
  return `訪客${Math.floor(1000 + Math.random() * 9000)}`;
}

/** 把 API 錯誤碼換成長輩看得懂的句子 */
function errorMessage(e: unknown) {
  if (e instanceof ApiError) {
    switch (e.code) {
      case "NOT_FOUND":
        return "這個問題已經撤回或不存在";
      case "ALREADY_RESOLVED":
        return "這個問題已經解決了";
      case "RATE_LIMITED":
        return "傳得太快了，請稍等一下再試";
      default:
        return e.message;
    }
  }
  return "連線失敗，請稍後再試";
}

/** key 在新問題送出後保持不變，聊天室才不會重新播放進場動畫 */
type Active = {
  key: string;
  id: string | null;
  locationSharing: "off" | "approximate";
  /** 從 App 問題回報開啟的新問題：送出時附上裝置資訊 */
  report?: Report;
  /** 一開頁面就打開的聊天室（/new）：不播放滑入動畫，避免閃一下 */
  instant?: boolean;
};

type Report = { id: string; context: ReportDraft["context"]; media: PendingMedia[] };

/** App 問題回報的提示：截圖已放進待傳附件 */
const REPORT_HINT = "已附上剛才的 App 畫面截圖，個資已自動遮蔽，送出前請再確認\n請說說遇到什麼問題，可以打字或按麥克風錄音";

/** 問題回報的 context：裝置資訊放 extra，只有發問者本人與管理員看得到 */
function reportContext(report: Report) {
  return {
    service_id: "townpass-app",
    service_name: "Town Pass",
    // page_route 不可含 query；完整的 screen 仍會隨 extra 送出
    page_route: (report.context.screen ?? report.context.route).replace(/\?[^+]*/, ""),
    page_title: report.context.screenTitle?.slice(0, 80) || undefined,
    extra: { reportId: report.id, ...report.context },
  };
}

/** 讀取 App 的問題回報草稿，截圖轉成待傳附件；沒有草稿時回傳 null */
async function readReportDraft(): Promise<Report | null> {
  const draft = await callApp<ReportDraft | null>("report_draft");
  if (!draft) return null; // 已讀過、逾時（10 分鐘）或網域不符
  const media: PendingMedia[] = [];
  if (draft.image) {
    try {
      const blob = await (await fetch(draft.image)).blob(); // data URL → Blob
      media.push({ id: makeId(), kind: "image", file: new File([blob], `report-${draft.id}.png`, { type: "image/png" }) });
    } catch {
      // 截圖轉檔失敗仍保留裝置資訊
    }
  }
  return { id: draft.id, context: draft.context, media };
}

/**
 * App 問題回報開啟 /new?source=app-report 時讀草稿；其他情況回傳 null。
 * 讀完把 source 從網址移除，重新整理時才不會再讀（草稿本來就只能讀一次）。
 */
function readReportFromUrl(): Promise<Report | null> {
  const url = new URL(window.location.href);
  if (url.searchParams.get("source") !== "app-report") return Promise.resolve(null);
  url.searchParams.delete("source");
  window.history.replaceState(window.history.state, "", url);
  if (!isInTownPass()) return Promise.resolve(null);
  return readReportDraft().catch(() => null);
}

type Connection =
  | { status: "connecting" }
  | { status: "error"; message: string }
  | { status: "ready"; api: AskerApi; note: string | null };

/**
 * 連上後端。
 * - 網址加上 ?demo=mock 用示範資料；?demo=crowd 模擬發問後有 50～100 位志工回答
 * - 在城市通 App 內用 userinfo.id 登入；一般瀏覽器用這台瀏覽器的測試帳號
 */
async function connect(): Promise<{ api: AskerApi; note: string | null }> {
  const demo = new URLSearchParams(window.location.search).get("demo");
  if (demo === "mock" || demo === "crowd") {
    return {
      api: createMockApi(readNickname(), { crowd: demo === "crowd" }),
      note: "示範模式：資料只存在這個分頁，重新整理就會重置",
    };
  }
  const identity = await getIdentity();
  return {
    api: await connectBackend(identity, readNickname()),
    note: identity.isWebTest ? "瀏覽器測試帳號：目前不是在城市通 App 裡開啟" : null,
  };
}

/**
 * 一般情況先連上後端再顯示畫面。
 * 「我要發問」（/new、?mode=ask）不等連線：先用 deferred API 顯示新問題聊天室，
 * 連線在背景進行，使用者按送出時才會等。
 */
function LineAppInner({ ask }: { ask: boolean }) {
  const [instant] = useState(
    () => ask || new URLSearchParams(window.location.search).get("mode") === "ask",
  );
  const [attempt, setAttempt] = useState(0);
  const [conn, setConn] = useState<Connection>({ status: "connecting" });
  const [deferred, setDeferred] = useState<DeferredApi | null>(() => (instant ? createDeferredApi() : null));
  // App 問題回報的草稿：讀到就交給聊天室放進待傳附件（同一個聊天室，不重新掛載）
  const [report, setReport] = useState<Report | null>(null);
  // 草稿只能讀一次：存在 ref，Strict Mode 重跑 effect 也沿用同一份
  const reportRef = useRef<Promise<Report | null> | null>(null);

  useEffect(() => {
    let cancelled = false;
    reportRef.current ??= readReportFromUrl();
    reportRef.current.then((draft) => {
      if (!cancelled && draft) setReport(draft);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: AskerApi | null = null;
    connect()
      .then(({ api, note }) => {
        created = api;
        if (cancelled) {
          api.close();
          return;
        }
        deferred?.resolve(api);
        setConn({ status: "ready", api, note });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        deferred?.reject(e);
        setConn({
          status: "error",
          message: e instanceof ApiError || e instanceof Error ? e.message : "連線失敗",
        });
      });
    return () => {
      cancelled = true;
      created?.close();
    };
  }, [attempt, deferred]);

  // 我要發問：連線前就顯示；api 一直用 deferred 那份，連上後不會換 api 而重抓資料
  const api = conn.status === "error" ? null : (deferred?.api ?? (conn.status === "ready" ? conn.api : null));
  if (api) {
    return (
      <LineAppConnected
        key={attempt}
        api={api}
        note={conn.status === "ready" ? conn.note : null}
        ask={ask}
        report={report}
      />
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      {conn.status !== "error" ? (
        <Connecting />
      ) : (
        <>
          <p className="text-[19px] font-bold text-tp-gray-900">暫時連不上</p>
          <p className="text-[16px] text-tp-gray-700">
            請確認網路有開，再按下面的按鈕試一次
          </p>
          <p className="text-[13px] text-tp-gray-400">{conn.message}</p>
          <button
            type="button"
            onClick={() => {
              setConn({ status: "connecting" });
              if (instant) setDeferred(createDeferredApi());
              setAttempt((n) => n + 1);
            }}
            className="mt-2 w-full max-w-xs rounded-2xl bg-tp-primary-500 py-4 text-[20px] font-bold text-white active:bg-tp-primary-600"
          >
            重新連線
          </button>
        </>
      )}
    </div>
  );
}

function LineAppConnected({
  api,
  note,
  ask,
  report,
}: {
  api: AskerApi;
  note: string | null;
  ask: boolean;
  report: Report | null;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta>(META);
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [forumQuestions, setForumQuestions] = useState<QuestionDetail[]>([]);
  const [forumBaseQuestions, setForumBaseQuestions] = useState<QuestionDetail[]>([]);
  const [forumSearch, setForumSearch] = useState("");
  const [forumLoading, setForumLoading] = useState(false);
  const [forumHasUpdates, setForumHasUpdates] = useState(false);
  const [forumLoadingMore, setForumLoadingMore] = useState(false);
  const [forumCursor, setForumCursor] = useState<string | null>(null);
  const forumSearchRef = useRef("");
  const forumRequestRef = useRef(0);
  const forumLoadingMoreRef = useRef(false);
  const forumSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [details, setDetails] = useState<Record<string, QuestionDetail>>({});
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const pathname = usePathname();
  const tab: Tab = pathname === "/forum" ? "forum" : "chats";
  const [active, setActive] = useState<Active | null>(() => {
    // 問題回報：截圖已在 LineAppInner 讀好，聊天室第一次出現就帶著
    if (report) {
      return { key: makeId(), id: null, locationSharing: "approximate", report, instant: true };
    }
    return ask || new URLSearchParams(window.location.search).get("mode") === "ask"
      ? { key: makeId(), id: null, locationSharing: "approximate", instant: true }
      : null;
  });
  // 問題回報草稿比聊天室晚到：放進目前的新問題（保留 key，聊天室不重新掛載）
  const [appliedReport, setAppliedReport] = useState(report);
  if (report !== appliedReport) {
    setAppliedReport(report);
    if (report) {
      setActive((a) =>
        a?.id
          ? a
          : {
              key: a?.key ?? makeId(),
              id: null,
              category: "app_usage",
              locationSharing: a?.locationSharing ?? "approximate",
              report,
              instant: a?.instant,
            },
      );
    }
  }
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    tone: "info" | "error";
    id: number;
  } | null>(null);

  // socket 訊號的處理函式需要讀到最新狀態
  const latest = useRef({ me, answers, activeId: active?.id ?? null });
  useEffect(() => {
    latest.current = { me, answers, activeId: active?.id ?? null };
  });

  const notify: Notify = useCallback(
    (text, tone = "info") => setToast({ text, tone, id: Date.now() }),
    [],
  );

  // 分頁與聊天室名稱顯示在網頁標題
  const pageTitle = active ? (active.id === null ? "新問題" : "討論串") : TAB_TITLE[tab];
  useEffect(() => {
    const previous = document.title;
    document.title = pageTitle;
    return () => {
      document.title = previous;
    };
  }, [pageTitle]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // 一般提示 4 秒後消失；錯誤要等長輩按「知道了」
  useEffect(() => {
    if (!toast || toast.tone === "error") return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ---- 從 API 載入 ----
  const loadAnswers = useCallback(
    async (id: string) => {
      const list = await api.listAnswers(id);
      setAnswers((prev) => ({ ...prev, [id]: list }));
      return list;
    },
    [api],
  );

  const loadQuestion = useCallback(
    async (id: string) => {
      const detail = await api.getQuestion(id);
      setDetails((prev) => ({ ...prev, [id]: detail }));
      setForumQuestions((prev) => prev.map((question) => question.id === id ? detail : question));
      setForumBaseQuestions((prev) => prev.map((question) => question.id === id ? detail : question));
      return detail;
    },
    [api],
  );

  const loadSummaries = useCallback(async () => {
    const list = await api.listMyQuestions();
    setQuestions(list);
    return list;
  }, [api]);

  const loadForumQuestions = useCallback(async () => {
    const requestId = ++forumRequestRef.current;
    const query = forumSearchRef.current;
    try {
      const page = await api.listForumQuestions(query ? { tagQuery: query } : undefined);
      if (requestId === forumRequestRef.current) {
        setForumQuestions(page.questions);
        if (!query) setForumBaseQuestions(page.questions);
        setForumCursor(page.nextCursor);
        setForumHasUpdates(false);
      }
      return page.questions;
    } finally {
      if (requestId === forumRequestRef.current) setForumLoading(false);
    }
  }, [api]);

  function changeForumSearch(value: string) {
    setForumSearch(value);
    setForumHasUpdates(false);
    forumSearchRef.current = value.trim().replace(/^#/, "").slice(0, 50);
    ++forumRequestRef.current;
    setForumQuestions([]);
    setForumCursor(null);
    setForumLoading(true);
    if (forumSearchTimerRef.current) clearTimeout(forumSearchTimerRef.current);
    forumSearchTimerRef.current = setTimeout(() => {
      loadForumQuestions().catch((e) => {
        setForumLoading(false);
        notify(errorMessage(e), "error");
      });
    }, 300);
  }

  async function loadMoreForumQuestions() {
    if (!forumCursor || forumLoadingMoreRef.current || forumLoading) return;
    forumLoadingMoreRef.current = true;
    setForumLoadingMore(true);
    const requestId = forumRequestRef.current;
    const query = forumSearchRef.current;
    try {
      const page = await api.listForumQuestions({
        cursor: forumCursor,
        ...(query ? { tagQuery: query } : {}),
      });
      if (requestId !== forumRequestRef.current) return;
      const append = (current: QuestionDetail[]) => {
        const ids = new Set(current.map((question) => question.id));
        return [...current, ...page.questions.filter((question) => !ids.has(question.id))];
      };
      setForumQuestions(append);
      if (!query) setForumBaseQuestions(append);
      setForumCursor(page.nextCursor);
    } catch (e) {
      notify(errorMessage(e), "error");
    } finally {
      forumLoadingMoreRef.current = false;
      setForumLoadingMore(false);
    }
  }

  useEffect(() => () => {
    if (forumSearchTimerRef.current) clearTimeout(forumSearchTimerRef.current);
  }, []);

  const loadAll = useCallback(async () => {
    const list = await loadSummaries();
    const rows = await Promise.all(
      list.map(async (q) => {
        const [detail, ans] = await Promise.all([
          api.getQuestion(q.id),
          api.listAnswers(q.id),
        ]);
        return { q, detail, ans };
      }),
    );
    setDetails((prev) => ({
      ...prev,
      ...Object.fromEntries(rows.map((r) => [r.q.id, r.detail])),
    }));
    setAnswers((prev) => ({
      ...prev,
      ...Object.fromEntries(rows.map((r) => [r.q.id, r.ans])),
    }));
  }, [api, loadSummaries]);

  useEffect(() => {
    let cancelled = false;
    // 在 then 裡才開始載入：資料回來後才 setState，不是在 effect 本體同步呼叫
    Promise.resolve()
      .then(() => Promise.all([api.getMe(), api.getMeta(), loadAll(), loadForumQuestions()]))
      .then(([m, metadata]) => {
        if (cancelled) return;
        setMe(m);
        setMeta(metadata);
      })
      .catch((e) => {
        if (!cancelled) notify(errorMessage(e), "error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, loadAll, loadForumQuestions, notify]);

  // 點推播通知會開啟 ?question={id}：首次載入完成後直接打開那則對話。
  // 問題可能不在自己的清單或論壇列表裡，所以另外抓一次詳情。
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (loading || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const url = new URL(window.location.href);
    const id = url.searchParams.get("question");
    if (!id) return;
    // 移除參數，重新整理或返回時才不會一直跳回這則對話
    url.searchParams.delete("question");
    window.history.replaceState(window.history.state, "", url);

    // 在 then 裡才開始載入，避免在 effect 本體同步 setState
    Promise.resolve()
      .then(() => loadQuestion(id))
      .then((detail) => {
        setActive({
          key: id,
          id,
          locationSharing: detail.location_sharing === "off" ? "off" : "approximate",
        });
        return loadAnswers(id);
      })
      .catch((e) => notify(errorMessage(e), "error"));
  }, [loading, loadQuestion, loadAnswers, notify]);

  // 只訂閱自己的問題和正在看的問題（question:subscribe）
  const activeId = active?.id ?? null;
  useEffect(() => {
    api.watch([...questions.map((q) => q.id), ...(activeId ? [activeId] : [])]);
  }, [api, questions, activeId]);

  // ---- 即時訊號：更新當前問題；討論串排序留待使用者手動重新整理 ----
  useEffect(
    () =>
      api.subscribe(async (signal) => {
        try {
          if (signal.type === "feed.changed") {
            setForumHasUpdates(true);
            await loadAll();
            return;
          }
          const id = signal.question_id;
          if (signal.type === "question.changed") {
            await Promise.all([loadQuestion(id), loadSummaries()]);
            return;
          }
          // 重抓前先記下已經有的回答，重抓後多出來的就是新回答
          const known = latest.current.answers[id];
          const [list] = await Promise.all([loadAnswers(id), loadSummaries(), loadQuestion(id)]);
          const { me: currentMe, activeId } = latest.current;
          // 正在看這題就不用再提醒；還沒載入過的問題也不提醒，避免一次跳出舊回答
          if (activeId === id || !known) return;
          const knownIds = new Set(known.map((a) => a.id));
          const fresh = list.filter((a) => !knownIds.has(a.id) && a.author.id !== currentMe?.id);
          const last = fresh.at(-1);
          if (last) notify(`${last.author.nickname}${last.author.role === "bot" ? "（機器人）" : ""} 回答了您的問題`);
        } catch {
          // 問題已被撤回（404）等情況：下次載入列表時會修正
        }
      }),
    [api, loadAll, loadAnswers, loadQuestion, loadSummaries, loadForumQuestions, notify],
  );

  // ---- 動作 ----
  function openQuestion(id: string) {
    const detail = details[id] ?? forumQuestions.find((question) => question.id === id);
    setActive({ key: id, id, locationSharing: detail?.location_sharing === "off" ? "off" : "approximate" });
    Promise.all([loadQuestion(id), loadAnswers(id)]).catch((e) => notify(errorMessage(e), "error"));
  }

  function startDraft() {
    setActive({ key: makeId(), id: null, locationSharing: "approximate" });
  }

  async function send(out: Outgoing) {
    if (!active || sending) return false;
    setSending(true);
    try {
      let body: string | undefined;
      const mediaIds: string[] = [];
      if (out.kind === "text") {
        body = out.text;
      } else if (out.kind === "media") {
        body = out.text;
        for (const item of out.files) {
          // 規格：圖片要先在手機端遮蔽個資才上傳（尚未實作遮蔽工具）
          mediaIds.push((await api.uploadMedia(item.file, item.kind, item.duration)).id);
        }
        if (out.audio) {
          mediaIds.push((await api.uploadMedia(out.audio.blob, "audio", out.audio.duration)).id);
        }
      } else {
        mediaIds.push((await api.uploadMedia(out.blob, "audio", out.duration)).id);
      }

      if (active.id === null) {
        // 要通知附近的人就得附上位置；拿不到位置時這題改成不分享
        let locationSharing = active.locationSharing;
        const location = locationSharing === "off" ? null : await getCurrentLocation();
        if (locationSharing !== "off" && !location) {
          locationSharing = "off";
          notify("沒有取得位置，這個問題不會通知附近的人");
        }
        const q = await api.createQuestion({
          body,
          media_ids: mediaIds,
          language: "zh-TW",
          assistance_mode: "online",
          location_sharing: locationSharing,
          ...(locationSharing === "off" ? {} : { location }),
          ...(active.report ? { context: reportContext(active.report) } : {}),
          // 問題回報用草稿 ID 防重送
          client_request_id: active.report?.id ?? makeId(),
        });
        setDetails((prev) => ({ ...prev, [q.id]: q }));
        setAnswers((prev) => ({ ...prev, [q.id]: [] }));
        setActive((a) => (a ? { ...a, id: q.id, report: undefined } : a));
        await loadSummaries();
        await loadForumQuestions();
        notify("問題已送出，有人回答時會通知您");
      } else {
        await api.createAnswer(active.id, {
          body,
          media_ids: mediaIds,
          language: "zh-TW",
          client_request_id: makeId(),
        });
        await loadAnswers(active.id);
        await loadForumQuestions();
      }
      return true;
    } catch (e) {
      notify(errorMessage(e), "error");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function updateTags(id: string, tags: string[]) {
    try {
      const detail = await api.setQuestionTags(id, tags);
      setDetails((prev) => ({ ...prev, [id]: detail }));
      setForumQuestions((prev) => prev.map((question) => question.id === id ? detail : question));
      await Promise.all([loadSummaries(), loadForumQuestions()]);
      notify("標籤已更新");
      return true;
    } catch (e) {
      notify(errorMessage(e), "error");
      return false;
    }
  }

  async function resolve(id: string) {
    try {
      await api.resolveQuestion(id);
      await Promise.all([
        loadQuestion(id),
        loadSummaries(),
        loadForumQuestions(),
      ]);
      notify("問題已標記為已完成");
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }

  async function toggleVote(answer: Answer, value: 1 | -1) {
    try {
      if (answer.votes.my_vote === value) await api.unvote(answer.id);
      else await api.vote(answer.id, value);
      await loadAnswers(answer.question_id);
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }

  async function deleteAnswer(a: Answer) {
    try {
      await api.deleteAnswer(a.id);
      await loadAnswers(a.question_id);
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }

  async function withdraw(id: string) {
    try {
      await api.deleteQuestion(id);
      setActive(null);
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      await loadForumQuestions();
      notify("已撤回問題");
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }

  const listActions: ChatListActions = {
    onOpen: openQuestion,
    onAsk: startDraft,
  };

  const meId = me?.id ?? "";
  const activeQuestion = active?.id ? details[active.id] ?? forumQuestions.find((q) => q.id === active.id) : null;

  function switchTab(next: Tab) {
    if (next === tab && (pathname === "/chat" || pathname === "/forum")) return;
    const demo = new URLSearchParams(window.location.search).get("demo");
    const nextPath = next === "forum" ? "/forum" : "/chat";
    window.history.pushState(null, "", `${nextPath}${demo ? `?demo=${encodeURIComponent(demo)}` : ""}`);
  }

  function endSwipe(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || active) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    const order: Tab[] = ["chats", "forum"];
    const next = order.indexOf(tab) + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < order.length) switchTab(order[next]);
  }

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchEnd={endSwipe}
      >
        {tab === "chats" ? (
          <ChatList
            questions={questions}
            details={details}
            answers={answers}
            meId={meId}
            now={now}
            loading={loading}
            note={note}
            actions={listActions}
          />
        ) : (
          <ForumFeed
            questions={forumQuestions}
            baseQuestions={forumBaseQuestions}
            search={forumSearch}
            onSearchChange={changeForumSearch}
            onLoadMore={loadMoreForumQuestions}
            onRefresh={async () => {
              try {
                await loadForumQuestions();
              } catch (error) {
                notify(errorMessage(error), "error");
              }
            }}
            hasUpdates={forumHasUpdates}
            hasMore={forumCursor !== null}
            loadingMore={forumLoadingMore}
            nickname={me?.nickname ?? "訪客"}
            now={now}
            loading={loading || forumLoading}
            onAsk={startDraft}
            onOpen={openQuestion}
          />
        )}
      </div>
      <BottomNav tab={tab} onChange={switchTab} />

      {active && (active.id === null || activeQuestion) && (
        <ChatRoom
          key={active.key}
          meId={meId}
          question={activeQuestion ?? null}
          answers={active.id ? (answers[active.id] ?? []) : []}
          now={now}
          limits={meta.limits}
          sending={sending}
          onBack={() => { setActive(null); if (pathname === "/new") switchTab("chats"); }}
          onSend={send}
          locationSharing={active.locationSharing}
          onLocationSharingChange={(value) => setActive((current) => current ? { ...current, locationSharing: value } : current)}
          onResolve={() => active.id ? resolve(active.id) : Promise.resolve()}
          onUpdateTags={(tags) => active.id ? updateTags(active.id, tags) : Promise.resolve(false)}
          onToggleVote={toggleVote}
          onDeleteAnswer={deleteAnswer}
          onWithdraw={() => (active.id ? withdraw(active.id) : Promise.resolve())}
          notify={notify}
          animateIn={!active.instant}
          initialMedia={active.report?.media}
          draftHint={active.report ? REPORT_HINT : undefined}
        />
      )}

      {toast &&
        (toast.tone === "error" ? (
          <div
            key={toast.id}
            className="absolute inset-x-0 bottom-24 z-60 flex justify-center px-4"
            role="alert"
          >
            <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-tp-gray-900 px-4 py-3 text-white shadow-xl animate-in fade-in zoom-in-95">
              <p className="flex-1 text-[15px] leading-snug">{toast.text}</p>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="h-11 shrink-0 rounded-xl bg-white px-4 text-[15px] font-bold text-tp-gray-900"
              >
                知道了
              </button>
            </div>
          </div>
        ) : (
          <div
            key={toast.id}
            className="pointer-events-none absolute inset-x-0 bottom-24 z-60 flex justify-center px-6"
            role="status"
          >
            <span className="rounded-2xl bg-tp-gray-900/90 px-5 py-3 text-center text-[15px] text-white animate-in fade-in zoom-in-95">
              {toast.text}
            </span>
          </div>
        ))}
    </>
  );
}
