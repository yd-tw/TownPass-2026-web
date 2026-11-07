"use client";

import { useEffect } from "react";
import { callApp, isInTownPass, type PushToken } from "@/lib/townpass-bridge";
import { ApiError, clearToken, getToken, registerPushToken } from "@/lib/forum-api";

/**
 * 每次載入頁面時把 App 的 FCM token 上傳到後端。
 * token 會變且 App 不會主動通知網頁，所以每次都要傳；使用者身分由後端從登入 token 判斷。
 */
export default function PushTokenSync() {
  useEffect(() => {
    if (!isInTownPass()) return;
    let cancelled = false;

    (async () => {
      const push = await callApp<PushToken | null>("push_token");
      if (cancelled || !push?.token) return;
      try {
        await registerPushToken(await getToken(), push.token, push.platform);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
        clearToken(); // 登入 token 失效：重建工作階段再試一次
        await registerPushToken(await getToken(), push.token, push.platform);
      }
    })().catch((err) => console.warn("[push-token-sync]", err));

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
