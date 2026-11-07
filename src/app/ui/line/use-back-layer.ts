"use client";

import { useEffect, useRef } from "react";

/**
 * 讓手機的「返回鍵」先關掉最上層的畫面（對話框、選單、聊天室…），
 * 而不是直接離開整個頁面——長輩最常用的就是返回鍵。
 *
 * 做法：打開的畫面記在 stack 裡，瀏覽紀錄的 state.lineLayer 記「目前疊了幾層」。
 * stack 有變動時，下一個 tick 才把瀏覽紀錄對齊（多了就 pushState、少了就 history.go 退回），
 * 所以 React StrictMode／Activity 造成的「卸載又馬上掛載」不會留下多餘的紀錄。
 * 按返回鍵（popstate）時，把高於新層數的畫面由上往下關掉。
 * Next.js 的 App Router 支援原生的 pushState，不會觸發換頁。
 */

type Layer = { close: () => void };

const stack: Layer[] = [];
let listening = false;
let scheduled = false;
/** 正在用 history.go 對齊紀錄，接下來那次 popstate 是自己造成的 */
let syncing = false;

function historyDepth(): number {
  const state = window.history.state as { lineLayer?: number } | null;
  return state?.lineLayer ?? 0;
}

function sync() {
  if (syncing) return;
  const depth = historyDepth();
  if (stack.length > depth) {
    for (let i = depth + 1; i <= stack.length; i++) {
      window.history.pushState({ ...window.history.state, lineLayer: i }, "");
    }
  } else if (stack.length < depth) {
    syncing = true;
    window.history.go(stack.length - depth);
  }
}

function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    sync();
  }, 0);
}

function handlePop() {
  if (syncing) {
    syncing = false;
    sync();
    return;
  }
  const depth = historyDepth();
  // 按了返回鍵：關掉高於目前層數的畫面（由上往下）
  while (stack.length > depth) stack.pop()?.close();
  // 往前進到舊紀錄等情況：對齊回目前真正打開的層數
  if (stack.length < depth) sync();
}

export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    if (!listening) {
      window.addEventListener("popstate", handlePop);
      listening = true;
    }
    const layer: Layer = { close: () => closeRef.current() };
    stack.push(layer);
    scheduleSync();
    return () => {
      // 用畫面上的按鈕關掉（還在 stack 裡）：拿掉後讓瀏覽紀錄跟著退
      const i = stack.indexOf(layer);
      if (i !== -1) {
        stack.splice(i, 1);
        scheduleSync();
      }
    };
  }, [open]);
}
