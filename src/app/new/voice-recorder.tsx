"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";

export type VoiceClip = { blob: Blob; seconds: number };

const MAX_SECONDS = 60;
// iOS WKWebView 只支援 mp4；Android WebView 只支援 webm
const MIME_CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

function pickMimeType(): string | undefined {
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function errorMessage(err: unknown): string {
  const name = (err as DOMException)?.name;
  if (name === "NotAllowedError") return "沒有麥克風權限，請到手機「設定」允許 Town Pass 使用麥克風";
  if (name === "NotFoundError") return "找不到麥克風";
  return `無法錄音：${(err as Error)?.message ?? err}`;
}

type Props = {
  value: VoiceClip | null;
  onChange: (clip: VoiceClip | null) => void;
  disabled?: boolean;
};

/** 發文用的語音附件：最長 60 秒，錄完可試聽、刪除 */
export default function VoiceRecorder({ value, onChange, disabled }: Props) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 非 HTTPS 或瀏覽器不支援時不顯示（伺服器端渲染時沒有 navigator，只能在 effect 判斷）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 只能在 client 判斷
    setSupported(!!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
  }, []);

  useEffect(() => {
    if (!value) return;
    const url = URL.createObjectURL(value.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL 需要配對 revoke
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [value]);

  // 離開頁面時釋放麥克風
  useEffect(() => () => releaseMic(), []);

  function releaseMic() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        releaseMic();
        setRecording(false);
        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        const duration = Math.min(MAX_SECONDS, Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
        if (blob.size) onChange({ blob, seconds: duration });
      };
      recorderRef.current = recorder;
      recorder.start();

      let elapsed = 0;
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        if (elapsed >= MAX_SECONDS && recorder.state === "recording") recorder.stop();
      }, 1000);
    } catch (err) {
      releaseMic();
      setError(errorMessage(err));
    }
  }

  function stop() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  if (!supported) return null;

  return (
    <div className="flex flex-col gap-2">
      {value && previewUrl ? (
        <div className="flex items-center gap-2">
          <audio src={previewUrl} controls className="h-10 min-w-0 flex-1" aria-label="語音說明" />
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label="刪除錄音"
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-tp-warn-200 active:bg-tp-gray-100 disabled:opacity-50"
          >
            <Trash2 size={20} />
          </button>
        </div>
      ) : recording ? (
        <button
          type="button"
          onClick={stop}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-tp-warn-200 px-4 text-[17px] font-bold text-white"
        >
          <Square size={16} fill="currentColor" />
          停止錄音（{seconds} / {MAX_SECONDS} 秒）
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-tp-gray-100 bg-white px-4 text-[17px] text-tp-gray-700 active:bg-tp-gray-50 disabled:opacity-50"
        >
          <Mic size={20} className="text-tp-primary-500" />
          錄製語音說明（最長 {MAX_SECONDS} 秒）
        </button>
      )}

      {error && <p className="text-[15px] text-tp-warn-200">{error}</p>}
    </div>
  );
}
