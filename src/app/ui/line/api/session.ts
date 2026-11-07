import { callApp, isInTownPass } from "@/lib/townpass-bridge";
import { createHttpApi, publicRequest } from "./http-api";
import type { AskerApi, Me } from "./types";

/**
 * 建立工作階段：在城市通 App 裡用 userinfo.id，在一般瀏覽器用每台瀏覽器自己的測試 ID。
 * 規格：只傳 townpass_user_id（和暱稱），不要傳姓名、身分證字號或電話。
 */

const SESSION_KEY = "line-asker-session";
const WEB_USER_KEY = "line-web-test-user-id";
/** token 到期前多久就重新登入 */
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

type CachedSession = {
  townpass_user_id: string;
  token: string;
  expires_at: string;
};

type SessionResponse = { token: string; expires_at: string; user: Me };

export type Identity = {
  townpassUserId: string;
  nickname?: string;
  /** 不在城市通 App 裡，用的是這台瀏覽器的測試帳號 */
  isWebTest: boolean;
};

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 無痕模式等情況存不了：每次重新登入即可
  }
}

function randomId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** 取得使用者身分：App 裡問 userinfo，一般瀏覽器用本機產生的測試 ID */
export async function getIdentity(): Promise<Identity> {
  if (isInTownPass()) {
    const info = await callApp<{ id?: unknown; username?: unknown } | []>("userinfo");
    if (info && !Array.isArray(info) && typeof info.id === "string" && info.id) {
      return {
        townpassUserId: info.id,
        nickname:
          typeof info.username === "string" && info.username
            ? info.username.slice(0, 30)
            : undefined,
        isWebTest: false,
      };
    }
    throw new Error("無法從城市通取得使用者資料，請重新開啟頁面");
  }
  let id = readStorage<string>(WEB_USER_KEY);
  if (!id) {
    id = `web-test-${randomId()}`;
    writeStorage(WEB_USER_KEY, id);
  }
  return { townpassUserId: id, isWebTest: true };
}

async function login(identity: Identity, fallbackNickname: string) {
  const session = await publicRequest<SessionResponse>("POST", "/sessions", {
    townpass_user_id: identity.townpassUserId,
    // 只有第一次建立帳號時會採用
    nickname: identity.nickname ?? fallbackNickname,
    language: "zh-TW",
  });
  writeStorage(SESSION_KEY, {
    townpass_user_id: identity.townpassUserId,
    token: session.token,
    expires_at: session.expires_at,
  } satisfies CachedSession);
  return session.token;
}

/** 登入（能沿用快取的 token 就沿用）並建立接後端的 AskerApi */
export async function connectBackend(
  identity: Identity,
  fallbackNickname: string,
): Promise<AskerApi> {
  const cached = readStorage<CachedSession>(SESSION_KEY);
  const usable =
    cached &&
    cached.townpass_user_id === identity.townpassUserId &&
    Date.parse(cached.expires_at) - Date.now() > RENEW_BEFORE_MS;
  const token = usable ? cached.token : await login(identity, fallbackNickname);
  return createHttpApi(token, () => login(identity, fallbackNickname));
}
