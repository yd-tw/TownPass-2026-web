// Town Pass WebView bridge：透過 App 注入的 window.flutterObject 與 App 雙向溝通。
// 規格見 TownPass/docs/webview-bridge-spec.md、TownPass/docs/forum-web-guide.md

export type BridgeMessage = { name: string; data: unknown };

type MessageListener = (event: { data: string }) => void;

type FlutterObject = {
  postMessage: (message: string) => void;
  addEventListener?: (type: "message", listener: MessageListener) => void;
  removeEventListener?: (type: "message", listener: MessageListener) => void;
  onmessage?: MessageListener | null;
};

declare global {
  interface Window {
    flutterObject?: FlutterObject;
  }
}

/** 是否在 Town Pass App 內開啟 */
export function isInTownPass(): boolean {
  return typeof window !== "undefined" && typeof window.flutterObject !== "undefined";
}

/**
 * 訂閱 App 傳來的原始事件。優先用 addEventListener（不會蓋掉其他監聽），
 * 舊版物件沒有時才退回 onmessage。
 */
function subscribe(bridge: FlutterObject, listener: MessageListener): () => void {
  if (bridge.addEventListener && bridge.removeEventListener) {
    bridge.addEventListener("message", listener);
    return () => bridge.removeEventListener!("message", listener);
  }
  const prev = bridge.onmessage ?? null;
  bridge.onmessage = (e) => {
    prev?.(e);
    listener(e);
  };
  return () => {
    bridge.onmessage = prev;
  };
}

function parse(raw: string): BridgeMessage | null {
  try {
    const msg = JSON.parse(raw);
    return msg && typeof msg.name === "string" ? msg : null;
  } catch {
    return null;
  }
}

/** 監聽 App 傳來的所有訊息，回傳取消監聽函式 */
export function onAppMessage(listener: (msg: BridgeMessage) => void): () => void {
  const bridge = typeof window !== "undefined" ? window.flutterObject : undefined;
  if (!bridge) return () => {};
  return subscribe(bridge, (e) => {
    const msg = parse(e.data);
    if (msg) listener(msg);
  });
}

/**
 * 呼叫 App 功能。不在 App 內、逾時或 App 未回覆時 resolve(undefined)。
 * 同名功能請勿並行呼叫（回覆沒有 request id，無法對應）。
 */
export function callApp<T = unknown>(name: string, data: unknown = null, timeoutMs = 10_000): Promise<T | undefined> {
  const bridge = typeof window !== "undefined" ? window.flutterObject : undefined;
  if (!bridge) return Promise.resolve(undefined);

  return new Promise((resolve) => {
    const unsubscribe = subscribe(bridge, (e) => {
      const msg = parse(e.data);
      if (msg?.name !== name) return;
      cleanup();
      resolve(msg.data as T);
    });
    const timer = setTimeout(() => {
      cleanup();
      resolve(undefined);
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      unsubscribe();
    }
    bridge.postMessage(JSON.stringify({ name, data }));
  });
}

/** 通知 App、不等回覆（App 不會回覆的功能用這個，避免 callApp 白等到逾時） */
export function postToApp(name: string, data: unknown = null): void {
  const bridge = typeof window !== "undefined" ? window.flutterObject : undefined;
  bridge?.postMessage(JSON.stringify({ name, data }));
}

// ---- 型別 ----

export type UserInfo = {
  id: string;
  account: string;
  username: string;
  realName: string;
  idNo: string;
  email: string;
  phoneNo: string;
  birthday: string;
  memberType: string;
  verifyLevel: string;
  residentAddress: string;
  citizen: boolean;
  nativePeople: boolean;
  cityInternetUid: string;
};

export type PushToken = { token: string; platform: "android" | "ios" };

export type ReportDraft = {
  id: string;
  description: string;
  /** PNG data URL；使用者未附截圖時為 null */
  image: string | null;
  context: {
    /**
     * 截圖時所在畫面，例如 `/account`、`/main/home`（首頁分頁）、`web:tp2026.ydtw.net/new?question=1`、
     * 結尾 `+dialog` / `+sheet` 表示開著對話框或底部彈窗。舊版 App 沒有這個欄位。
     */
    screen?: string;
    /** 截圖時標題列的文字（WebView 為網頁 <title>） */
    screenTitle?: string | null;
    route: string;
    routeHistory: string[];
    webUrl: string | null;
    appVersion: string | null;
    platform: string;
    osVersion: string | null;
    deviceModel: string | null;
    locale: string;
    timestamp: number;
  };
};
