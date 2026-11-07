import { API_BASE } from "@/app/ui/line/api/http-api";
import { ApiError } from "@/app/ui/line/api/types";
import type { CategoryId, Media } from "@/app/ui/line/api/types";

export { ApiError };

/*
 * 管理後台用的 API（api-spec.md「管理員」一節與 docs 的管理後台規劃）。
 * 一般使用者的 API 已經在 line/api/http-api.ts，這裡只放後台需要的部分，
 * 欄位照規格寫，管理員看得到的額外欄位（context.extra、可信度評分）也在內。
 */

export type UserRole = "user" | "admin" | "bot";
export type QuestionStatus = "open" | "in_progress" | "resolved";
export type PiiStatus = "pending" | "accepted" | "denied";

export type PublicUser = { id: string; nickname: string; points: number; role: UserRole };

export type AdminUser = PublicUser & {
  languages: string[];
  nearby_notifications_enabled: boolean;
  nearby_radius_m: number;
  location_sharing: "off" | "approximate" | "exact";
  townpass_user_id: string;
  trust_score: number;
  banned_at: string | null;
  ban_reason: string | null;
  created_at: string;
};

export type QuestionContext = {
  service_id: string;
  service_name: string;
  page_route?: string;
  page_title?: string;
  /** 只回傳給發問者與管理員：裝置資訊、瀏覽過的頁面等 */
  extra?: Record<string, unknown>;
};

export type HiddenPart = { part: "body" | "media"; media_id?: string; reason: "pii_pending" };

export type QuestionSummary = {
  id: string;
  status: QuestionStatus;
  title: string | null;
  /** 即將移除；新畫面以 system_tag／tags 為準 */
  category?: CategoryId;
  /** 第一個是固定標籤（system_tag），後面是手動標籤 */
  tags: string[];
  /** 後端決定的固定標籤，不可手動移除；用 PUT /questions/{id}/category 修改 */
  system_tag: string;
  language: string;
  author: PublicUser;
  context?: QuestionContext | null;
  answer_count: number;
  hidden_parts: HiddenPart[];
  has_audio?: boolean;
  has_video?: boolean;
  thumbnail_url?: string | null;
  created_at: string;
};

export type QuestionDetail = QuestionSummary & {
  body: string | null;
  media: Media[];
  accepted_answer_id: string | null;
};

export type Answer = {
  id: string;
  question_id: string;
  author: PublicUser;
  body: string | null;
  media: Media[];
  is_accepted: boolean;
  /** 由語意快取自動貼上的機器人回答才有值 */
  cached_from?: Record<string, unknown> | null;
  votes: { upvotes: number; my_vote: 1 | -1 | null };
  hidden_parts: HiddenPart[];
  created_at: string;
};

export type PiiReport = {
  id: string;
  status: PiiStatus;
  target_type: "question" | "answer";
  target_id: string;
  question_id: string;
  media_id?: string | null;
  text_field?: "body" | "title" | null;
  regions?: { x: number; y: number; w: number; h: number }[];
  text_ranges?: { start: number; end: number }[];
  original_text?: string | null;
  preview_url?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

export type AuditEntry = {
  id: string;
  admin: PublicUser;
  action: string;
  target_type: "question" | "answer" | "user" | "pii_report";
  target_id: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type PageStat = {
  service_id: string;
  service_name: string;
  page_route: string;
  page_title: string | null;
  question_count: number;
  open_count: number;
  in_progress_count: number;
  resolved_count: number;
  unanswered_count: number;
  categories: { category: CategoryId; count: number }[];
  last_asked_at: string;
};

export type PageAnalytics = {
  total_questions: number;
  questions_with_page: number;
  questions_without_page: number;
  pages: PageStat[];
};

/** 語意快取的解答評分（GET /admin/analytics/cache）；score 降到 -3 就不再被引用 */
export type CacheEntry = {
  source_answer_id: string;
  source_question_id: string;
  /** 來源已被刪除時為 null */
  question_title: string | null;
  answer_body: string | null;
  score: number;
  positive_count: number;
  negative_count: number;
  reply_count: number;
  blocked: boolean;
  updated_at: string;
};

export type Page<T> = { items: T[]; next: string | null };

export type QuestionFilter = {
  status?: QuestionStatus;
  category?: CategoryId;
  language?: string;
  tag_q?: string;
  service_id?: string;
};

export type AdminApi = {
  /** 示範模式時為 true（資料只存在這個分頁） */
  demo: boolean;
  me: AdminUser | PublicUser;
  pageAnalytics(filter: { since?: string; until?: string; service_id?: string }): Promise<PageAnalytics>;
  listQuestions(filter: QuestionFilter, cursor?: string | null): Promise<Page<QuestionSummary>>;
  getQuestion(id: string): Promise<QuestionDetail>;
  listAnswers(questionId: string): Promise<Answer[]>;
  editQuestion(id: string, patch: { title?: string; body?: string | null }): Promise<QuestionDetail>;
  editAnswer(id: string, body: string): Promise<Answer>;
  deleteQuestion(id: string): Promise<void>;
  deleteAnswer(id: string): Promise<void>;
  /** 修改固定標籤（傳分類代碼，tags 和 system_tag 會跟著更新） */
  setCategory(id: string, category: CategoryId): Promise<QuestionDetail>;
  /** 設定手動標籤；固定標籤不受影響 */
  setTags(id: string, manualTags: string[]): Promise<QuestionDetail>;
  resolve(id: string): Promise<QuestionDetail>;
  listPiiReports(status: PiiStatus | undefined, cursor?: string | null): Promise<Page<PiiReport>>;
  acceptPii(id: string): Promise<void>;
  denyPii(id: string): Promise<void>;
  listUsers(filter: { q?: string; role?: UserRole }, cursor?: string | null): Promise<Page<AdminUser>>;
  setRole(userId: string, role: UserRole): Promise<AdminUser>;
  ban(userId: string, reason?: string): Promise<AdminUser>;
  unban(userId: string): Promise<AdminUser>;
  cacheAnalytics(): Promise<CacheEntry[]>;
  auditLog(filter: { action?: string; target_id?: string; admin_id?: string }, cursor?: string | null): Promise<Page<AuditEntry>>;
};

type Envelope<T> = { data: T; next_cursor?: string | null };

async function parseError(res: Response) {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new ApiError(res.status, body.error?.code ?? `HTTP_${res.status}`, body.error?.message ?? res.statusText);
  } catch {
    return new ApiError(res.status, `HTTP_${res.status}`, res.statusText);
  }
}

function query(params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---- 登入：沿用 POST /sessions，token 只存在這個分頁（sessionStorage） ----

const SESSION_KEY = "admin-session";

export type AdminSession = { token: string; expires_at: string; user: AdminUser | PublicUser };

export function readSession(): AdminSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    return Date.parse(s.expires_at) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 讀寫不了就算了
  }
}

