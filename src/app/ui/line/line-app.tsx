"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createMockApi } from "./api/mock-api";
import {
  ApiError,
  type Answer,
  type CategoryId,
  type Me,
  type QuestionDetail,
  type QuestionSummary,
} from "./api/types";
import { AskSheet, ChatList, type ChatListActions } from "./chat-list";
import { ChatRoom } from "./chat-room";
import { BottomNav, HomeTab } from "./other-tabs";
import { unreadCount, type Notify, type Outgoing, type QuestionPrefs, type Tab } from "./types";

const NICK_KEY = "line-demo-nickname";

const noopSubscribe = () => () => {};

/**
 * 發問者用的 LINE 風格畫面：只看得到自己問的問題，每個問題是一個聊天室。
 * 範例資料的時間是相對於「現在」產生的，而 Cache Components 會預先渲染
 * Client Component，所以整個 App 只在瀏覽器端掛載，伺服器端只輸出外框。
 */
export default function LineApp() {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-claude-ivory sm:h-[min(860px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-[2.25rem] sm:shadow-2xl sm:ring-1 sm:ring-black/10">
      {mounted ? (
        <LineAppInner />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <span className="size-8 animate-spin rounded-full border-3 border-claude border-t-transparent" />
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
      case "ALREADY_ACCEPTED":
        return "這個問題已經採納過回答了";
      case "ANSWER_ACCEPTED":
        return "已採納的回答不能刪除";
      case "SELF_ACTION_NOT_ALLOWED":
        return "不能對自己的回答這樣做";
      case "RATE_LIMITED":
        return "傳得太快了，請稍等一下再試";
      default:
        return e.message;
    }
  }
  return "連線失敗，請稍後再試";
}

const newPrefs = (lastSeenAt: string): QuestionPrefs => ({
  pinned: false,
  muted: false,
  lastSeenAt,
});

/** 沒打字、只傳照片或語音的問題，標題帶上日期時間才分得出來 */
function mediaTitle(kind: "images" | "audio") {
  const d = new Date();
  const clock = new Intl.DateTimeFormat("zh-TW", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${d.getMonth() + 1}/${d.getDate()} ${clock} 的${kind === "audio" ? "語音" : "照片"}提問`;
}

/** key 在新問題送出後保持不變，聊天室才不會重新播放進場動畫 */
type Active = {
  key: string;
  id: string | null;
  category: CategoryId;
  marker: string | null;
};

function LineAppInner() {
  // 網址加上 ?demo=crowd 可模擬發問後有 50～100 位志工回答
  const [api] = useState(() =>
    createMockApi(readNickname(), {
      crowd: new URLSearchParams(window.location.search).get("demo") === "crowd",
    }),
  );
  const [me, setMe] = useState<Me | null>(null);
  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [details, setDetails] = useState<Record<string, QuestionDetail>>({});
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [prefs, setPrefs] = useState<Record<string, QuestionPrefs>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("chats");
  const [active, setActive] = useState<Active | null>(null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{
    text: string;
    tone: "info" | "error";
    id: number;
  } | null>(null);

  // socket 訊號的處理函式需要讀到最新狀態
  const latest = useRef({ me, prefs, questions, activeId: active?.id ?? null });
  useEffect(() => {
    latest.current = { me, prefs, questions, activeId: active?.id ?? null };
  });

  const notify: Notify = useCallback(
    (text, tone = "info") => setToast({ text, tone, id: Date.now() }),
    [],
  );

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
    setPrefs((prev) => {
      const next = { ...prev };
      for (const { q } of rows) {
        // 第一次看到的問題：已解決的視為都看過，其他的回答都算未讀
        next[q.id] ??= newPrefs(
          q.status === "resolved" ? new Date().toISOString() : q.created_at,
        );
      }
      return next;
    });
  }, [api, loadSummaries]);

  const markSeen = useCallback((id: string) => {
    setPrefs((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? newPrefs("")),
        lastSeenAt: new Date().toISOString(),
      },
    }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // 在 then 裡才開始載入：資料回來後才 setState，不是在 effect 本體同步呼叫
    Promise.resolve()
      .then(() => Promise.all([api.getMe(), loadAll()]))
      .then(([m]) => {
        if (!cancelled) setMe(m);
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
  }, [api, loadAll, notify]);

  // ---- 即時訊號：收到後用 REST 重抓（同 api-spec.md 的做法） ----
  useEffect(
    () =>
      api.subscribe(async (signal) => {
        try {
          if (signal.type === "feed.changed") {
            await loadAll();
            return;
          }
          const id = signal.question_id;
          if (signal.type === "question.changed") {
            await Promise.all([loadQuestion(id), loadSummaries()]);
            return;
          }
          const [list] = await Promise.all([loadAnswers(id), loadSummaries()]);
          const { me: currentMe, prefs: currentPrefs, activeId } = latest.current;
          if (activeId === id) {
            markSeen(id);
            return;
          }
          const last = list.at(-1);
          const p = currentPrefs[id];
          if (
            last &&
            last.author.id !== currentMe?.id &&
            p &&
            last.created_at > p.lastSeenAt
          ) {
            if (!p.muted) notify(`${last.author.nickname} 回答了您的問題`);
          }
        } catch {
          // 問題已被撤回（404）等情況：下次載入列表時會修正
        }
      }),
    [api, loadAll, loadAnswers, loadQuestion, loadSummaries, markSeen, notify],
  );

  // ---- 動作 ----
  function openQuestion(id: string) {
    const detail = details[id];
    const summary = questions.find((q) => q.id === id);
    const category = detail?.category ?? summary?.category;
    if (!category) return;
    const p = prefs[id];
    const firstUnread = (answers[id] ?? []).find(
      (a) => a.author.id !== me?.id && p && a.created_at > p.lastSeenAt,
    );
    setActive({ key: id, id, category, marker: firstUnread?.id ?? null });
    markSeen(id);
    loadQuestion(id).catch((e) => notify(errorMessage(e), "error"));
  }

  function startDraft(category: CategoryId) {
    setPicking(false);
    setTab("chats");
    setActive({ key: makeId(), id: null, category, marker: null });
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
      } else {
        mediaIds.push((await api.uploadMedia(out.blob, "audio", out.duration)).id);
      }

      if (active.id === null) {
        const q = await api.createQuestion({
          title: body ? undefined : mediaTitle(out.kind === "audio" ? "audio" : "images"),
          body,
          media_ids: mediaIds,
          language: "zh-TW",
          category: active.category,
          assistance_mode: "online",
          location_sharing: "off",
          client_request_id: makeId(),
        });
        setDetails((prev) => ({ ...prev, [q.id]: q }));
        setAnswers((prev) => ({ ...prev, [q.id]: [] }));
        setPrefs((prev) => ({ ...prev, [q.id]: newPrefs(q.created_at) }));
        setActive((a) => (a ? { ...a, id: q.id } : a));
        await loadSummaries();
        notify("問題已送出，有人回答時會通知您");
      } else {
        await api.createAnswer(active.id, {
          body,
          media_ids: mediaIds,
          language: "zh-TW",
          client_request_id: makeId(),
        });
        await loadAnswers(active.id);
        markSeen(active.id);
      }
      return true;
    } catch (e) {
      notify(errorMessage(e), "error");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function accept(a: Answer) {
    try {
      await api.acceptAnswer(a.id);
      await Promise.all([
        loadQuestion(a.question_id),
        loadAnswers(a.question_id),
        loadSummaries(),
      ]);
      notify("太好了！問題已標示為解決");
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
      notify("已撤回問題");
    } catch (e) {
      notify(errorMessage(e), "error");
    }
  }

  async function changeNickname(name: string) {
    try {
      setMe(await api.updateMe({ nickname: name }));
      try {
        localStorage.setItem(NICK_KEY, name);
      } catch {
        // 忽略：只是記住暱稱的便利功能
      }
      await loadAll();
      return true;
    } catch (e) {
      notify(errorMessage(e), "error");
      return false;
    }
  }

  const updatePrefs = (id: string, patch: (p: QuestionPrefs) => Partial<QuestionPrefs>) =>
    setPrefs((prev) => {
      const p = prev[id] ?? newPrefs(new Date().toISOString());
      return { ...prev, [id]: { ...p, ...patch(p) } };
    });

  const listActions: ChatListActions = {
    onOpen: openQuestion,
    onAsk: () => setPicking(true),
    onTogglePin: (id) => updatePrefs(id, (p) => ({ pinned: !p.pinned })),
    onToggleMute: (id) => updatePrefs(id, (p) => ({ muted: !p.muted })),
    onMarkRead: markSeen,
  };

  const meId = me?.id ?? "";
  const unreadOf = (id: string) => unreadCount(answers[id], meId, prefs[id]?.lastSeenAt);
  const totalUnread = questions.reduce((sum, q) => sum + unreadOf(q.id), 0);
  const resolved = questions.filter((q) => q.status === "resolved").length;
  const activeQuestion = active?.id ? details[active.id] : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "chats" ? (
          <ChatList
            questions={questions}
            answers={answers}
            prefs={prefs}
            meId={meId}
            now={now}
            loading={loading}
            actions={listActions}
          />
        ) : (
          <HomeTab
            me={me}
            stats={{
              total: questions.length,
              waiting: questions.length - resolved,
              resolved,
            }}
            onNicknameChange={changeNickname}
            onAsk={() => setPicking(true)}
            onShowChats={() => setTab("chats")}
          />
        )}
      </div>
      <BottomNav tab={tab} unread={totalUnread} onChange={setTab} />

      {picking && (
        <AskSheet onAsk={startDraft} onClose={() => setPicking(false)} />
      )}

      {active && (active.id === null || activeQuestion) && (
        <ChatRoom
          key={active.key}
          meId={meId}
          question={activeQuestion ?? null}
          category={active.category}
          answers={active.id ? (answers[active.id] ?? []) : []}
          prefs={active.id ? (prefs[active.id] ?? null) : null}
          now={now}
          sending={sending}
          unreadElsewhere={totalUnread - (active.id ? unreadOf(active.id) : 0)}
          unreadMarkerKey={active.marker}
          onBack={() => setActive(null)}
          onSend={send}
          onAccept={accept}
          onDeleteAnswer={deleteAnswer}
          onWithdraw={() => (active.id ? withdraw(active.id) : Promise.resolve())}
          onToggleMute={() =>
            active.id && updatePrefs(active.id, (p) => ({ muted: !p.muted }))
          }
          onTogglePin={() =>
            active.id && updatePrefs(active.id, (p) => ({ pinned: !p.pinned }))
          }
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
            <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-claude-ink px-4 py-3 text-white shadow-xl animate-in fade-in zoom-in-95">
              <p className="flex-1 text-[17px] leading-snug">{toast.text}</p>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="h-11 shrink-0 rounded-xl bg-white px-4 text-[16px] font-bold text-claude-ink"
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
            <span className="rounded-2xl bg-claude-ink/90 px-5 py-3 text-center text-[16px] text-white animate-in fade-in zoom-in-95">
              {toast.text}
            </span>
          </div>
        ))}
    </>
  );
}
