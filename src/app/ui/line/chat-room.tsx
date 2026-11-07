"use client";

import {
  Bell,
  BellOff,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleCheckBig,
  Copy,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  Mic,
  Pin,
  SendHorizontal,
  ChevronRight,
  Trash2,
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
import { IconButton } from "./chat-list";
import { formatClock, formatDateDivider, isSameDay } from "./format";
import { AudioBubble, ImageBubble, Lightbox, VoiceRecorder } from "./media";
import type { Notify, Outgoing, QuestionPrefs } from "./types";
import { useBackLayer } from "./use-back-layer";
import { useLongPress } from "./use-long-press";

const CHAT_BG = "#f0eee6";
/** 自己的泡泡：淺橘底配深色字（像 LINE 的淺綠底黑字），對比約 11:1 */
const SELF_BUBBLE = "var(--color-claude-peach)";
const GROUP_GAP = 5 * 60 * 1000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type ChatRoomProps = {
  meId: string;
  /** null 表示還沒送出的新問題 */
  question: QuestionDetail | null;
  category: CategoryId;
  answers: Answer[];
  prefs: QuestionPrefs | null;
  now: number;
  sending: boolean;
  unreadElsewhere: number;
  unreadMarkerKey: string | null;
  onBack: () => void;
  onSend: (out: Outgoing) => Promise<boolean>;
  /** 「問題解決了」：採納幫到忙的那個回答 */
  onAccept: (answer: Answer) => Promise<void>;
  onDeleteAnswer: (answer: Answer) => void;
  onWithdraw: () => Promise<void>;
  onToggleMute: () => void;
  onTogglePin: () => void;
  notify: Notify;
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
  | { type: "unread"; key: string }
  | { type: "post"; key: string; post: Post; first: boolean };

type Confirm =
  | { kind: "accept"; answer: Answer }
  | { kind: "withdraw" };

export function ChatRoom(props: ChatRoomProps) {
  const { question, answers, meId, now, sending, notify } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [menu, setMenu] = useState<{ post: Post; top: number } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** 「是誰的回答幫到您？」：開啟時記下聊天畫面上看得到哪些回答 */
  /** 選取模式：直接在聊天畫面上點「幫到我的那則回答」 */
  const [selecting, setSelecting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);

  const label = categoryLabel(props.category);
  const othersAnswers = useMemo(
    () => answers.filter((a) => a.author.id !== meId),
    [answers, meId],
  );
  const othersCount = othersAnswers.length;
  const canResolve =
    !!question &&
    question.status !== "resolved" &&
    !question.accepted_answer_id &&
    othersCount > 0;
  /** 像 LINE 群組人數：自己＋回答過的人 */
  const members = 1 + new Set(othersAnswers.map((a) => a.author.id)).size;

  const posts = useMemo(() => {
    const out: Post[] = [];
    if (question) {
      out.push({
        key: "question",
        answer: null,
        self: true,
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
            props.category === "other"
              ? "你開了一個新問題"
              : `你開了一個「${label}」的問題`,
        });
      }
      if (p.key === props.unreadMarkerKey) {
        out.push({ type: "unread", key: `unread-${p.key}` });
      }
      const first =
        newDay ||
        p.key === props.unreadMarkerKey ||
        !prev ||
        prev.self !== p.self ||
        prev.authorName !== p.authorName ||
        p.at - prev.at > GROUP_GAP;
      out.push({ type: "post", key: p.key, post: p, first });
      prev = p;
    }
    return out;
  }, [posts, question, label, now, props.unreadMarkerKey, props.category]);

  // ---- 手機返回鍵：由上往下一層一層關 ----
  useBackLayer(true, props.onBack);
  useBackLayer(drawerOpen, () => setDrawerOpen(false));
  useBackLayer(selecting, () => setSelecting(false));
  useBackLayer(recording, () => setRecording(false));
  useBackLayer(menu !== null, () => setMenu(null));
  useBackLayer(confirm !== null, () => setConfirm(null));
  useBackLayer(lightbox !== null, () => setLightbox(null));

  // ---- 捲動 ----
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const marker = list.querySelector("[data-unread-marker]");
    if (marker instanceof HTMLElement) {
      list.scrollTop = marker.offsetTop - 80;
      // 停在「以下為新回答」，不要被下面「捲到最底」的 effect 蓋掉
      nearBottomRef.current = false;
    } else {
      list.scrollTop = list.scrollHeight;
    }
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

  /**
   * 長輩按「問題解決了」時，幫到他的回答通常就在畫面上，
   * 所以不另外列清單，畫面停在原地，直接點那則回答（像 LINE 的選取訊息）。
   */
  function startSelecting() {
    setMenu(null);
    setSelecting(true);
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
      ? { text: "這個問題已經解決了", className: "bg-claude-green/15 text-claude-green" }
      : question.status === "in_progress"
        ? { text: "有人正在協助您", className: "bg-claude-blue/15 text-claude-blue" }
        : othersCount === 0
          ? { text: "已送出，正在等待熱心的人回答", className: "bg-claude-sand text-stone-600" }
          : { text: "收到回答了！問題解決了嗎？", className: "bg-claude/15 text-claude-dark" };

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
    >
      {selecting ? (
        <header className="flex h-16 shrink-0 items-center justify-center bg-claude-ink px-4 text-white">
          <p className="text-[19px] font-bold">請點一下幫到您的那則回答</p>
        </header>
      ) : (
        <header className="flex h-16 shrink-0 items-center gap-1 pr-1 pl-0.5">
          <button
            type="button"
            onClick={props.onBack}
            aria-label="返回聊天列表"
            className="flex h-12 min-w-12 shrink-0 items-center rounded-full pr-1.5 text-stone-900 hover:bg-black/5"
          >
            <ChevronLeft className="size-8" />
            {props.unreadElsewhere > 0 && (
              <span className="-ml-1 text-[17px] font-medium">
                {props.unreadElsewhere > 99 ? "99+" : props.unreadElsewhere}
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1 text-[18px] leading-tight font-bold text-stone-900">
              <span className="truncate">
                {question ? (question.title ?? "（內容待確認）") : "新問題"}
              </span>
              {members > 1 && <span className="shrink-0 font-normal">({members})</span>}
              {props.prefs?.muted && (
                <BellOff className="size-4 shrink-0" aria-label="已關閉提醒" />
              )}
            </h1>
            <p className="truncate text-[14px] text-stone-600">{subtitle}</p>
          </div>
          {question && (
            <IconButton label="問題選單" onClick={() => setDrawerOpen(true)}>
              <Menu className="size-7" />
            </IconButton>
          )}
        </header>
      )}

      {banner &&
        !selecting &&
        (canResolve ? (
          // 像 LINE 群組的公告列：點一下就能說「問題解決了」
          <button
            type="button"
            onClick={startSelecting}
            className={cn(
              "flex min-h-12 shrink-0 items-center justify-center gap-1 px-3 py-2 text-center text-[16px] font-medium",
              banner.className,
            )}
          >
            {banner.text}
            <span className="font-bold underline underline-offset-2">點這裡</span>
            <ChevronRight className="size-4" />
          </button>
        ) : (
          <p
            className={cn(
              "flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 text-center text-[15px] font-medium",
              banner.className,
            )}
          >
            {question?.status === "resolved" && <CircleCheckBig className="size-4" />}
            {banner.text}
          </p>
        ))}

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
                className={cn("my-3 flex justify-center", selecting && "opacity-35")}
              >
                <span className="rounded-full bg-claude-sand px-3 py-0.5 text-[13px] text-stone-700">
                  {item.label}
                </span>
              </div>
            );
          }
          if (item.type === "note") {
            return (
              <div
                key={item.key}
                className={cn("my-3 flex justify-center px-4", selecting && "opacity-35")}
              >
                <span className="rounded-2xl bg-claude-sand px-4 py-2.5 text-center text-[16px] leading-relaxed whitespace-pre-wrap text-stone-700">
                  {item.text}
                </span>
              </div>
            );
          }
          if (item.type === "unread") {
            return (
              <div
                key={item.key}
                data-unread-marker
                className={cn("my-3 flex justify-center", selecting && "opacity-35")}
              >
                <span className="rounded-full bg-claude/12 px-3 py-1 text-[13px] font-medium text-claude-dark">
                  以下為新回答
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
              selectMode={selecting}
              selected={
                confirm?.kind === "accept" && confirm.answer.id === item.key
              }
              onSelect={(a) => setConfirm({ kind: "accept", answer: a })}
            />
          );
        })}
        {sending && (
          <div className="mt-3 flex justify-end">
            <span className="flex items-center gap-1.5 rounded-full bg-claude/15 px-3 py-1.5 text-[14px] text-claude-dark">
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
          className="absolute right-3 bottom-24 z-10 flex size-11 items-center justify-center rounded-full bg-claude-ivory text-stone-700 shadow-md ring-1 ring-claude-sand"
        >
          <ChevronDown className="size-5" />
        </button>
      )}

      {selecting ? (
        <div className="shrink-0 border-t border-claude-sand bg-claude-ivory px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setSelecting(false)}
            className="w-full rounded-2xl bg-claude-sand py-3.5 text-lg font-medium text-stone-700 active:bg-stone-300"
          >
            取消
          </button>
        </div>
      ) : recording ? (
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
        <div className="flex shrink-0 items-end gap-0.5 border-t border-claude-sand bg-claude-ivory px-1.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <IconButton
            label="拍照"
            disabled={sending}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="size-7" />
          </IconButton>
          <IconButton
            label="從相簿選照片"
            disabled={sending}
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon className="size-7" />
          </IconButton>
          <div className="mx-1 flex min-h-12 flex-1 items-end rounded-[24px] bg-claude-sand/70 px-4">
            <textarea
              rows={1}
              value={text}
              maxLength={META.limits.question_body_max_chars}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={question ? "補充說明…" : "請輸入您的問題…"}
              aria-label={question ? "補充說明" : "輸入問題"}
              className="field-sizing-content max-h-36 min-h-12 min-w-0 flex-1 resize-none bg-transparent py-3 text-[17px] leading-6 outline-none placeholder:text-stone-500"
            />
          </div>
          {text.trim() ? (
            <IconButton
              label="傳送"
              className="text-claude-dark"
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
          prefs={props.prefs}
          answerCount={othersCount}
          canResolve={canResolve}
          onResolve={() => {
            setDrawerOpen(false);
            startSelecting();
          }}
          onClose={() => setDrawerOpen(false)}
          onToggleMute={props.onToggleMute}
          onTogglePin={props.onTogglePin}
          onWithdraw={() => setConfirm({ kind: "withdraw" })}
        />
      )}

      {confirm?.kind === "accept" && (
        <ConfirmDialog
          title={`是「${confirm.answer.author.nickname}」這則回答幫到您嗎？`}
          quote={
            confirm.answer.body ??
            (confirm.answer.media.some((m) => m.kind === "audio")
              ? "（語音訊息）"
              : "（照片）")
          }
          body="確定後，這個問題會標示為「已解決」，之後不能更改。"
          confirmLabel="是，解決了"
          // 按取消會留在選取模式，可以改點別則
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            setSelecting(false);
            await props.onAccept(confirm.answer);
          }}
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
  selectMode,
  selected,
  onSelect,
}: {
  post: Post;
  first: boolean;
  onMenu: (post: Post, el: HTMLElement) => void;
  onOpenImage: (url: string) => void;
  selectMode: boolean;
  selected: boolean;
  onSelect: (answer: Answer) => void;
}) {
  const press = useLongPress((el) => onMenu(post, el));
  const accepted = post.answer?.is_accepted === true;
  const answer = post.answer;
  const selectable = selectMode && answer !== null && !post.self;

  const bubbles = (
    <div
      {...(selectMode ? {} : press)}
      className={cn(
        "flex min-w-0 flex-col gap-1 select-none [-webkit-touch-callout:none]",
        post.self ? "items-end" : "items-start",
      )}
    >
      {(post.body !== null || post.hiddenBody) && (
        <TextBubble
          self={post.self}
          tail={first}
          accepted={accepted}
        >
          {post.hiddenBody ? (
            <span className="text-stone-400 italic">內容待確認個資，暫時隱藏</span>
          ) : (
            post.body
          )}
        </TextBubble>
      )}
      {post.media.map((m) =>
        m.kind === "image" ? (
          <ImageBubble key={m.id} media={m} onOpen={onOpenImage} />
        ) : (
          <AudioBubble key={m.id} media={m} self={post.self} />
        ),
      )}
    </div>
  );
  const time = (
    <span className="shrink-0 pb-0.5 text-[12px] leading-tight text-stone-500">
      {formatClock(post.at)}
    </span>
  );

  if (post.self) {
    return (
      <div
        data-key={post.key}
        className={cn(
          "flex items-end justify-end gap-1.5 pl-12",
          first ? "mt-3" : "mt-1",
          // 選取模式時自己的訊息不能選，變淡
          selectMode && "pointer-events-none opacity-35",
        )}
      >
        {time}
        {bubbles}
      </div>
    );
  }

  return (
    <div
      data-key={post.key}
      className={cn(
        "relative flex items-start gap-2 pr-8",
        first ? "mt-3" : "mt-1.5",
        selectMode && !selectable && "pointer-events-none opacity-35",
      )}
    >
      {selectable && (
        <>
          {/* 整列都能點，長輩不用瞄準泡泡 */}
          <button
            type="button"
            onClick={() => onSelect(answer)}
            aria-label={`選擇「${post.authorName}」的這則回答`}
            className="absolute inset-0 z-10 rounded-2xl active:bg-black/5"
          />
          <span
            aria-hidden
            className={cn(
              "flex size-7 shrink-0 items-center justify-center self-center rounded-full border-2",
              selected ? "border-claude bg-claude text-white" : "border-stone-300 bg-white",
            )}
          >
            {selected && <Check className="size-4" strokeWidth={3} />}
          </span>
        </>
      )}
      <div className="w-9 shrink-0">{first && <Avatar name={post.authorName} size={36} />}</div>
      <div className="flex min-w-0 flex-col items-start">
        {first && (
          <span className="mb-1 max-w-full truncate text-[14px] text-stone-700">
            {post.authorName}
          </span>
        )}
        <div className="flex max-w-full items-end gap-1.5">
          {bubbles}
          {time}
        </div>
        {accepted && (
          <span className="mt-1 flex items-center gap-1 text-[14px] font-medium text-claude-green">
            <CircleCheckBig className="size-4" />
            解決了我的問題
          </span>
        )}
      </div>
    </div>
  );
}

function TextBubble({
  self,
  tail,
  accepted,
  children,
}: {
  self: boolean;
  tail: boolean;
  accepted: boolean;
  children: ReactNode;
}) {
  const color = self ? SELF_BUBBLE : "#ffffff";
  return (
    <div
      className={cn(
        "relative rounded-[18px] px-3.5 py-2.5 text-[17px] leading-snug wrap-break-word whitespace-pre-wrap text-claude-ink",
        !self && "shadow-[0_1px_1px_rgb(20_20_19/0.06)]",
        tail && (self ? "rounded-tr-[4px]" : "rounded-tl-[4px]"),
        accepted && "ring-2 ring-claude-green",
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
  if (a && post.self && !a.is_accepted) {
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
        className="absolute left-1/2 flex -translate-x-1/2 gap-1 rounded-2xl bg-claude-ivory p-1.5 shadow-xl ring-1 ring-black/5 animate-in zoom-in-95 fade-in"
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
            className="flex w-18 flex-col items-center gap-1 rounded-xl py-2.5 text-[15px] text-stone-800 hover:bg-claude-sand/60"
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
  prefs,
  answerCount,
  canResolve,
  onResolve,
  onClose,
  onToggleMute,
  onTogglePin,
  onWithdraw,
}: {
  question: QuestionDetail;
  prefs: QuestionPrefs | null;
  answerCount: number;
  canResolve: boolean;
  onResolve: () => void;
  onClose: () => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
  onWithdraw: () => void;
}) {
  const muted = prefs?.muted ?? false;
  const pinned = prefs?.pinned ?? false;
  const quick: { label: string; icon: LucideIcon; run: () => void }[] = [
    { label: muted ? "開啟提醒" : "關閉提醒", icon: muted ? BellOff : Bell, run: onToggleMute },
    { label: pinned ? "取消釘選" : "釘選", icon: Pin, run: onTogglePin },
  ];
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
      <aside className="absolute inset-y-0 right-0 flex w-[84%] flex-col bg-claude-ivory shadow-2xl animate-in duration-200 slide-in-from-right">
        <div className="flex justify-end p-2">
          <IconButton label="關閉" onClick={onClose}>
            <X className="size-7" />
          </IconButton>
        </div>
        <div className="flex flex-col items-center px-5 pb-4">
          <QuestionAvatar q={question} size={72} />
          <p className="mt-3 text-center text-lg leading-snug font-bold">
            {question.title ?? "（內容待確認）"}
          </p>
        </div>
        <div className="grid grid-cols-2 border-y border-claude-sand/70 py-3">
          {quick.map(({ label, icon: Icon, run }) => (
            <button
              key={label}
              type="button"
              onClick={run}
              className="flex min-h-16 flex-col items-center justify-center gap-1 text-[15px] text-stone-700"
            >
              <Icon className="size-7 text-stone-800" />
              {label}
            </button>
          ))}
        </div>
        {question.status !== "resolved" && (
          <div className="px-5 pt-4">
            <button
              type="button"
              onClick={onResolve}
              disabled={!canResolve}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-claude py-3.5 text-lg font-bold text-white disabled:bg-claude-sand disabled:text-stone-400"
            >
              <CircleCheckBig className="size-5" />
              問題解決了
            </button>
            {!canResolve && (
              <p className="mt-1.5 text-center text-[14px] text-stone-500">
                還沒有人回答，有人回答後就可以按
              </p>
            )}
          </div>
        )}
        <dl className="flex-1 overflow-y-auto px-5 py-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-claude-sand/60 py-3 text-[16px]">
              <dt className="text-stone-500">{k}</dt>
              <dd className="font-medium text-claude-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          onClick={onWithdraw}
          className="border-t border-claude-sand/70 py-4 text-[17px] text-red-600 hover:bg-red-50"
        >
          撤回問題
        </button>
      </aside>
    </div>
  );
}

function ConfirmDialog({
  title,
  quote,
  body,
  confirmLabel,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  /** 引用的內容，例如被選中的那則回答 */
  quote?: string;
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
        className="w-full max-w-sm rounded-2xl bg-claude-ivory p-5 shadow-xl animate-in zoom-in-95"
      >
        <h2 className="text-center text-[19px] leading-snug font-bold">{title}</h2>
        {quote && (
          <p className="mt-3 line-clamp-4 rounded-xl bg-white px-3 py-2 text-[17px] text-claude-ink ring-1 ring-claude-sand">
            {quote}
          </p>
        )}
        <p className="mt-2 text-center text-[16px] text-stone-700">{body}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-12 rounded-xl bg-claude-sand py-3 text-[17px] font-medium text-stone-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "min-h-12 rounded-xl py-3 text-[17px] font-bold text-white",
              danger ? "bg-red-600" : "bg-claude-dark",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
