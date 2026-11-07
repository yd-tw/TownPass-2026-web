import type { AskerApi } from "./types";

export type DeferredApi = {
  api: AskerApi;
  resolve: (api: AskerApi) => void;
  reject: (error: unknown) => void;
};

/**
 * 還沒連上後端前就能先用的 AskerApi：每個呼叫都等連線好了才轉給真正的 API。
 * /new 用它讓新問題聊天室馬上顯示，不必先轉圈等連線；使用者按送出時才會等。
 *
 * 一般方法用 Proxy 轉發，AskerApi 增減方法時不用跟著改；
 * 只有同步的 subscribe／watch／close 需要特別處理。
 */
export function createDeferredApi(): DeferredApi {
  let resolve!: (api: AskerApi) => void;
  let reject!: (error: unknown) => void;
  const ready = new Promise<AskerApi>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // 連線失敗由呼叫端顯示錯誤畫面；這裡先接住，避免沒人呼叫 API 時出現未處理的 rejection
  ready.catch(() => {});

  let latestWatch: string[] | null = null;
  let closed = false;

  const sync: Pick<AskerApi, "subscribe" | "watch" | "close"> = {
    subscribe(listener) {
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      ready.then(
        (real) => {
          if (!cancelled) unsubscribe = real.subscribe(listener);
        },
        () => {},
      );
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    watch(questionIds) {
      // 只需要最後一次的清單：連線前呼叫多次，連上後只送最新那份
      latestWatch = questionIds;
      ready.then(
        (real) => {
          if (latestWatch === questionIds) real.watch(questionIds);
        },
        () => {},
      );
    },
    close() {
      if (closed) return;
      closed = true;
      ready.then(
        (real) => real.close(),
        () => {},
      );
    },
  };

  const api = new Proxy(sync, {
    get(target, prop) {
      if (prop in target) return target[prop as keyof typeof target];
      // 不是 API 方法：避免被當成 thenable（await／Promise.resolve 會讀 then）或被開發工具誤用
      if (typeof prop === "symbol" || prop === "then" || prop === "toJSON") return undefined;
      // 其他方法都回傳 Promise：等連上後呼叫真正的 API
      return async (...args: unknown[]) => {
        const real = await ready;
        const method = real[prop as keyof AskerApi] as (...a: unknown[]) => unknown;
        return method.apply(real, args);
      };
    },
  }) as unknown as AskerApi;

  return { api, resolve, reject };
}
