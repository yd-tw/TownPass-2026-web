import { io, type Socket } from "socket.io-client";
import {
  ApiError,
  type Answer,
  type AskerApi,
  type Me,
  type Media,
  type Meta,
  type QuestionDetail,
  type QuestionSummary,
  type Signal,
  type VoteSummary,
} from "./types";

/** 後端網址；可用 NEXT_PUBLIC_API_ORIGIN 改成其他環境 */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://tpcodefest.mcloudtw.com";
export const API_BASE = `${API_ORIGIN}/api/v1`;

const PAGE_LIMIT = 50;
/** 論壇分頁只抓最新的幾則，每則要再抓一次詳情才有內文 */
const FORUM_LIMIT = 20;
/** 規格：500 毫秒內的同類訊號只抓一次 */
const SIGNAL_DEBOUNCE_MS = 500;
/** 列表最多往下翻幾頁，避免異常資料造成無限迴圈 */
const MAX_PAGES = 20;

type Envelope<T> = { data: T; next_cursor?: string | null };

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string };
    };
    return new ApiError(
      res.status,
      body.error?.code ?? `HTTP_${res.status}`,
      body.error?.message ?? res.statusText,
    );
  } catch {
    return new ApiError(res.status, `HTTP_${res.status}`, res.statusText);
  }
}

/** 不需要 token 的 API（POST /sessions、GET /meta） */
export async function publicRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return ((await res.json()) as Envelope<T>).data;
}

/** 錄音的 MIME 可能帶 codecs 參數，後端只看檔案類型與副檔名 */
function audioFileName(type: string) {
  const base = type.split(";")[0];
  if (base === "audio/mp4" || base === "audio/x-m4a") return { name: "voice.m4a", type: "audio/mp4" };
  if (base === "audio/aac") return { name: "voice.aac", type: "audio/aac" };
  if (base === "audio/mpeg") return { name: "voice.mp3", type: "audio/mpeg" };
  return { name: "voice.webm", type: "audio/webm" };
}

/** 後端只接受 MP4 或 WebM */
function videoFileName(type: string) {
  const base = type.split(";")[0];
  if (base === "video/webm") return { name: "video.webm", type: base };
  if (base === "video/mp4") return { name: "video.mp4", type: base };
  throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "影片只支援 MP4 或 WebM");
}

/**
 * 接真的後端（api-spec.md）的 AskerApi。
 * @param token POST /sessions 拿到的 token
 * @param renewToken token 失效（401）時重新建立工作階段，回傳新 token
 */
