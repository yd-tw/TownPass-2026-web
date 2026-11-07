"use client";

import {
  Camera,
  ChevronDown,
  CircleCheckBig,
  Copy,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  Mic,
  MoreHorizontal,
  Plus,
  SendHorizontal,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Video,
  Videotape,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import type { Answer, Media, Meta, QuestionDetail, UserRole } from "./api/types";
import { Avatar, QuestionAvatar } from "./avatar";
import { isUncategorized, needsTagHelp, questionManualTags, questionSystemTag } from "./categories";
import { IconButton } from "./chat-list";
import { formatClock, formatDateDivider, isSameDay } from "./format";
import { AudioBubble, ImageBubble, Lightbox, VideoBubble, VoiceRecorder } from "./media";
import type { Notify, Outgoing } from "./types";
import { useBackLayer } from "./use-back-layer";
import { useLongPress } from "./use-long-press";

const CHAT_BG = "var(--color-tp-gray-100)";
/** 自己的泡泡：城市通淺青色底配深色字（像 LINE 的淺綠底黑字） */
const SELF_BUBBLE = "var(--color-tp-primary-200)";
const GROUP_GAP = 5 * 60 * 1000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 60;

/** 讀影片長度；讀不到（部分 WebM 會是 Infinity）就回傳 undefined */
function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | undefined) => {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = window.setTimeout(() => done(undefined), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined);
    video.onerror = () => done(undefined);
    video.src = url;
  });
}

export type ChatRoomProps = {
  meId: string;
  /** null 表示還沒送出的新問題 */
  question: QuestionDetail | null;
  answers: Answer[];
  now: number;
  limits: Meta["limits"];
  sending: boolean;
  onBack: () => void;
  onSend: (out: Outgoing) => Promise<boolean>;
  onResolve: () => Promise<void>;
  onUpdateTags: (tags: string[]) => Promise<boolean>;
  onToggleVote: (answer: Answer, value: 1 | -1) => Promise<void>;
  onDeleteAnswer: (answer: Answer) => void;
  onWithdraw: () => Promise<void>;
  notify: Notify;
  locationSharing: "off" | "approximate";
  onLocationSharingChange: (value: "off" | "approximate") => void;
  /** 打開時從右邊滑入；一開頁面就顯示的聊天室（/new）設 false，避免閃一下 */
  animateIn?: boolean;
  /** 新問題預先放好的待傳附件（App 問題回報的截圖） */
  initialMedia?: PendingMedia[];
  /** 新問題上方的提示，取代預設文字 */
  draftHint?: string;
};

/** 問題本文或一則回答 */
type Post = {
  key: string;
  answer: Answer | null;
  self: boolean;
  authorName: string;
  authorRole: UserRole;
  at: number;
  body: string | null;
  media: Media[];
  hiddenBody: boolean;
};

type Item =
  | { type: "date"; key: string; label: string }
  | { type: "note"; key: string; text: string }
  | { type: "post"; key: string; post: Post; first: boolean };

type Confirm = { kind: "withdraw" | "resolve" };
/** 輸入列按鈕：比一般 IconButton 小一號，五個按鈕擠得下 */
const INPUT_BUTTON = "size-11 max-[300px]:size-10";

export type PendingMedia = { id: string; kind: "image" | "video"; file: File; duration?: number };