/** 用管理員的城市通 ID 登入；不是管理員就丟出 403，不存 token */
export async function login(adminId: string): Promise<AdminSession> {
  const res = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ townpass_user_id: adminId }),
  });
  if (!res.ok) throw await parseError(res);
  const session = ((await res.json()) as Envelope<AdminSession>).data;
  if (session.user.role !== "admin") {
    throw new ApiError(403, "NOT_ADMIN", "這個帳號沒有管理員權限");
  }
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // 無痕模式等情況存不了：重新整理後要再登入一次
  }
  return session;
}

// ---- 真正的後端 ----

export function createAdminApi(session: AdminSession, onUnauthorized: () => void): AdminApi {
  async function request<T>(method: string, path: string, body?: unknown): Promise<Envelope<T> | undefined> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 401) {
      onUnauthorized();
      throw new ApiError(401, "UNAUTHORIZED", "登入已過期，請重新登入");
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
  async function page<T>(path: string): Promise<Page<T>> {
    const env = await request<T[]>("GET", path);
    return { items: env?.data ?? [], next: env?.next_cursor ?? null };
  }
  const id = encodeURIComponent;

  return {
    demo: false,
    me: session.user,
    pageAnalytics: (f) => data("GET", `/admin/analytics/pages${query({ ...f, limit: 50 })}`),
    listQuestions: (f, cursor) =>
      page(`/questions${query({ scope: "global", sort: "latest", ...f, cursor, limit: 30 })}`),
    getQuestion: (q) => data("GET", `/questions/${id(q)}`),
    async listAnswers(q) {
      const out: Answer[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 20; i++) {
        const p: Page<Answer> = await page<Answer>(`/questions/${id(q)}/answers${query({ sort: "oldest", cursor, limit: 50 })}`);
        out.push(...p.items);
        cursor = p.next;
        if (!cursor) break;
      }
      return out;
    },
    editQuestion: (q, patch) => piiGuard(data("PATCH", `/admin/questions/${id(q)}`, patch)),
    editAnswer: (a, body) => piiGuard(data("PATCH", `/admin/answers/${id(a)}`, { body })),
    async deleteQuestion(q) {
      await request("DELETE", `/questions/${id(q)}`);
    },
    async deleteAnswer(a) {
      await request("DELETE", `/answers/${id(a)}`);
    },
    setCategory: (q, category) => data("PUT", `/questions/${id(q)}/category`, { category }),
    setTags: (q, tags) => data("PUT", `/questions/${id(q)}/tags`, { tags }),
    resolve: (q) => data("POST", `/questions/${id(q)}/resolve`),
    listPiiReports: (status, cursor) => page(`/admin/pii-reports${query({ status, cursor, limit: 30 })}`),
    async acceptPii(r) {
      await request("POST", `/pii-reports/${id(r)}/accept`);
    },
    async denyPii(r) {
      await request("POST", `/pii-reports/${id(r)}/deny`);
    },
    listUsers: (f, cursor) => page(`/admin/users${query({ ...f, cursor, limit: 30 })}`),
    setRole: (u, role) => data("PUT", `/admin/users/${id(u)}/role`, { role }),
    ban: (u, reason) => data("POST", `/admin/users/${id(u)}/ban`, reason ? { reason } : {}),
    unban: (u) => data("POST", `/admin/users/${id(u)}/unban`),
    cacheAnalytics: () => data("GET", "/admin/analytics/cache?limit=50"),
    auditLog: (f, cursor) => page(`/admin/audit-log${query({ ...f, cursor, limit: 30 })}`),
  };
}

/** 規格：修改內容時回傳 409 表示有待決定的文字個資標記，要先處理標記 */
export const PII_PENDING_MESSAGE = "這則內容有待決定的個資標記，請先到「待處理事項 › 個資標記」處理";

async function piiGuard<T>(promise: Promise<T>) {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) throw new ApiError(409, "PII_PENDING", PII_PENDING_MESSAGE);
    throw e;
  }
}
