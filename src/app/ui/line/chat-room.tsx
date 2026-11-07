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
import { META } from "./api/mock-api";
import type { Answer, CategoryId, Media, QuestionDetail } from "./api/types";
import { Avatar, QuestionAvatar } from "./avatar";
import { categoryLabel } from "./categories";
import { IconButton, Sheet } from "./chat-list";
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
/** iPhone 錄影是 MOV，Android 多半是 MP4 */
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const VIDEO_MAX_BYTES = META.limits.video_max_bytes ?? 30 * 1024 * 1024;
const VIDEO_MAX_SECONDS = META.limits.video_max_seconds ?? 180;

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
  category: CategoryId;
  answers: Answer[];
  now: number;
  sending: boolean;
  onBack: () => void;
  onSend: (out: Outgoing) => Promise<boolean>;
  onResolve: () => Promise<void>;
  /** 志工幫未分類的問題選分類（PUT /questions/{id}/category） */
  onClassify: (category: CategoryId) => Promise<void>;
  onToggleLike: (answer: Answer) => Promise<void>;
  onDeleteAnswer: (answer: Answer) => void;
  onWithdraw: () => Promise<void>;
  notify: Notify;
  locationSharing: "off" | "approximate";
  onLocationSharingChange: (value: "off" | "approximate") => void;
};

/** 問題本文或一則回答 */
type Post = {
  key: string;
  answer: Answer | null;
  self: boolean;
  authorName: string;
  at: number;
  body: string | null;
  media: Media[];
  hiddenBody: boolean;
};

type Item =
  | { type: "date"; key: string; label: string }
  | { type: "note"; key: string; text: string }
  | { type: "post"; key: string; post: Post; first: boolean };

type Confirm = { kind: "withdraw" };