export function ChatRoom(props: ChatRoomProps) {
  const { question, answers, meId, now, sending, notify } = props;
  const limits = props.limits;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const recordVideoRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia[]>(() => props.initialMedia ?? []);
  // 預先放好的附件晚到（App 問題回報的截圖比聊天室晚讀到）：加到待傳附件最前面
  const [seenInitialMedia, setSeenInitialMedia] = useState(props.initialMedia);
  if (props.initialMedia !== seenInitialMedia) {
    setSeenInitialMedia(props.initialMedia);
    const added = props.initialMedia;
    if (added?.length) {
      setPendingMedia((current) => [...added, ...current.filter((item) => !added.some((a) => a.id === item.id))]);
    }
  }
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [recording, setRecording] = useState(false);
  const [menu, setMenu] = useState<{ post: Post; top: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [resolving, setResolving] = useState(false);
  const [tagSaving, setTagSaving] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusTagInput, setFocusTagInput] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  /** 待傳圖片的放大預覽（blob: 網址，關閉時釋放） */
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const [showJump, setShowJump] = useState(false);
  const [draftOptionsOpen, setDraftOptionsOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const isAuthor = !question || question.author.id === meId;

  const label = question ? questionSystemTag(question) : null;
  const othersAnswers = useMemo(
    () => answers.filter((a) => a.author.id !== meId),
    [answers, meId],
  );
  const othersCount = othersAnswers.length;
  const canResolve = !!question && isAuthor && question.status !== "resolved";

  const posts = useMemo(() => {
    const out: Post[] = [];
    if (question) {
      out.push({
        key: "question",
        answer: null,
        self: question.author.id === meId,
        authorName: question.author.nickname,
        authorRole: question.author.role,
        at: Date.parse(question.created_at),
        body: question.body,
        media: question.media,
        hiddenBody:
          question.body === null &&
          question.hidden_parts.some((p) => p.part === "body"),
      });
    }
    for (const a of answers) {
      out.push({
        key: a.id,
        answer: a,
        self: a.author.id === meId,
        authorName: a.author.nickname,
        authorRole: a.author.role,
        at: Date.parse(a.created_at),
        body: a.body,
        media: a.media,
        hiddenBody: a.body === null && a.hidden_parts.some((p) => p.part === "body"),
      });
    }
    return out;
  }, [question, answers, meId]);

  const items = useMemo(() => {
    const out: Item[] = [];
    if (!question) {
      out.push({
        type: "note",
        key: "draft-note",
        text: props.draftHint ?? "請說說您想問什麼\n可以打字、拍照，或按麥克風錄音",
      });
    }
    let prev: Post | undefined;
    for (const p of posts) {
      const newDay = !prev || !isSameDay(prev.at, p.at);
      if (newDay) {
        out.push({ type: "date", key: `date-${p.key}`, label: formatDateDivider(p.at, now) });
      }
      if (p.key === "question") {
        const author = `${question?.author.nickname ?? "有人"}${question?.author.role === "bot" ? "（機器人）" : ""}`;
        out.push({
          type: "note",
          key: "asked-note",
          text:
            !label || (question && isUncategorized(question)) || label === "其他"
              ? `${author} 開了一個新問題`
              : `${author} 開了一個「${label}」的問題`,
        });
      }
      const first =
        newDay ||
        !prev ||
        prev.self !== p.self ||
        prev.authorName !== p.authorName ||
        p.at - prev.at > GROUP_GAP;
      out.push({ type: "post", key: p.key, post: p, first });
      prev = p;
    }
    return out;
  }, [posts, question, label, now, props.draftHint]);

  // ---- 手機返回鍵：由上往下一層一層關 ----
  useBackLayer(true, props.onBack);
  useBackLayer(drawerOpen, () => setDrawerOpen(false));
  useBackLayer(recording, () => setRecording(false));
  useBackLayer(menu !== null, () => setMenu(null));
  useBackLayer(confirm !== null, () => setConfirm(null));
  useBackLayer(lightbox !== null, () => setLightbox(null));
  useBackLayer(preview !== null, () => setPreview(null));

  // ---- 捲動 ----
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, []);

  const lastKey = posts.at(-1)?.key;
  const lastSelf = posts.at(-1)?.self;
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (lastSelf || sending || nearBottomRef.current) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
  }, [lastKey, lastSelf, sending, question?.status]);

  useEffect(() => {
    const list = listRef.current;
    if (list && nearBottomRef.current) list.scrollTop = list.scrollHeight;
  }, [recording]);

  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    nearBottomRef.current = near;
    setShowJump(!near);
  }

  // ---- 送出 ----
  /** @param audio 有待傳附件時錄的音，和附件一起送出 */
  async function sendText(audio?: { blob: Blob; duration: number }) {
    const trimmed = text.trim();
    if ((!trimmed && pendingMedia.length === 0) || sending || checkingVideo) return;
    if (trimmed.length > limits.question_body_max_chars) {
      notify("字數太多了，請分幾次傳送", "error");
      return;
    }
    const sent = pendingMedia.length
      ? await props.onSend({
          kind: "media",
          text: trimmed || undefined,
          files: pendingMedia.map(({ kind, file, duration }) => ({ kind, file, duration })),
          audio,
        })
      : await props.onSend({ kind: "text", text: trimmed });
    if (sent) {
      setText((current) => current === text ? "" : current);
      setPendingMedia([]);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 手機上 Enter 是換行（同 LINE），只有用滑鼠的電腦按 Enter 才送出；
    // 中文輸入法選字時按 Enter 也不送出
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      e.preventDefault();
      sendText();
    }
  }

  function handlePickFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (files.length + pendingMedia.length > limits.media_per_post_max) {
      notify(`一則訊息最多附加 ${limits.media_per_post_max} 個檔案`, "error");
      return;
    }
    if (files.some((f) => !IMAGE_TYPES.includes(f.type))) {
      notify("照片格式要是 JPEG、PNG 或 WebP", "error");
      return;
    }
    if (files.some((f) => f.size > limits.image_max_bytes)) {
      notify(`照片太大了，每張不能超過 ${Math.round(limits.image_max_bytes / 1024 / 1024)} MB`, "error");
      return;
    }
    setPendingMedia((current) => [...current, ...files.map((file) => ({ id: crypto.randomUUID(), kind: "image" as const, file }))]);
  }

  async function handlePickVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (pendingMedia.length >= limits.media_per_post_max) {
      notify(`一則訊息最多附加 ${limits.media_per_post_max} 個檔案`, "error");
      return;
    }
    if (!VIDEO_TYPES.includes(file.type.split(";")[0])) {
      notify("影片格式要是 MP4 或 WebM", "error");
      return;
    }
    const maxBytes = limits.video_max_bytes ?? VIDEO_MAX_BYTES;
    const maxSeconds = limits.video_max_seconds ?? VIDEO_MAX_SECONDS;
    if (file.size > maxBytes) {
      notify(`影片太大了，不能超過 ${Math.round(maxBytes / 1024 / 1024)} MB，請錄短一點`, "error");
      return;
    }
    setCheckingVideo(true);
    const duration = await readVideoDuration(file);
    setCheckingVideo(false);
    if (!duration) {
      notify("無法讀取影片長度，請改用 MP4 或 WebM 影片", "error");
      return;
    }
    if (duration > maxSeconds) {
      notify(`影片太長了，最長 ${maxSeconds} 秒，請錄短一點`, "error");
      return;
    }
    setPendingMedia((current) => [...current, { id: crypto.randomUUID(), kind: "video", file, duration }]);
  }

  async function resolve() {
    if (!canResolve || resolving) return;
    setResolving(true);
    try { await props.onResolve(); }
    finally { setResolving(false); }
  }

  async function updateTags(tags: string[]) {
    if (!question || tagSaving) return false;
    setTagSaving(true);
    try { return await props.onUpdateTags(tags); }
    finally { setTagSaving(false); }
  }

  async function toggleVote(answer: Answer, value: 1 | -1) {
    if (votingIds.has(answer.id)) return;
    setVotingIds((previous) => new Set(previous).add(answer.id));
    try { await props.onToggleVote(answer, value); }
    finally {
      setVotingIds((previous) => {
        const next = new Set(previous);
        next.delete(answer.id);
        return next;
      });
    }
  }

  function openMenu(post: Post, el: HTMLElement) {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    let top = r.top - box.top - 76;
    if (top < 60) top = r.bottom - box.top + 8;
    top = Math.min(top, box.height - 90);
    setMenu({ post, top });
  }

  async function copy(textToCopy: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      notify("已複製");
    } catch {
      notify("無法存取剪貼簿", "error");
    }
  }

  return (
    <div
      ref={rootRef}
      className={`absolute inset-0 z-20 flex flex-col ${props.animateIn === false ? "" : "animate-in duration-200 slide-in-from-right"}`}
      style={{ background: CHAT_BG }}
      onTouchStart={(event) => { swipeStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
      onTouchEnd={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || drawerOpen || recording || menu || confirm || lightbox || preview) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (dx < -85 && Math.abs(dx) > Math.abs(dy) * 1.4) props.onBack();
      }}
    >
      {question && needsTagHelp(question) && (
        <div className="mx-3 my-2 flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-tp-gray-100">
          <Tag className="size-5 shrink-0 text-tp-primary-500" />
          <span className="min-w-0 flex-1 text-[15px] text-tp-gray-900">這題還沒有標籤</span>
          <button
            type="button"
            onClick={() => { setFocusTagInput(true); setDrawerOpen(true); }}
            className="min-h-10 shrink-0 rounded-full bg-tp-primary-500 px-4 text-[15px] font-bold text-white active:bg-tp-primary-600"
          >
            協助標籤
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-3 pt-1 pb-3"
          aria-live="polite"
        >
          {items.map((item) => {
            if (item.type === "date") {
              return (
                <div
                  key={item.key}
                  className="my-3 flex justify-center"
                >
                  <span className="rounded-full bg-tp-gray-100 px-3 py-0.5 text-[12px] text-tp-gray-800">
                    {item.label}
                  </span>
                </div>
              );
            }
            if (item.type === "note") {
              return (
                <div
                  key={item.key}
                  className="my-3 flex justify-center px-4"
                >
                  <span className="rounded-2xl bg-tp-gray-100 px-4 py-2.5 text-center text-[15px] leading-relaxed whitespace-pre-wrap text-tp-gray-800">
                    {item.text}
                  </span>
                </div>
              );
            }
            return (
              <PostRow
                key={item.key}
                post={item.post}
                first={item.first}
                onMenu={openMenu}
                onOpenImage={setLightbox}
                onToggleVote={toggleVote}
                voteBusy={item.post.answer ? votingIds.has(item.post.answer.id) : false}
              />
            );
          })}
          {question?.status === "resolved" && (
            <div className="my-3 flex justify-center px-4">
              <p className="flex items-center gap-1.5 rounded-2xl bg-tp-gray-500/15 px-4 py-2.5 text-center text-[15px] leading-relaxed text-tp-gray-700">
                <CircleCheckBig className="size-4 shrink-0" />
                這個問題已經解決了
              </p>
            </div>
          )}
          {sending && (
            <div className="mt-3 flex justify-end">
              <span className="flex items-center gap-1.5 rounded-full bg-tp-primary-50 px-3 py-1.5 text-[13px] text-tp-primary-500">
                <LoaderCircle className="size-3.5 animate-spin" />
                傳送中…
              </span>
            </div>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            aria-label="捲到最新回答"
            onClick={() =>
              listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
            }
            className="absolute right-3 bottom-3 z-10 flex size-11 items-center justify-center rounded-full bg-tp-gray-50 text-tp-gray-800 shadow-md ring-1 ring-tp-gray-100"
          >
            <ChevronDown className="size-5" />
          </button>
        )}
      </div>

      {canResolve && <button type="button" onClick={() => setConfirm({ kind: "resolve" })} disabled={resolving} className="mx-3 my-2 flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-tp-primary-50 px-3 text-[15px] font-semibold text-tp-primary-500 disabled:opacity-50">
        {resolving ? <LoaderCircle className="size-5 animate-spin" /> : <CircleCheckBig className="size-5" />}
        標記為已完成
      </button>}

      {recording ? (
        <VoiceRecorder
          maxSeconds={limits.audio_max_seconds}
          onCancel={() => setRecording(false)}
          onDone={(blob, duration) => {
            setRecording(false);
            // 有待傳附件（例如 App 問題回報的截圖）時，錄音和附件放在同一則送出
            if (pendingMedia.length > 0) sendText({ blob, duration });
            else props.onSend({ kind: "audio", blob, duration });
          }}
          onError={(message) => {
            setRecording(false);
            notify(message, "error");
          }}
        />
      ) : (
        <div className="relative shrink-0 border-t border-tp-gray-100 bg-tp-gray-50 px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {pendingMedia.length > 0 && (
            <div className="flex max-h-28 gap-2 overflow-x-auto px-2 pb-2" aria-label="待傳附件">
              {pendingMedia.map((item) => (
                <div key={item.id} className="flex max-w-40 shrink-0 items-center gap-1.5 rounded-xl bg-tp-gray-100 px-2 py-1.5 text-[13px] text-tp-gray-900">
                  {item.kind === "image" ? (
                    // 點縮圖或檔名放大預覽，送出前可以確認截圖內容
                    <button
                      type="button"
                      aria-label={`預覽 ${item.file.name}`}
                      onClick={() => setPreview(URL.createObjectURL(item.file))}
                      className="flex min-w-0 items-center gap-1.5 rounded-md text-left"
                    >
                      <PendingMediaThumbnail item={item} />
                      <span className="min-w-0 truncate" title={item.file.name}>{item.file.name}</span>
                    </button>
                  ) : (
                    <>
                      <PendingMediaThumbnail item={item} />
                      <span className="min-w-0 truncate" title={item.file.name}>{item.file.name}</span>
                    </>
                  )}
                  <button
                    type="button"
                    aria-label={`移除 ${item.file.name}`}
                    disabled={sending}
                    onClick={() => setPendingMedia((current) => current.filter((pending) => pending.id !== item.id))}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-tp-gray-200 disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* 發問選項：浮在「…」上方，從下面滑出來 */}
          {!question && draftOptionsOpen && (
            <div className="absolute bottom-full left-2 z-10 mb-2 w-[min(20rem,calc(100%-1rem))] rounded-2xl bg-white p-3 shadow-xl ring-1 ring-tp-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-200">
              <label className="flex items-center justify-between gap-3 text-[15px] text-tp-gray-900">
                <span><strong className="block">通知附近使用者</strong><span className="block text-[12px] text-tp-gray-600">提供概略位置，讓附近的人看到問題</span></span>
                <input type="checkbox" checked={props.locationSharing !== "off"} onChange={(event) => props.onLocationSharingChange(event.target.checked ? "approximate" : "off")} className="size-5 accent-tp-primary-500" />
              </label>
            </div>
          )}
          {attachmentMenuOpen && (
            <div className="absolute bottom-full left-2 z-10 mb-2 flex max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-tp-gray-100">
              {([
                ["camera", "拍照", Camera, cameraRef],
                ["record", "錄影", Video, recordVideoRef],
                ["gallery", "從相簿選照片", ImageIcon, galleryRef],
                ["video", "從相簿選影片", Videotape, videoRef],
              ] as const).map(([kind, label, Icon, ref]) => (
                <button key={kind} type="button" onClick={() => { setAttachmentMenuOpen(false); ref.current?.click(); }} className="flex min-h-11 items-center gap-2 px-4 text-left text-[15px] text-tp-gray-900 hover:bg-tp-gray-100/50">
                  <Icon className="size-5 shrink-0" />{label}
                </button>
              ))}
            </div>
          )}
          <div className="flex min-w-0 items-end gap-0.5">
          {!question && <IconButton label="發問額外選項" onClick={() => { setAttachmentMenuOpen(false); setDraftOptionsOpen((open) => !open); }} className={INPUT_BUTTON}><MoreHorizontal className="size-5" /></IconButton>}
          {question && <IconButton label="問題選單" onClick={() => { setAttachmentMenuOpen(false); setFocusTagInput(false); setDrawerOpen(true); }} className={INPUT_BUTTON}><Menu className="size-5" /></IconButton>}
          <IconButton label="新增附件" disabled={sending || checkingVideo} onClick={() => { setDraftOptionsOpen(false); setAttachmentMenuOpen((open) => !open); }} className={INPUT_BUTTON}><Plus className="size-6" /></IconButton>
          <div className="mx-1 flex min-h-11 min-w-0 flex-1 items-end rounded-[22px] bg-tp-gray-100/70 px-4 max-[300px]:px-2">
            <textarea
              rows={1}
              value={text}
              maxLength={limits.question_body_max_chars}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={question ? "補充說明…" : "請輸入問題…"}
              aria-label={question ? "補充說明" : "輸入問題"}
              className="field-sizing-content max-h-36 min-h-11 min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-6 outline-none placeholder:text-tp-gray-600"
            />
          </div>
          {/* 沒打字時都可以錄音，包含已經有待傳附件的時候 */}
          {!text.trim() && (
            <IconButton
              label="錄音"
              disabled={sending || checkingVideo || pendingMedia.length >= limits.media_per_post_max}
              onClick={() => setRecording(true)}
              className={INPUT_BUTTON}
            >
              <Mic className="size-6" />
            </IconButton>
          )}
          {(text.trim() || pendingMedia.length > 0) && (
            <IconButton
              label="傳送"
              className={`${INPUT_BUTTON} text-tp-primary-500`}
              disabled={sending || checkingVideo}
              onClick={() => sendText()}
            >
              {sending || checkingVideo ? (
                <LoaderCircle className="size-6 animate-spin" />
              ) : (
                <SendHorizontal className="size-6" />
              )}
            </IconButton>
          )}
          </div>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handlePickFiles}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        multiple
        hidden
        onChange={handlePickFiles}
      />
      <input ref={recordVideoRef} type="file" accept={VIDEO_TYPES.join(",")} capture="environment" hidden onChange={handlePickVideo} />
      <input ref={videoRef} type="file" accept={VIDEO_TYPES.join(",")} hidden onChange={handlePickVideo} />

      {menu && (
        <PostMenu
          post={menu.post}
          top={menu.top}
          onClose={() => setMenu(null)}
          onCopy={() => copy(menu.post.body ?? "")}
          onDelete={() => menu.post.answer && props.onDeleteAnswer(menu.post.answer)}
        />
      )}

      {drawerOpen && question && (
        <QuestionDrawer
          question={question}
          answerCount={othersCount}
          isAuthor={isAuthor}
          onClose={() => setDrawerOpen(false)}
          onWithdraw={() => setConfirm({ kind: "withdraw" })}
          onUpdateTags={updateTags}
          tagSaving={tagSaving}
          focusTagInput={focusTagInput}
        />
      )}

      {confirm?.kind === "withdraw" && (
        <ConfirmDialog
          title="撤回這個問題？"
          body="撤回後，問題和所有回答都會消失，不能復原。"
          confirmLabel="撤回"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            setDrawerOpen(false);
            await props.onWithdraw();
          }}
        />
      )}

      {confirm?.kind === "resolve" && (
        <ConfirmDialog
          title="標記問題為已完成？"
          body="標記後討論仍可繼續，您也可以繼續採納回答。"
          confirmLabel="確認完成"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            void resolve();
          }}
        />
      )}

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
      {preview && <Lightbox url={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PendingMediaThumbnail({ item }: { item: PendingMedia }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(item.file);
    if (item.kind === "image" && imageRef.current) imageRef.current.src = url;
    if (item.kind === "video" && videoRef.current) videoRef.current.src = `${url}#t=0.1`;
    return () => URL.revokeObjectURL(url);
  }, [item.file, item.kind]);

  return item.kind === "image" ? (
    // blob: 網址僅用於尚未送出的本機預覽
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={imageRef} alt="" className="size-9 shrink-0 rounded-md object-cover" />
  ) : (
    <video ref={videoRef} aria-hidden="true" muted playsInline preload="metadata" className="size-9 shrink-0 rounded-md bg-black object-cover" />
  );
}

function PostRow({
  post,
  first,
  onMenu,
  onOpenImage,
  onToggleVote,
  voteBusy,
}: {
  post: Post;
  first: boolean;
  onMenu: (post: Post, el: HTMLElement) => void;
  onOpenImage: (url: string) => void;
  onToggleVote: (answer: Answer, value: 1 | -1) => void;
  voteBusy: boolean;
}) {
  const press = useLongPress((el) => onMenu(post, el));
  const answer = post.answer;

  const bubbles = (
    <div
      {...press}
      className={cn(
        "flex min-w-0 flex-col gap-1 select-none [-webkit-touch-callout:none]",
        post.self ? "items-end" : "items-start",
      )}
    >
      {(post.body !== null || post.hiddenBody) && (
        <TextBubble self={post.self} tail={first}>
          {post.hiddenBody ? (
            <span className="text-tp-gray-400 italic">內容待確認個資，暫時隱藏</span>
          ) : (
            post.body
          )}
        </TextBubble>
      )}
      {post.media.map((m) =>
        m.kind === "image" ? (
          <ImageBubble key={m.id} media={m} onOpen={onOpenImage} />
        ) : m.kind === "video" ? (
          <VideoBubble key={m.id} media={m} />
        ) : (
          <AudioBubble key={m.id} media={m} self={post.self} />
        ),
      )}
    </div>
  );
  const reactions = answer && (
    <div className="flex items-center gap-1 justify-self-start">
      <button
        type="button"
        aria-label={`${answer.votes.my_vote === 1 ? "取消讚" : "讚"}，目前 ${answer.votes.upvotes} 個讚`}
        aria-pressed={answer.votes.my_vote === 1}
        disabled={voteBusy}
        onClick={() => onToggleVote(answer, 1)}
        className={cn(
          "flex min-h-8 items-center gap-1.5 rounded-full px-2 text-[13px] transition-colors disabled:opacity-50",
          answer.votes.my_vote === 1 ? "bg-tp-primary-50 font-semibold text-tp-primary-500" : "text-tp-gray-700 hover:bg-black/5",
        )}
      >
        <ThumbsUp className="size-4" fill={answer.votes.my_vote === 1 ? "currentColor" : "none"} />
        <span>{answer.votes.upvotes}</span>
      </button>
      <button
        type="button"
        aria-label={post.self ? "不能對自己的回答倒讚" : answer.votes.my_vote === -1 ? "取消倒讚" : "倒讚"}
        aria-pressed={answer.votes.my_vote === -1}
        title={post.self ? "不能對自己的回答倒讚" : undefined}
        disabled={voteBusy || post.self}
        onClick={() => onToggleVote(answer, -1)}
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-colors disabled:opacity-40",
          answer.votes.my_vote === -1 ? "bg-tp-gray-100 text-tp-gray-900" : "text-tp-gray-700 hover:bg-black/5",
        )}
      >
        <ThumbsDown className="size-4" fill={answer.votes.my_vote === -1 ? "currentColor" : "none"} />
      </button>
    </div>
  );
  const time = (
    <span className="shrink-0 pb-0.5 text-[12px] leading-tight text-tp-gray-600">
      {formatClock(post.at)}
    </span>
  );

  if (post.self) {
    return (
      <div
        data-key={post.key}
        className={cn("flex justify-end pl-12 max-[300px]:pl-1", first ? "mt-3" : "mt-1")}
      >
        <div className="grid w-fit max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-end gap-x-1.5">
          {post.authorRole === "bot" && <span className="col-start-2 row-start-1 justify-self-end text-[12px] font-semibold text-tp-primary-500">機器人</span>}
          <span className={cn("col-start-1", post.authorRole === "bot" ? "row-start-2" : "row-start-1")}>{time}</span>
          <div className={cn("col-start-2 min-w-0", post.authorRole === "bot" ? "row-start-2" : "row-start-1")}>{bubbles}</div>
          {reactions && <div className={cn("col-start-2 mt-1", post.authorRole === "bot" ? "row-start-3" : "row-start-2")}>{reactions}</div>}
        </div>
      </div>
    );
  }

  return (
    <div
      data-key={post.key}
      className={cn(
        "relative flex items-start gap-2 pr-8 max-[300px]:gap-1 max-[300px]:pr-2",
        first ? "mt-3" : "mt-1.5",
      )}
    >
      <div className="w-10 shrink-0 max-[300px]:hidden">{first && <Avatar name={post.authorName} size={40} />}</div>
      <div className="flex min-w-0 flex-col items-start">
        {first && (
          <span className="mb-1 flex max-w-full items-center gap-1.5 text-[13px] text-tp-gray-800">
            <span className="truncate">{post.authorName}</span>
            {post.authorRole === "bot" && <span className="shrink-0 rounded-full bg-tp-primary-50 px-1.5 font-semibold text-tp-primary-500">機器人</span>}
          </span>
        )}
        <div className="grid w-fit max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1.5">
          <div className="col-start-1 row-start-1 min-w-0">{bubbles}</div>
          <span className="col-start-2 row-start-1">{time}</span>
          {reactions && <div className="col-start-1 row-start-2 mt-1">{reactions}</div>}
        </div>
      </div>
    </div>
  );
}

