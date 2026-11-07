import type { AskerApi } from "./types";

export type DeferredApi = {
  api: AskerApi;
  resolve: (api: AskerApi) => void;
  reject: (error: unknown) => void;
};

/**
 * 還沒連上後端前就能先用的 AskerApi：每個呼叫都等連線好了才轉給真正的 API。
 * /new 用它讓新問題聊天室馬上顯示，不必先轉圈等連線；使用者按送出時才會等。
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

  const call =
    <K extends keyof AskerApi>(name: K) =>
    async (...args: unknown[]) => {
      const api = await ready;
      return (api[name] as (...a: unknown[]) => unknown)(...args);
    };

  let latestWatch: string[] | null = null;
  let closed = false;

  const api = {
    getMeta: call("getMeta"),
    getMe: call("getMe"),
    updateMe: call("updateMe"),
    listMyQuestions: call("listMyQuestions"),
    listForumQuestions: call("listForumQuestions"),
    setQuestionCategory: call("setQuestionCategory"),
    getQuestion: call("getQuestion"),
    createQuestion: call("createQuestion"),
    deleteQuestion: call("deleteQuestion"),
    listAnswers: call("listAnswers"),
    createAnswer: call("createAnswer"),
    deleteAnswer: call("deleteAnswer"),
    resolveQuestion: call("resolveQuestion"),
    vote: call("vote"),
    unvote: call("unvote"),
    uploadMedia: call("uploadMedia"),
    subscribe(listener) {
      let unsubscribe: (() => void) | null = null;
      let cancelled = false;
      ready.then((real) => {
        if (!cancelled) unsubscribe = real.subscribe(listener);
      }, () => {});
      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    watch(questionIds) {
      // 只需要最後一次的清單：連線前呼叫多次，連上後只送最新那份
      latestWatch = questionIds;
      ready.then((real) => {
        if (latestWatch === questionIds) real.watch(questionIds);
      }, () => {});
    },
    close() {
      if (closed) return;
      closed = true;
      ready.then((real) => real.close(), () => {});
    },
  } as AskerApi;

  return { api, resolve, reject };
}
