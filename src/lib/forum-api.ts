// 後端 API（規格見 api-spec.md）
import { callApp, type UserInfo } from "@/lib/townpass-bridge";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://tpcodefest.mcloudtw.com/api/v1";

const TOKEN_KEY = "forum_token";

export type Category =
  | "map_navigation"
  | "admin_procedure"
  | "document_contract"
  | "scam_check"
  | "app_usage"
  | "language"
  | "other"
  | "uncategorized";

export const CATEGORY_LABEL: Record<Exclude<Category, "uncategorized">, string> = {
  app_usage: "App 使用 / 問題回報",
  map_navigation: "地圖導航",
  admin_procedure: "行政程序",
  document_contract: "公文合約",
  scam_check: "詐騙查證",
  language: "語言",
  other: "其他",
};

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error;
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `HTTP ${res.status}`);
  }
  return json?.data as T; // 204 沒有內容時為 undefined
}

function readToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const { token, expires_at } = JSON.parse(raw);
    return new Date(expires_at).getTime() > Date.now() + 60_000 ? token : null;
  } catch {
    return null;
  }
}

/** 取得 token：有快取用快取，否則向 App 取 userinfo 再建立工作階段（只送 id 與暱稱） */
export async function getToken(): Promise<string> {
  const cached = readToken();
  if (cached) return cached;
  const user = await callApp<UserInfo | []>("userinfo");
  if (!user || Array.isArray(user)) throw new Error("無法取得 Town Pass 使用者資料，請在 App 內開啟");
  const session = await request<{ token: string; expires_at: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ townpass_user_id: user.id, nickname: user.username?.slice(0, 30), language: "zh-TW" }),
  });
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
  } catch {}
  return session.token;
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export async function uploadImage(token: string, blob: Blob, filename: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("kind", "image");
  return request("/media", { method: "POST", body: form }, token);
}

/** 錄音的 MIME 可能帶 codecs 參數，後端只看檔案類型與副檔名 */
function audioFile(blob: Blob): File {
  const base = blob.type.split(";")[0];
  if (base === "audio/mp4" || base === "audio/x-m4a") return new File([blob], "voice.m4a", { type: "audio/mp4" });
  if (base === "audio/aac") return new File([blob], "voice.aac", { type: "audio/aac" });
  if (base === "audio/mpeg") return new File([blob], "voice.mp3", { type: "audio/mpeg" });
  return new File([blob], "voice.webm", { type: "audio/webm" });
}

export async function uploadAudio(token: string, blob: Blob, durationSeconds: number): Promise<{ id: string }> {
  // 文字欄位放在檔案前面：有些 multipart 解析器處理檔案時只看得到前面的欄位
  const form = new FormData();
  form.append("kind", "audio");
  form.append("duration_seconds", String(Math.round(durationSeconds)));
  form.append("file", audioFile(blob));
  return request("/media", { method: "POST", body: form }, token);
}

export type CreateQuestion = {
  title?: string;
  body?: string;
  media_ids?: string[];
  language: string;
  /** 可不傳：後端會自動分類，不確定時為 uncategorized */
  category?: Category;
  assistance_mode: "online" | "onsite" | "either";
  context?: {
    service_id: string;
    service_name: string;
    page_route?: string;
    page_title?: string;
    extra?: Record<string, unknown>;
  } | null;
  location_sharing?: "off" | "approximate" | "exact";
  client_request_id: string;
};

/** 註冊此裝置的 FCM token（綁定到目前登入的使用者），成功回 204 */
export async function registerPushToken(token: string, pushToken: string, platform: "android" | "ios"): Promise<void> {
  await request(`/push-tokens/${encodeURIComponent(pushToken)}`, {
    method: "PUT",
    body: JSON.stringify({ platform }),
  }, token);
}

export async function createQuestion(token: string, q: CreateQuestion): Promise<{ id: string }> {
  return request("/questions", { method: "POST", body: JSON.stringify(q) }, token);
}