export function createHttpApi(
  token: string,
  renewToken: () => Promise<string>,
): AskerApi {
  let currentToken = token;
  let renewing: Promise<string> | null = null;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<Envelope<T> | undefined> {
    const isForm = body instanceof FormData;
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${currentToken}`,
        ...(body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    if (res.status === 401 && !retried) {
      // token 過期：重新登入一次再重試
      renewing ??= renewToken().finally(() => {
        renewing = null;
      });
      currentToken = await renewing;
      reconnectSocket();
      return request<T>(method, path, body, true);
    }
    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return undefined;
    return (await res.json()) as Envelope<T>;
  }

  async function data<T>(method: string, path: string, body?: unknown) {
    const env = await request<T>(method, path, body);
    if (!env) throw new ApiError(500, "EMPTY_RESPONSE", "伺服器沒有回傳資料");
    return env.data;
  }

  /** 依 next_cursor 把所有頁面抓完 */
  async function all<T>(path: string) {
    const out: T[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const query: string = `${sep}limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const env: Envelope<T[]> | undefined = await request<T[]>("GET", path + query);
      if (!env) break;
      out.push(...env.data);
      cursor = env.next_cursor ?? null;
      if (!cursor) break;
    }
    return out;
  }

  // ---- Socket.IO：只送「有更新」的訊號，收到後用 REST 重抓 ----
  const listeners = new Set<(s: Signal) => void>();
  const watched = new Set<string>();
  const pendingSignals = new Map<string, number>();
  let socket: Socket | null = null;
  let hasConnected = false;

  function emitSignal(signal: Signal) {
    const key = "question_id" in signal ? `${signal.type}:${signal.question_id}` : signal.type;
    if (pendingSignals.has(key)) return;
    pendingSignals.set(
      key,
      window.setTimeout(() => {
        pendingSignals.delete(key);
        listeners.forEach((l) => l(signal));
      }, SIGNAL_DEBOUNCE_MS),
    );
  }

  function connectSocket() {
    socket = io(API_ORIGIN, {
      auth: { token: currentToken },
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      // 論壇分頁要知道有新問題（feed.changed）
      socket?.emit("feed:subscribe");
      for (const id of watched) socket?.emit("question:subscribe", { question_id: id });
      // 重新連線後，離線期間的訊號不會補發：提示使用者重新整理討論串
      if (hasConnected) emitSignal({ type: "feed.changed" });
      hasConnected = true;
    });
    const onQuestion =
      (type: "question.changed" | "answers.changed") =>
      (payload: { question_id?: unknown }) => {
        if (typeof payload?.question_id === "string") {
          emitSignal({ type, question_id: payload.question_id });
        }
      };
    socket.on("question.changed", onQuestion("question.changed"));
    socket.on("answers.changed", onQuestion("answers.changed"));
    // 現場協助的狀態也會改變問題狀態
    socket.on("assist.changed", onQuestion("question.changed"));
    socket.on("feed.changed", () => emitSignal({ type: "feed.changed" }));
  }

  function reconnectSocket() {
    if (!socket) return;
    socket.disconnect();
    hasConnected = false;
    connectSocket();
  }

  return {
    async getMeta() {
      const res = await fetch(`${API_BASE}/meta`);
      if (!res.ok) throw await parseError(res);
      return ((await res.json()) as Envelope<Meta>).data;
    },

    getMe: () => data<Me>("GET", "/me"),

    updateMe: (patch) => data<Me>("PATCH", "/me", patch),

    listMyQuestions: () => all<QuestionSummary>("/questions?author=me&sort=latest"),

    async listForumQuestions(filter) {
      const query = new URLSearchParams({ scope: "global", limit: String(FORUM_LIMIT) });
      if (filter?.category) query.set("category", filter.category);
      if (filter?.tagQuery) query.set("tag_q", filter.tagQuery);
      else query.set("sort", "attention");
      if (filter?.cursor) query.set("cursor", filter.cursor);
      const env = await request<QuestionSummary[]>(
        "GET",
        `/questions?${query}`,
      );
      const list = env?.data ?? [];
      // 列表只有標題，內文要看詳情；被撤回（404）的就略過
      const details = await Promise.all(
        list.map((q) =>
          data<QuestionDetail>("GET", `/questions/${encodeURIComponent(q.id)}`).catch(
            () => null,
          ),
        ),
      );
      return {
        questions: details.filter((d): d is QuestionDetail => d !== null),
        nextCursor: env?.next_cursor ?? null,
      };
    },

    getQuestion: (id) => data<QuestionDetail>("GET", `/questions/${encodeURIComponent(id)}`),

    setQuestionTags: (questionId, tags) =>
      data<QuestionDetail>("PUT", `/questions/${encodeURIComponent(questionId)}/tags`, { tags }),

    createQuestion: (req) => data<QuestionDetail>("POST", "/questions", req),

    async deleteQuestion(id) {
      await request("DELETE", `/questions/${encodeURIComponent(id)}`);
    },

    listAnswers: (questionId) =>
      all<Answer>(`/questions/${encodeURIComponent(questionId)}/answers?sort=oldest`),

    createAnswer: (questionId, req) =>
      data<Answer>("POST", `/questions/${encodeURIComponent(questionId)}/answers`, req),

    async deleteAnswer(answerId) {
      await request("DELETE", `/answers/${encodeURIComponent(answerId)}`);
    },

    // 已解決的問題再標一次會回 409 INVALID_STATE；404 表示問題已撤回
    resolveQuestion: (questionId) =>
      data<QuestionDetail>("POST", `/questions/${encodeURIComponent(questionId)}/resolve`),

    vote: (answerId, value) =>
      data<VoteSummary>("PUT", `/answers/${encodeURIComponent(answerId)}/vote`, { value }),

    unvote: (answerId) =>
      data<VoteSummary>("DELETE", `/answers/${encodeURIComponent(answerId)}/vote`),

    async uploadMedia(file, kind, durationSeconds) {
      // 文字欄位放在檔案前面：有些 multipart 解析器處理檔案時只看得到前面的欄位
      const form = new FormData();
      form.append("kind", kind);
      if (kind === "video") {
        if (!durationSeconds || !Number.isFinite(durationSeconds)) {
          throw new ApiError(400, "VALIDATION_ERROR", "無法取得影片長度，請改用其他影片");
        }
        const { name, type } = videoFileName(file.type);
        form.append("duration_seconds", String(Math.ceil(durationSeconds)));
        form.append("file", new File([file], name, { type }));
        return data<Media>("POST", "/media", form);
      } else if (kind === "audio") {
        const { name, type } = audioFileName(file.type);
        form.append("duration_seconds", String(durationSeconds ?? 0));
        form.append("file", new File([file], name, { type }));
      } else {
        form.append("file", file, file instanceof File ? file.name : "photo.jpg");
      }
      return data<Media>("POST", "/media", form);
    },

    subscribe(listener) {
      listeners.add(listener);
      if (!socket) connectSocket();
      return () => listeners.delete(listener);
    },

    watch(questionIds) {
      const next = new Set(questionIds);
      for (const id of next) {
        if (!watched.has(id)) socket?.emit("question:subscribe", { question_id: id });
      }
      for (const id of watched) {
        if (!next.has(id)) socket?.emit("question:unsubscribe", { question_id: id });
      }
      watched.clear();
      for (const id of next) watched.add(id);
    },

    close() {
      pendingSignals.forEach((t) => window.clearTimeout(t));
      pendingSignals.clear();
      listeners.clear();
      socket?.disconnect();
      socket = null;
    },
  };
}
