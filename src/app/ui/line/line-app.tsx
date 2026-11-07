"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type TouchEvent,
} from "react";
import { createMockApi } from "./api/mock-api";
import { getCurrentLocation } from "./api/location";
import { connectBackend, getIdentity } from "./api/session";
import { ForumFeed } from "@/app/ui/forum/forum-feed";
import {
  ApiError,
  type Answer,
  type AskerApi,
  type CategoryId,
  type Me,
  type QuestionDetail,
  type QuestionSummary,
} from "./api/types";
import { ChatRoom } from "./chat-room";
import { ChatList, type ChatListActions } from "./chat-list";
import { BottomNav, HomeTab } from "./other-tabs";
import type { Notify, Outgoing, Tab } from "./types";

const NICK_KEY = "line-demo-nickname";

const noopSubscribe = () => () => {};

/**
 * 發問者用的 LINE 風格畫面：只看得到自己問的問題，每個問題是一個聊天室。
 * 範例資料的時間是相對於「現在」產生的，而 Cache Components 會預先渲染
 * Client Component，所以整個 App 只在瀏覽器端掛載，伺服器端只輸出外框。
 */
const TAB_TITLE: Record<Tab, string> = { home: "主頁", chats: "聊天", forum: "討論串" };

export default function LineApp() {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-tp-gray-50 sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-[2.25rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10">
      {mounted ? (
        <LineAppInner />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <span className="size-8 animate-spin rounded-full border-3 border-tp-primary-500 border-t-transparent" />
        </div>
      )}
    </div>
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
  category: CategoryId;
  locationSharing: "off" | "approximate";
};

type Connection =
  | { status: "connecting" }
  | { status: "error"; message: string }
  | { status: "ready"; api: AskerApi; note: string | null };

/**
 * 先連上後端再顯示畫面。
 * - 網址加上 ?demo=mock 用示範資料；?demo=crowd 模擬發問後有 50～100 位志工回答
 * - 在城市通 App 內用 userinfo.id 登入；一般瀏覽器用這台瀏覽器的測試帳號
 */
function LineAppInner() {
  const [attempt, setAttempt] = useState(0);
  const [conn, setConn] = useState<Connection>({ status: "connecting" });

  useEffect(() => {
    let cancelled = false;
    let created: AskerApi | null = null;
    const demo = new URLSearchParams(window.location.search).get("demo");
    Promise.resolve()
      .then(async () => {
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
      })
      .then(({ api, note }) => {
        created = api;
        if (cancelled) api.close();
        else setConn({ status: "ready", api, note });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setConn({
            status: "error",
            message: e instanceof ApiError || e instanceof Error ? e.message : "連線失敗",
          });
        }
      });
    return () => {
      cancelled = true;
      created?.close();
    };
  }, [attempt]);

  if (conn.status === "ready") {
    return <LineAppConnected key={attempt} api={conn.api} note={conn.note} />;
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      {conn.status === "connecting" ? (
        <>
          <span className="size-10 animate-spin rounded-full border-4 border-tp-primary-500 border-t-transparent" />
          <p className="text-[17px] text-tp-gray-700">連線中…</p>
        </>
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

function LineAppConnected({ api, note }: { api: AskerApi; note: string | null }) {
  const [me, setMe] = useState<Me | null>(null);
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [forumQuestions, setForumQuestions] = useState<QuestionDetail[]>([]);
  const [details, setDetails] = useState<Record<string, QuestionDetail>>({});
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("home");
  const [active, setActive] = useState<Active | null>(() =>
    new URLSearchParams(window.location.search).get("mode") === "ask"
      ? { key: makeId(), id: null, category: "uncategorized", locationSharing: "approximate" }
      : null,
  );
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

  // 分頁名稱不放在畫面上，改顯示在網頁標題
  useEffect(() => {
    const previous = document.title;
    document.title = TAB_TITLE[tab];
    return () => {
      document.title = previous;
    };
  }, [tab]);

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
    const list = await api.listForumQuestions();
    setForumQuestions(list);
    return list;
  }, [api]);

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
      .then(() => Promise.all([api.getMe(), loadAll(), loadForumQuestions()]))
      .then(([m]) => {
        if (cancelled) return;
        setMe(m);
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
          category: detail.category,
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

  // ---- 即時訊號：收到後用 REST 重抓（同 api-spec.md 的做法） ----
  useEffect(
    () =>
      api.subscribe(async (signal) => {
        try {
          if (signal.type === "feed.changed") {
            await Promise.all([loadAll(), loadForumQuestions()]);
            return;
          }
          const id = signal.question_id;
          if (signal.type === "question.changed") {
            await Promise.all([loadQuestion(id), loadSummaries(), loadForumQuestions()]);
            return;
          }
          // 重抓前先記下已經有的回答，重抓後多出來的就是新回答
          const known = latest.current.answers[id];
          const [list] = await Promise.all([loadAnswers(id), loadSummaries(), loadForumQuestions()]);
          const { me: currentMe, activeId } = latest.current;
          // 正在看這題就不用再提醒；還沒載入過的問題也不提醒，避免一次跳出舊回答
          if (activeId === id || !known) return;
          const knownIds = new Set(known.map((a) => a.id));
          const fresh = list.filter((a) => !knownIds.has(a.id) && a.author.id !== currentMe?.id);
          const last = fresh.at(-1);
          if (last) notify(`${last.author.nickname} 回答了您的問題`);
        } catch {
          // 問題已被撤回（404）等情況：下次載入列表時會修正
        }
      }),
    [api, loadAll, loadAnswers, loadQuestion, loadSummaries, loadForumQuestions, notify],
  );

  // ---- 動作 ----
  function openQuestion(id: string) {
    const detail = details[id] ?? forumQuestions.find((question) => question.id === id);
    const summary = questions.find((q) => q.id === id);
    const category = detail?.category ?? summary?.category;
    if (!category) return;
    setActive({ key: id, id, category, locationSharing: detail?.location_sharing === "off" ? "off" : "approximate" });
    Promise.all([loadQuestion(id), loadAnswers(id)]).catch((e) => notify(errorMessage(e), "error"));
  }

  function startDraft() {
    setActive({ key: makeId(), id: null, category: "uncategorized", locationSharing: "approximate" });
  }

  async function send(out: Outgoing) {
    if (!active || sending) return false;
    setSending(true);
    try {
      let body: string | undefined;
      const mediaIds: string[] = [];
      if (out.kind === "text") {
        body = out.text;
      } else if (out.kind === "images") {
        // 規格：圖片要先在手機端遮蔽個資才上傳（尚未實作遮蔽工具）
        for (const file of out.files) {
          mediaIds.push((await api.uploadMedia(file, "image")).id);
        }
      } else if (out.kind === "video") {
        mediaIds.push((await api.uploadMedia(out.file, "video", out.duration)).id);
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
          // 沒選分類就不傳，後端會自動分類（看不出來時為 uncategorized）
          category: active.category === "uncategorized" ? undefined : active.category,
          assistance_mode: "online",
          location_sharing: locationSharing,
          location,
          client_request_id: makeId(),
        });
        setDetails((prev) => ({ ...prev, [q.id]: q }));
        setAnswers((prev) => ({ ...prev, [q.id]: [] }));
        setActive((a) => (a ? { ...a, id: q.id, category: q.category } : a));
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

  /** 志工分類：只能改未分類的問題 */
  async function classify(id: string, category: CategoryId) {
    try {
      const detail = await api.setQuestionCategory(id, category);
      setDetails((prev) => ({ ...prev, [id]: detail }));
      setActive((a) => (a && a.id === id ? { ...a, category: detail.category } : a));
      await loadForumQuestions();
      notify("謝謝您幫忙分類！");
    } catch (e) {
      notify(errorMessage(e), "error");
      // 可能已經被別人分類了：重抓一次
      loadQuestion(id).catch(() => {});
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
      notify("問題已標記為已解決");
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }

  async function toggleLike(answer: Answer) {
    try {
      if (answer.votes.my_vote === 1) await api.unvote(answer.id);
      else await api.vote(answer.id, 1);
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

  function endSwipe(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || active) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    const order: Tab[] = ["home", "chats", "forum"];
    const next = order.indexOf(tab) + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < order.length) setTab(order[next]);
  }

  return (
    <>
      <div
        className="flex min-h-0 flex-1 flex-col"
        onTouchStart={(event) => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
        onTouchEnd={endSwipe}
      >
        {tab === "home" ? (
          <HomeTab
            questions={questions.map((q) => ({
              q,
              answered: (answers[q.id] ?? []).filter((a) => a.author.id !== meId).length,
            }))}
            onAsk={startDraft}
            onOpen={openQuestion}
            onShowChats={() => setTab("chats")}
            note={note}
          />
        ) : tab === "chats" ? (
          <ChatList
            questions={questions}
            details={details}
            answers={answers}
            meId={meId}
            now={now}
            loading={loading}
            actions={listActions}
          />
        ) : (
          <ForumFeed
            questions={forumQuestions}
            nickname={me?.nickname ?? "訪客"}
            now={now}
            loading={loading}
            onAsk={startDraft}
            onOpen={openQuestion}
          />
        )}
      </div>
      <BottomNav tab={tab} onChange={setTab} />

      {active && (active.id === null || activeQuestion) && (
        <ChatRoom
          key={active.key}
          meId={meId}
          question={activeQuestion ?? null}
          category={active.category}
          answers={active.id ? (answers[active.id] ?? []) : []}
          now={now}
          sending={sending}
          onBack={() => setActive(null)}
          onSend={send}
          locationSharing={active.locationSharing}
          onLocationSharingChange={(value) => setActive((current) => current ? { ...current, locationSharing: value } : current)}
          onResolve={() => active.id ? resolve(active.id) : Promise.resolve()}
          onClassify={(category) => (active.id ? classify(active.id, category) : Promise.resolve())}
          onToggleLike={toggleLike}
          onDeleteAnswer={deleteAnswer}
          onWithdraw={() => (active.id ? withdraw(active.id) : Promise.resolve())}
          notify={notify}
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
