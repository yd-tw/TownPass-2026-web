"use client";

import { Pause, Play, SendHorizontal, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { Media } from "./api/types";
import { formatDuration } from "./format";

/**
 * 聊天室裡的影片：用瀏覽器內建的播放控制（長輩在其他 App 看過，最熟悉），
 * 右上角標出長度，還沒播放前就知道要看多久。
 */
export function VideoBubble({ media }: { media: Media }) {
  const duration = media.duration_seconds ? formatDuration(media.duration_seconds) : null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black shadow-sm">
      {/* #t=0.1 讓 iPhone 在播放前也顯示第一個畫面，不會是一片黑 */}
      <video
        src={media.url.includes("#") ? media.url : `${media.url}#t=0.1`}
        controls
        playsInline
        preload="metadata"
        className="block max-h-72 w-[220px] max-w-full"
        aria-label={duration ? `影片，長度 ${duration}` : "影片"}
      />
      {duration && (
        <span className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[12px] font-medium text-white">
          {duration}
        </span>
      )}
    </div>
  );
}

/** 聊天室裡的照片，點一下放大 */
export function ImageBubble({
  media,
  onOpen,
}: {
  media: Media;
  onOpen: (url: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(media.url)}
      className="block overflow-hidden rounded-2xl bg-tp-gray-100 shadow-sm"
      aria-label="放大照片"
    >
      {/* blob: 與 data: 網址不能交給 next/image 最佳化 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.url}
        alt="照片"
        className="max-h-64 w-auto max-w-[220px] object-cover"
      />
    </button>
  );
}

/** 全螢幕看照片 */
export function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-tp-gray-900/95 animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="照片"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="照片" className="max-h-full max-w-full object-contain" />
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="absolute top-3 right-3 flex h-12 items-center gap-1 rounded-full bg-white/20 px-4 text-[15px] text-white"
      >
        <X className="size-6" />
        關閉
      </button>
    </div>
  );
}

/** 語音訊息泡泡：播放鍵＋波形＋秒數 */
export function AudioBubble({ media, self }: { media: Media; self: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [loadedDuration, setLoadedDuration] = useState<number | null>(null);
  const duration = media.duration_seconds ?? loadedDuration ?? 0;
  const progress = duration ? Math.min(current / duration, 1) : 0;
  const bars = Array.from({ length: 18 }, (_, i) => {
    let h = 0;
    for (const ch of media.id) h = (h * 31 + ch.charCodeAt(0) + i * 7) % 97;
    return 30 + (h % 70);
  });

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // 多數瀏覽器需要使用者操作後才能播放；失敗時不做事
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[18px] py-2 pr-4 pl-2 text-tp-gray-900",
        // 自己的語音用跟文字泡泡一樣的淺橘底
        self ? "bg-tp-primary-200" : "bg-white shadow-[0_1px_1px_rgb(20_20_19/0.06)]",
      )}
    >
      <audio
        ref={audioRef}
        src={media.url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setLoadedDuration(d);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "暫停語音" : "播放語音"}
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-full",
          self ? "bg-white/60 text-tp-primary-500" : "bg-tp-primary-50 text-tp-primary-500",
        )}
      >
        {playing ? (
          <Pause className="size-6" fill="currentColor" />
        ) : (
          <Play className="ml-0.5 size-6" fill="currentColor" />
        )}
      </button>
      <div className="flex h-7 items-center gap-[3px]" aria-hidden>
        {bars.map((h, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full",
              i / bars.length < progress
                ? "bg-tp-primary-500"
                : self
                  ? "bg-tp-primary-500/30"
                  : "bg-tp-gray-300",
            )}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <span className="min-w-10 text-[15px] tabular-nums">
        {formatDuration(playing || current > 0 ? current : duration)}
      </span>
    </div>
  );
}

const RECORDER_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

/**
 * 錄音面板：一出現就開始錄，按「傳送」結束並送出，按垃圾桶取消。
 * 最長 maxSeconds 秒，時間到會自動結束並送出。
 */
export function VoiceRecorder({
  maxSeconds,
  onCancel,
  onDone,
  onError,
}: {
  maxSeconds: number;
  onCancel: () => void;
  onDone: (blob: Blob, durationSeconds: number) => void;
  onError: (message: string) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cancelledRef = useRef(false);
  const callbacks = useRef({ onDone, onError });

  useEffect(() => {
    callbacks.current = { onDone, onError };
  });

  useEffect(() => {
    // StrictMode 會先卸載再掛載一次，要重設上一輪 cleanup 留下的旗標
    cancelledRef.current = false;
    let disposed = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    async function start() {
      if (
        typeof MediaRecorder === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        callbacks.current.onError("這個瀏覽器不支援錄音");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        callbacks.current.onError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "請允許使用麥克風才能錄音"
            : "無法開啟麥克風",
        );
        return;
      }
      if (disposed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        window.clearInterval(timer);
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelledRef.current) return;
        const seconds = Math.min(
          maxSeconds,
          Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
        );
        const blob = new Blob(chunks, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        callbacks.current.onDone(blob, seconds);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      timer = window.setInterval(() => {
        const s = (Date.now() - startedAt) / 1000;
        setElapsed(s);
        if (s >= maxSeconds && recorder.state === "recording") recorder.stop();
      }, 200);
    }

    start();
    return () => {
      disposed = true;
      cancelledRef.current = true;
      window.clearInterval(timer);
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") recorder.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [maxSeconds]);

  function finish() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  function cancel() {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") recorder.stop();
    onCancel();
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-t border-tp-gray-100 bg-tp-gray-50 px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={cancel}
        aria-label="取消錄音"
        className="flex size-12 shrink-0 items-center justify-center rounded-full text-tp-gray-800 transition-colors hover:bg-black/5 active:bg-black/10"
      >
        <Trash2 className="size-7" />
      </button>
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <span className="flex items-center gap-2 text-[18px] font-semibold tabular-nums text-tp-gray-900 max-[300px]:gap-1">
          <span
            className={cn(
              "size-3 shrink-0 rounded-full bg-tp-warn-200",
              recording && "animate-pulse",
            )}
          />
          {formatDuration(elapsed)}
          <span className="text-[15px] font-normal text-tp-gray-600 max-[300px]:hidden">
            / {formatDuration(maxSeconds)}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={finish}
        disabled={!recording}
        aria-label="結束錄音並傳送"
        className="flex size-12 shrink-0 items-center justify-center rounded-full text-tp-primary-500 transition-colors hover:bg-black/5 active:bg-black/10 disabled:opacity-40"
      >
        <SendHorizontal className="size-7" />
      </button>
    </div>
  );
}
