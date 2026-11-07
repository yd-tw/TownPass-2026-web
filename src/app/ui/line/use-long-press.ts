"use client";

import { useRef, type MouseEvent, type PointerEvent } from "react";

/** 手機長按、桌機右鍵都觸發同一個選單（像 LINE 的長按訊息 / 聊天室） */
export function useLongPress(
  onLongPress: (el: HTMLElement) => void,
  ms = 450,
) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const clear = () => window.clearTimeout(timer.current);

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      fired.current = false;
      if (e.pointerType === "mouse") return;
      const el = e.currentTarget;
      clear();
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress(el);
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu(e: MouseEvent<HTMLElement>) {
      e.preventDefault();
      clear();
      if (!fired.current) onLongPress(e.currentTarget);
      fired.current = true;
    },
    onClickCapture(e: MouseEvent<HTMLElement>) {
      // 長按後放開不要再觸發點擊
      if (fired.current) {
        e.preventDefault();
        e.stopPropagation();
        fired.current = false;
      }
    },
  };
}