function TextBubble({
  self,
  tail,
  children,
}: {
  self: boolean;
  tail: boolean;
  children: ReactNode;
}) {
  const color = self ? SELF_BUBBLE : "#ffffff";
  return (
    <div
      className={cn(
        "relative rounded-[18px] px-3.5 py-2.5 text-[15px] leading-snug wrap-break-word whitespace-pre-wrap text-tp-gray-900",
        !self && "shadow-[0_1px_1px_rgb(20_20_19/0.06)]",
        tail && (self ? "rounded-tr-[4px]" : "rounded-tl-[4px]"),
      )}
      style={{ background: color }}
    >
      {tail && (
        <svg
          aria-hidden
          width="9"
          height="12"
          viewBox="0 0 9 12"
          className={cn("absolute top-0", self ? "-right-[7px] -scale-x-100" : "-left-[7px]")}
        >
          <path d="M9 0H1.2C.2 0-.3 1.2.4 1.9L9 12Z" style={{ fill: color }} />
        </svg>
      )}
      {children}
    </div>
  );
}

function PostMenu({
  post,
  top,
  onClose,
  onCopy,
  onDelete,
}: {
  post: Post;
  top: number;
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const a = post.answer;
  const actions: { label: string; icon: LucideIcon; run: () => void }[] = [];
  if (post.body) actions.push({ label: "複製", icon: Copy, run: onCopy });
  if (a && post.self) {
    actions.push({ label: "刪除", icon: Trash2, run: onDelete });
  }
  if (actions.length === 0) return null;

  return (
    <div className="absolute inset-0 z-30">
      <button
        type="button"
        aria-label="關閉選單"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/10"
      />
      <div
        role="menu"
        className="absolute left-1/2 flex -translate-x-1/2 gap-1 rounded-2xl bg-tp-gray-50 p-1.5 shadow-xl ring-1 ring-black/5 animate-in zoom-in-95 fade-in"
        style={{ top }}
      >
        {actions.map(({ label, icon: Icon, run }) => (
          <button
            key={label}
            type="button"
            role="menuitem"
            onClick={() => {
              run();
              onClose();
            }}
            className="flex w-18 flex-col items-center gap-1 rounded-xl py-2.5 text-[15px] text-tp-gray-900 hover:bg-tp-gray-100/60"
          >
            <Icon className="size-6" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionDrawer({
  question,
  answerCount,
  isAuthor,
  onClose,
  onWithdraw,
  onUpdateTags,
  tagSaving,
  focusTagInput,
}: {
  question: QuestionDetail;
  answerCount: number;
  isAuthor: boolean;
  onClose: () => void;
  onWithdraw: () => void;
  onUpdateTags: (tags: string[]) => Promise<boolean>;
  tagSaving: boolean;
  focusTagInput: boolean;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [tagError, setTagError] = useState("");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const fixedTag = isUncategorized(question) ? null : questionSystemTag(question);
  const manualTags = questionManualTags(question);
  useEffect(() => {
    if (focusTagInput) tagInputRef.current?.focus();
  }, [focusTagInput]);
  const statusLabel =
    question.status === "resolved" ? "已解決" : question.status === "in_progress" ? "協助中" : "等待回答";
  const asked = new Date(question.created_at);
  const rows: [string, string][] = [
    ["狀態", statusLabel],
    ["回答", `${answerCount} 則`],
    ["發問時間", `${asked.getMonth() + 1}/${asked.getDate()} ${formatClock(asked.getTime())}`],
  ];

  async function addTag() {
    const tag = tagDraft.trim().replace(/^#/, "").trim();
    if (!tag || tag.length > 20 || !/^[\p{L}\p{N} _·-]+$/u.test(tag)) {
      setTagError("標籤需為 1 至 20 字，只能使用文字、數字、空白、-、_、·");
      return;
    }
    if (manualTags.length >= 5) {
      setTagError("手動標籤最多 5 個");
      return;
    }
    if ([questionSystemTag(question), ...manualTags].filter(Boolean).some((current) => current.replace(/^#/, "").toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagError("這個標籤已存在");
      return;
    }
    setTagError("");
    if (await onUpdateTags([...manualTags, tag])) setTagDraft("");
  }

  return (
    <div className="absolute inset-0 z-40">
      <button
        type="button"
        aria-label="關閉問題選單"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 animate-in fade-in"
      />
      <aside className="absolute inset-y-0 right-0 flex w-[84%] flex-col bg-tp-gray-50 shadow-2xl animate-in duration-200 slide-in-from-right">
        <div className="flex justify-end p-2">
          <IconButton label="關閉" onClick={onClose}>
            <X className="size-7" />
          </IconButton>
        </div>
        <div className="flex flex-col items-center px-5 pb-4">
          <QuestionAvatar q={question} size={72} />
          <p className="mt-3 text-center text-[17px] leading-snug font-bold">
            {question.body ?? "（內容待確認）"}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-tp-gray-100/70 px-5 py-2">
          <section className="border-b border-tp-gray-100/60 py-3">
            <h3 className="text-[15px] text-tp-gray-600">標籤</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {fixedTag && <span className="rounded-lg bg-tp-primary-50 px-2 py-1.5 text-[14px] font-semibold text-tp-primary-500">#{fixedTag.replace(/^#/, "")}</span>}
              {manualTags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="flex max-w-full items-center rounded-lg bg-tp-primary-50 text-[14px] font-semibold text-tp-primary-500">
                  <span className="truncate px-2 py-1.5">#{tag.replace(/^#/, "")}</span>
                  {isAuthor && <button type="button" aria-label={`移除標籤 ${tag}`} disabled={tagSaving} onClick={() => void onUpdateTags(manualTags.filter((_, i) => i !== index))} className="flex size-8 shrink-0 items-center justify-center disabled:opacity-50"><X className="size-4" /></button>}
                </span>
              ))}
            </div>
            <div className="mt-3 flex min-w-0 gap-2">
              <input ref={tagInputRef} type="text" aria-label="手動輸入標籤" placeholder="手動輸入標籤" value={tagDraft} maxLength={21} onChange={(event) => { setTagDraft(event.target.value); setTagError(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addTag(); } }} className="min-w-0 flex-1 rounded-lg bg-white px-2 text-[14px] text-tp-gray-900 ring-1 ring-tp-gray-100" />
              <button type="button" disabled={tagSaving || manualTags.length >= 5} onClick={() => void addTag()} className="min-h-10 shrink-0 rounded-lg bg-tp-primary-500 px-3 text-[14px] font-semibold text-white disabled:opacity-50">新增</button>
            </div>
            {tagError && <p role="alert" className="mt-2 text-[12px] text-tp-warn-200">{tagError}</p>}
          </section>
          <dl>
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2 border-b border-tp-gray-100/60 py-3 text-[15px]">
                <dt className="text-tp-gray-600">{k}</dt>
                <dd className="text-right font-medium text-tp-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {isAuthor && <button
          type="button"
          onClick={onWithdraw}
          className="border-t border-tp-gray-100/70 py-4 text-[15px] text-tp-warn-200 hover:bg-tp-warn-200/10"
        >
          撤回問題
        </button>}
      </aside>
    </div>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-6 animate-in fade-in">
      <div
        role="alertdialog"
        aria-label={title}
        className="w-full max-w-sm rounded-2xl bg-tp-gray-50 p-5 shadow-xl animate-in zoom-in-95"
      >
        <h2 className="text-center text-[17px] leading-snug font-bold">{title}</h2>
        <p className="mt-2 text-center text-[15px] text-tp-gray-800">{body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-xl bg-tp-gray-100 py-3 text-[15px] font-medium text-tp-gray-900"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "min-h-12 rounded-xl py-3 text-[15px] font-bold text-white",
              danger ? "bg-tp-warn-200" : "bg-tp-primary-500",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