export function ChatRoom(props: ChatRoomProps) {
  const { question, answers, meId, now, sending, notify } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const recordVideoRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [menu, setMenu] = useState<{ post: Post; top: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [resolving, setResolving] = useState(false);
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [likingIds, setLikingIds] = useState<Set<string>>(() => new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const [draftOptionsOpen, setDraftOptionsOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const isAuthor = !question || question.author.id === meId;

  const label = categoryLabel(props.category);
  const othersAnswers = useMemo(
    () => answers.filter((a) => a.author.id !== meId),
    [answers, meId],
  );
  const othersCount = othersAnswers.length;
  const canResolve = !!question && isAuthor && question.status !== "resolved";
  /** 像 LINE 群組人數：自己＋回答過的人 */
  const members = 1 + new Set(othersAnswers.map((a) => a.author.id)).size;

  const posts = useMemo(() => {
    const out: Post[] = [];
    if (question) {
      out.push({
        key: "question",
        answer: null,
        self: question.author.id === meId,
        authorName: question.author.nickname,
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
        text: "請說說您想問什麼\n可以打字、拍照，或按麥克風錄音",
      });
    }
    let prev: Post | undefined;
    for (const p of posts) {
      const newDay = !prev || !isSameDay(prev.at, p.at);
      if (newDay) {
        out.push({ type: "date", key: `date-${p.key}`, label: formatDateDivider(p.at, now) });
      }
      if (p.key === "question") {
        out.push({
          type: "note",
          key: "asked-note",
          text:
            props.category === "uncategorized" || props.category === "other"
              ? `${question?.author.nickname ?? "有人"} 開了一個新問題`
              : `${question?.author.nickname ?? "有人"} 開了一個「${label}」的問題`,
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
  }, [posts, question, label, now, props.category]);

  // ---- 手機返回鍵：由上往下一層一層關 ----
  useBackLayer(true, props.onBack);
  useBackLayer(drawerOpen, () => setDrawerOpen(false));
  useBackLayer(recording, () => setRecording(false));
  useBackLayer(menu !== null, () => setMenu(null));
  useBackLayer(confirm !== null, () => setConfirm(null));
  useBackLayer(lightbox !== null, () => setLightbox(null));

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
  }, [lastKey, lastSelf, sending]);

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
  async function sendText() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (trimmed.length > META.limits.question_body_max_chars) {
      notify("字數太多了，請分幾次傳送", "error");
      return;
    }
    if (await props.onSend({ kind: "text", text: trimmed })) setText("");
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
    if (files.length > META.limits.media_per_post_max) {
      notify(`一次最多傳 ${META.limits.media_per_post_max} 張照片`, "error");
      return;
    }
    if (files.some((f) => !IMAGE_TYPES.includes(f.type))) {
      notify("照片格式要是 JPEG、PNG 或 WebP", "error");
      return;
    }
    if (files.some((f) => f.size > META.limits.image_max_bytes)) {
      notify("照片太大了，每張不能超過 10 MB", "error");
      return;
    }
    props.onSend({ kind: "images", files });
  }

  async function handlePickVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!VIDEO_TYPES.includes(file.type.split(";")[0])) {
      notify("影片格式要是 MP4、WebM 或 MOV", "error");
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      notify(`影片太大了，不能超過 ${Math.round(VIDEO_MAX_BYTES / 1024 / 1024)} MB，請錄短一點`, "error");
      return;
    }
    const duration = await readVideoDuration(file);
    if (duration && duration > VIDEO_MAX_SECONDS) {
      notify(`影片太長了，最長 ${Math.round(VIDEO_MAX_SECONDS / 60)} 分鐘，請錄短一點`, "error");
      return;
    }
    props.onSend({ kind: "video", file, duration });
  }

  async function resolve() {
    if (!canResolve || resolving) return;
    setResolving(true);
    try { await props.onResolve(); }
    finally { setResolving(false); }
  }

  async function toggleLike(answer: Answer) {
    if (likingIds.has(answer.id)) return;
    setLikingIds((previous) => new Set(previous).add(answer.id));
    try { await props.onToggleLike(answer); }
    finally {
      setLikingIds((previous) => {
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

  const banner = !question
    ? null
    : question.status === "resolved"
      ? { text: "這個問題已經解決了", className: "bg-tp-gray-500/15 text-tp-gray-700" }
      : !isAuthor
        ? { text: "加入討論，分享你的回答", className: "bg-tp-gray-100 text-tp-gray-700" }
        : null;

  const subtitle = !question
    ? "還沒送出"
    : question.status === "resolved"
      ? "已解決"
      : question.status === "in_progress"
        ? "協助中"
        : othersCount === 0
          ? "等待回答"
          : `${othersCount} 個回答`;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-20 flex flex-col animate-in duration-200 slide-in-from-right"
      style={{ background: CHAT_BG }}
      onTouchStart={(event) => { swipeStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
      onTouchEnd={(event) => {
        const start = swipeStart.current;
        swipeStart.current = null;
        if (!start || drawerOpen || recording || menu || confirm || lightbox) return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (dx < -85 && Math.abs(dx) > Math.abs(dy) * 1.4) props.onBack();
      }}
    >
        <header className="flex h-16 shrink-0 items-center gap-1 pr-1 pl-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1 text-[17px] leading-tight font-bold text-tp-gray-950">
              <span className="truncate">
                {question ? "討論串" : "新問題"}
              </span>
              {members > 1 && <span className="shrink-0 font-normal">({members})</span>}
            </h1>
            <p className="truncate text-[13px] text-tp-gray-700">{subtitle}</p>
          </div>
          {question && (
            <IconButton label="問題選單" onClick={() => setDrawerOpen(true)}>
              <Menu className="size-7" />
            </IconButton>
          )}
        </header>

      {question && !isAuthor && question.category === "uncategorized" && (
        <div className="mx-3 mb-2 flex shrink-0 items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-tp-gray-100">
          <Tag className="size-5 shrink-0 text-tp-primary-500" />
          <span className="min-w-0 flex-1 text-[15px] text-tp-gray-900">這題還沒有分類</span>
          <button
            type="button"
            onClick={() => setClassifyOpen(true)}
            className="min-h-10 shrink-0 rounded-full bg-tp-primary-500 px-4 text-[15px] font-bold text-white active:bg-tp-primary-600"
          >
            幫忙分類
          </button>
        </div>
      )}
      {classifyOpen && (
        <Sheet onClose={() => setClassifyOpen(false)}>
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-center text-[19px] font-bold">這題是關於什麼？</h2>
            <p className="mt-1 text-center text-[14px] text-tp-gray-700">選一個最接近的，選了之後就不能再改</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {/* 「未分類」不能選，送出會回 400 */}
              {META.categories
                .filter((c) => c.id !== "uncategorized")
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClassifyOpen(false);
                      props.onClassify(c.id);
                    }}
                    className="min-h-12 rounded-xl bg-white px-3 text-[16px] font-medium text-tp-gray-900 ring-1 ring-tp-gray-100 active:bg-tp-gray-100/50"
                  >
                    {c.label}
                  </button>
                ))}
            </div>
            <button
              type="button"
              onClick={() => setClassifyOpen(false)}
              className="mt-2 w-full py-3 text-[17px] text-tp-gray-700"
            >
              取消
            </button>
          </div>
        </Sheet>
      )}

      {banner && <p className={cn("flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 text-center text-[15px] font-medium", banner.className)}>
        {question?.status === "resolved" && <CircleCheckBig className="size-4" />}{banner.text}
      </p>}
      {canResolve && <button type="button" onClick={resolve} disabled={resolving} className="mx-3 mb-2 flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-tp-primary-50 px-3 text-[15px] font-semibold text-tp-primary-500 disabled:opacity-50">
        {resolving ? <LoaderCircle className="size-5 animate-spin" /> : <CircleCheckBig className="size-5" />}
        標記為已解決
      </button>}

      <div
        ref={listRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto px-3 pt-1 pb-3"
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
              onToggleLike={toggleLike}
              likeBusy={item.post.answer ? likingIds.has(item.post.answer.id) : false}
            />
          );
        })}
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
          className="absolute right-3 bottom-24 z-10 flex size-11 items-center justify-center rounded-full bg-tp-gray-50 text-tp-gray-800 shadow-md ring-1 ring-tp-gray-100"
        >
          <ChevronDown className="size-5" />
        </button>
      )}

      {recording ? (
        <VoiceRecorder
          maxSeconds={META.limits.audio_max_seconds}
          onCancel={() => setRecording(false)}
          onDone={(blob, duration) => {
            setRecording(false);
            props.onSend({ kind: "audio", blob, duration });
          }}
          onError={(message) => {
            setRecording(false);
            notify(message, "error");
          }}
        />
      ) : (
        <div className="relative shrink-0 border-t border-tp-gray-100 bg-tp-gray-50 px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
          {!question && <IconButton label="發問額外選項" onClick={() => { setAttachmentMenuOpen(false); setDraftOptionsOpen((open) => !open); }} className="max-[300px]:size-10"><MoreHorizontal className="size-6" /></IconButton>}
          <IconButton label="新增附件" disabled={sending} onClick={() => { setDraftOptionsOpen(false); setAttachmentMenuOpen((open) => !open); }} className="max-[300px]:size-10"><Plus className="size-7" /></IconButton>
          <div className="mx-1 flex min-h-12 min-w-0 flex-1 items-end rounded-[24px] bg-tp-gray-100/70 px-4 max-[300px]:px-2">
            <textarea
              rows={1}
              value={text}
              maxLength={META.limits.question_body_max_chars}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={question ? "補充說明…" : "請輸入您的問題…"}
              aria-label={question ? "補充說明" : "輸入問題"}
              className="field-sizing-content max-h-36 min-h-12 min-w-0 flex-1 resize-none bg-transparent py-3 text-[15px] leading-6 outline-none placeholder:text-tp-gray-600"
            />
          </div>
          {text.trim() ? (
            <IconButton
              label="傳送"
              className="text-tp-primary-500"
              disabled={sending}
              onClick={sendText}
            >
              {sending ? (
                <LoaderCircle className="size-7 animate-spin" />
              ) : (
                <SendHorizontal className="size-7" />
              )}
            </IconButton>
          ) : (
            <IconButton
              label="錄音"
              disabled={sending}
              onClick={() => setRecording(true)}
            >
              <Mic className="size-7" />
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
      <input ref={recordVideoRef} type="file" accept="video/*" capture="environment" hidden onChange={handlePickVideo} />
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

      {lightbox && <Lightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function PostRow({
  post,
  first,
  onMenu,
  onOpenImage,
  onToggleLike,
  likeBusy,
}: {
  post: Post;
  first: boolean;
  onMenu: (post: Post, el: HTMLElement) => void;
  onOpenImage: (url: string) => void;
  onToggleLike: (answer: Answer) => void;
  likeBusy: boolean;
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
  const like = answer && (
    <button
      type="button"
      aria-label={`${answer.votes.my_vote === 1 ? "取消讚" : "讚"}，目前 ${answer.votes.upvotes} 個讚`}
      aria-pressed={answer.votes.my_vote === 1}
      disabled={likeBusy}
      onClick={() => onToggleLike(answer)}
      className={cn(
        "flex min-h-8 items-center gap-1.5 justify-self-start rounded-full px-2 text-[13px] transition-colors disabled:opacity-50",
        answer.votes.my_vote === 1 ? "bg-tp-primary-50 font-semibold text-tp-primary-500" : "text-tp-gray-700 hover:bg-black/5",
      )}
    >
      <ThumbsUp className="size-4" fill={answer.votes.my_vote === 1 ? "currentColor" : "none"} />
      <span>{answer.votes.upvotes}</span>
    </button>
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
          <span className="col-start-1 row-start-1">{time}</span>
          <div className="col-start-2 row-start-1 min-w-0">{bubbles}</div>
          {like && <span className="col-start-2 row-start-2 mt-1">{like}</span>}
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
      <div className="w-9 shrink-0 max-[300px]:hidden">{first && <Avatar name={post.authorName} size={36} />}</div>
      <div className="flex min-w-0 flex-col items-start">
        {first && (
          <span className="mb-1 max-w-full truncate text-[13px] text-tp-gray-800">
            {post.authorName}
          </span>
        )}
        <div className="grid w-fit max-w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-x-1.5">
          <div className="col-start-1 row-start-1 min-w-0">{bubbles}</div>
          <span className="col-start-2 row-start-1">{time}</span>
          {like && <span className="col-start-1 row-start-2 mt-1">{like}</span>}
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
}: {
  question: QuestionDetail;
  answerCount: number;
  isAuthor: boolean;
  onClose: () => void;
  onWithdraw: () => void;
}) {
  const statusLabel =
    question.status === "resolved" ? "已解決" : question.status === "in_progress" ? "協助中" : "等待回答";
  const asked = new Date(question.created_at);
  const rows: [string, string][] = [
    ["分類", categoryLabel(question.category)],
    ["狀態", statusLabel],
    ["回答", `${answerCount} 則`],
    ["發問時間", `${asked.getMonth() + 1}/${asked.getDate()} ${formatClock(asked.getTime())}`],
  ];

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
        <dl className="flex-1 overflow-y-auto border-t border-tp-gray-100/70 px-5 py-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-tp-gray-100/60 py-3 text-[15px]">
              <dt className="text-tp-gray-600">{k}</dt>
              <dd className="font-medium text-tp-gray-900">{v}</dd>
            </div>
          ))}
        </dl>
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
