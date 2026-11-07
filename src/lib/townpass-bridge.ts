// Town Pass WebView bridge：透過 App 注入的 window.flutterObject 與 App 雙向溝通。
// 規格見 TownPass/docs/webview-bridge-spec.md

export type BridgeMessage = { name: string; data: unknown };

type FlutterObject = {
  postMessage: (message: string) => void;
  onmessage: ((event: { data: string }) => void) | null;
};

declare global {
  interface Window {
    flutterObject?: FlutterObject;
  }
}

type Listener = (msg: BridgeMessage) => void;

const pending = new Map<string, { resolve: (data: unknown) => void; timer: ReturnType<typeof setTimeout> }>();
const listeners = new Set<Listener>();
let initialized = false;

export function isInTownPass(): boolean {
  return typeof window !== "undefined" && typeof window.flutterObject !== "undefined";
}

function init() {
  if (initialized || !isInTownPass()) return;
  initialized = true;
  window.flutterObject!.onmessage = (event) => {
    let msg: BridgeMessage;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    listeners.forEach((l) => l(msg));
    const p = pending.get(msg.name);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(msg.name);
      p.resolve(msg.data);
    }
  };
}

/** 監聽 App 傳來的所有訊息，回傳取消監聽函式 */
export function onAppMessage(listener: Listener): () => void {
  init();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 呼叫 App 功能；逾時 resolve(undefined) */
export function callApp<T = unknown>(name: string, data: unknown = null, timeoutMs = 10000): Promise<T | undefined> {
  if (!isInTownPass()) return Promise.reject(new Error("not in Town Pass app"));
  init();
  return new Promise((resolve) => {
    pending.get(name)?.resolve(undefined); // 同名請求只保留最新一筆
    const timer = setTimeout(() => {
      pending.delete(name);
      resolve(undefined);
    }, timeoutMs);
    pending.set(name, { resolve: resolve as (data: unknown) => void, timer });
    window.flutterObject!.postMessage(JSON.stringify({ name, data }));
  });
}
