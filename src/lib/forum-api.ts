// 後端 API（規格見 api-spec.md）。聊天室的 API 在 src/app/ui/line/api，這裡只放推播註冊用到的部分。
import { callApp, type UserInfo } from "@/lib/townpass-bridge";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://tpcodefest.mcloudtw.com/api/v1";

const TOKEN_KEY = "forum_token";

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

/** 註冊此裝置的 FCM token（綁定到目前登入的使用者），成功回 204 */
export async function registerPushToken(token: string, pushToken: string, platform: "android" | "ios"): Promise<void> {
  await request(`/push-tokens/${encodeURIComponent(pushToken)}`, {
    method: "PUT",
    body: JSON.stringify({ platform }),
  }, token);
}
