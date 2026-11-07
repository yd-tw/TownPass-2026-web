"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type TouchEvent } from "react";
import { ArrowLeft, ArrowUp, Award, Check, ChevronRight, CircleHelp, ImagePlus, MapPin, Menu, MessageCircle, Mic, MoreHorizontal, Search, Send, Sparkles, Video, X } from "lucide-react";
import { DEMO_ASKER, DEMO_HELPER, initialForum, loadForum, saveForum, tagQuestion, type Attachment, type ForumState, type Reply, type Thread } from "./forum-data";

const CHANNEL = "townpass-forum-preview";
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

function uid() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function relativeTime(date: number) {
  const minutes = Math.max(1, Math.floor((Date.now() - date) / 60_000));
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}
function initials(name: string) { return name.slice(0, 1); }
function badgesFor(state: ForumState, authorId: string) {
  const count = state.threads.flatMap((thread) => thread.replies).filter((reply) => reply.authorId === authorId && reply.rewarded).length;
  return count >= 3 ? "城市之星" : count >= 1 ? "暖心解答" : null;
}

function Avatar({ name, size = "normal" }: { name: string; size?: "normal" | "large" }) {
  const colors = ["avatar-mint", "avatar-peach", "avatar-blue", "avatar-lilac"];
  const color = colors[Array.from(name).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % colors.length];
  return <span aria-hidden="true" className={`forum-avatar ${color} ${size === "large" ? "forum-avatar-large" : ""}`}>{initials(name)}</span>;
}

function Author({ id, badge }: { id: string; badge?: string | null }) {
  return <span className="forum-author">@{id}{badge && <span className="forum-badge" title={`獲得 ${badge} 徽章`}><Award size={12} strokeWidth={2.6} />{badge}</span>}</span>;
}

function MediaView({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const objectUrl = URL.createObjectURL(attachment.blob); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [attachment]);
  if (!url) return null;
  if (attachment.kind === "image") return <a className="forum-media" href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.name} /></a>;
  if (attachment.kind === "video") return <video className="forum-media" src={url} controls playsInline aria-label={attachment.name} />;
  return <audio className="forum-audio" src={url} controls aria-label={attachment.name} />;
}

export default function ForumApp() {
  const [forum, setForum] = useState<ForumState>({ threads: [] });
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<"asker" | "helper">("helper");
  const me = identity === "asker" ? DEMO_ASKER : DEMO_HELPER;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [nearby, setNearby] = useState(true);
  const [extraOpen, setExtraOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const forumRef = useRef(forum);
  const saveQueue = useRef(Promise.resolve());
  const threadEnd = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    loadForum().then((state) => { if (active) { forumRef.current = state; setForum(state); setReady(true); } }).catch(() => { if (active) { const state = initialForum(); forumRef.current = state; setForum(state); setReady(true); } });
    const next = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    channel.current = next;
    if (next) next.onmessage = (event: MessageEvent<ForumState>) => { if (event.data?.threads) { forumRef.current = event.data; setForum(event.data); } };
    if (new URLSearchParams(window.location.search).get("mode") === "ask") { setIdentity("asker"); setComposeOpen(true); }
    return () => { active = false; next?.close(); };
  }, []);

  useEffect(() => { if (selectedId) threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [selectedId, forum]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3200); return () => clearTimeout(timer); }, [toast]);

  const update = useCallback((change: (previous: ForumState) => ForumState) => {
    const next = change(forumRef.current);
    forumRef.current = next;
    setForum(next);
    channel.current?.postMessage(next);
    saveQueue.current = saveQueue.current.then(() => saveForum(next)).catch(() => setToast("儲存失敗，請檢查瀏覽器儲存空間"));
  }, []);

  const selected = forum.threads.find((thread) => thread.id === selectedId) ?? null;
  const sorted = [...forum.threads].sort((a, b) => (b.replies.at(-1)?.createdAt ?? b.createdAt) - (a.replies.at(-1)?.createdAt ?? a.createdAt));
  const visible = sorted.filter((thread) => {
    const query = search.trim().toLowerCase();
    return !query || [thread.question, ...thread.tags].join(" ").toLowerCase().includes(query);
  });
  const rewardCount = forum.threads.flatMap((thread) => thread.replies).filter((reply) => reply.authorId === me.id && reply.rewarded).length;

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text) return;
    const tags = tagQuestion(text);
    const thread: Thread = { id: uid(), authorId: me.id, author: me.name, question: text, ...tags, createdAt: Date.now(), notifyNearby: nearby, replies: [] };
    update((previous) => ({ threads: [thread, ...previous.threads] }));
    setComposeOpen(false); setQuestion(""); setExtraOpen(false); setNearby(true); setSelectedId(thread.id);
    setToast("已建立討論串，標籤目前由前端暫時產生");
  }

  function submitReply(event: FormEvent) {
    event.preventDefault();
    const text = replyText.trim();
    if (!selectedId || (!text && attachments.length === 0)) return;
    const reply: Reply = { id: uid(), authorId: me.id, author: me.name, text, createdAt: Date.now(), attachments, rewarded: false };
    update((previous) => ({ threads: previous.threads.map((thread) => thread.id === selectedId ? { ...thread, replies: [...thread.replies, reply] } : thread) }));
    setReplyText(""); setAttachments([]);
  }

  function reward(threadId: string, replyId: string) {
    update((previous) => ({ threads: previous.threads.map((thread) => thread.id === threadId ? { ...thread, replies: thread.replies.map((reply) => reply.id === replyId ? { ...reply, rewarded: !reply.rewarded } : reply) } : thread) }));
    setToast("已更新回答嘉許；徽章會顯示在回答者名稱旁");
  }

  function attachFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.some((file) => file.size > MAX_MEDIA_BYTES)) { setToast("單一附件請小於 30 MB"); event.target.value = ""; return; }
    const next = files.filter((file) => /^(image|audio|video)\//.test(file.type)).map((file): Attachment => ({ id: uid(), kind: file.type.split("/")[0] as Attachment["kind"], name: file.name, blob: file }));
    setAttachments((previous) => [...previous, ...next].slice(0, 5));
    event.target.value = "";
  }

  async function toggleRecording() {
    if (mediaRecorder.current?.state === "recording") { mediaRecorder.current.stop(); setRecording(false); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setToast("此瀏覽器無法錄音，請改用音訊檔案"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorder.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) setAttachments((previous) => [...previous, { id: uid(), kind: "audio" as const, name: "語音訊息", blob }].slice(0, 5));
        stream.getTracks().forEach((track) => track.stop());
        if (recordTimer.current) clearInterval(recordTimer.current);
        setRecordSeconds(0);
      };
      recorder.start(); setRecording(true); setRecordSeconds(0);
      recordTimer.current = setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000);
    } catch { setToast("無法取得麥克風權限"); }
  }

  function onTouchStart(event: TouchEvent) { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }
  function onTouchEnd(event: TouchEvent) {
    if (!touchStart.current || !selectedId) return;
    const dx = event.changedTouches[0].clientX - touchStart.current.x;
    const dy = event.changedTouches[0].clientY - touchStart.current.y;
    if (dx < -80 && Math.abs(dx) > Math.abs(dy) * 1.3) setSelectedId(null);
    touchStart.current = null;
  }

  if (!ready) return <main className="forum-shell forum-loading"><div className="forum-brand"><span className="forum-brand-mark"><MessageCircle size={18} fill="currentColor" /></span><span>城事互助<span className="forum-brand-dot">.</span></span></div><p>正在載入討論…</p></main>;

  return <main className="forum-shell">
    <div className="forum-frame">
      <div className="forum-appbar">
        <div className="forum-brand"><span className="forum-brand-mark"><MessageCircle size={18} fill="currentColor" /></span><span>城事互助<span className="forum-brand-dot">.</span></span></div>
        <div className="forum-appbar-actions"><button className="forum-search-toggle" type="button" aria-label="搜尋討論串" aria-expanded={searchOpen} onClick={() => { if (searchOpen) setSearch(""); else setSelectedId(null); setSearchOpen(!searchOpen); }}><Search size={20} /></button><button className="forum-account" type="button" onClick={() => setIdentity(identity === "asker" ? "helper" : "asker")} title="切換示範身分"><Avatar name={me.name} /><span>@{me.id}</span><span className="forum-account-switch">切換</span></button></div>
        {searchOpen && <div className="forum-search-popover"><Search size={18} /><input autoFocus aria-label="搜尋問題或標籤" placeholder="搜尋問題或標籤" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setSearch(""); setSearchOpen(false); } }} /><button type="button" aria-label="關閉搜尋" onClick={() => { setSearch(""); setSearchOpen(false); }}><X size={17} /></button></div>}
      </div>

      <div className="forum-content">
        <section className={`forum-feed ${selected ? "forum-hidden-mobile" : ""}`} aria-label="討論串列表">
          <button className="forum-question-prompt" type="button" onClick={() => setComposeOpen(true)} aria-label={`${me.name}，有什麼問題？點擊開始提問`}>
            <span className="forum-question-prompt-top"><Avatar name={me.name} /><strong>@{me.id}</strong></span>
            <span className="forum-question-prompt-text">有什麼問題？</span>
          </button>
          <div className="forum-thread-list">
            {visible.length ? visible.map((thread) => <button type="button" className={`forum-thread-card ${selectedId === thread.id ? "selected" : ""}`} onClick={() => setSelectedId(thread.id)} key={thread.id}>
              <div className="forum-thread-top"><Avatar name={thread.author} /><div className="forum-thread-byline"><Author id={thread.authorId} badge={badgesFor(forum, thread.authorId)} /><span className="forum-time">· {relativeTime(thread.createdAt)}</span></div><div className="forum-tags forum-thread-tags">{thread.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
              <p className="forum-thread-content">{thread.question}</p>
              <div className="forum-thread-footer"><span aria-label={`${thread.replies.length} 則留言`}><MessageCircle size={16} />{thread.replies.length}</span>{thread.notifyNearby && <span title="已開啟附近通知" aria-label="已開啟附近通知"><MapPin size={15} /></span>}</div>
            </button>) : <div className="forum-empty"><CircleHelp size={28} /><strong>目前沒有符合的討論</strong><span>試試其他搜尋詞，或提出第一個問題。</span></div>}
          </div>
        </section>

        <section className={`forum-room ${selected ? "forum-room-open" : ""}`} aria-label="即時討論聊天室" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {selected ? <>
            <div className="forum-room-header"><button className="forum-back" type="button" onClick={() => setSelectedId(null)} aria-label="返回討論串列表"><ArrowLeft size={21} /></button><div><span className="forum-room-label">討論串</span><h2>即時對話</h2></div><span className="forum-room-live"><span className="forum-live-pulse" /> 討論中</span></div>
            <div className="forum-room-scroll">
              <div className="forum-question-card"><div className="forum-question-meta"><Avatar name={selected.author} /><div className="forum-thread-byline"><Author id={selected.authorId} badge={badgesFor(forum, selected.authorId)} /><span className="forum-time">· {relativeTime(selected.createdAt)}</span></div><div className="forum-tags forum-thread-tags">{selected.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><p>{selected.question}</p></div>
              <div className="forum-room-divider"><span>討論開始</span></div>
              {selected.replies.length === 0 && <div className="forum-room-empty"><span>✦</span><strong>還沒有人回覆</strong><p>你的經驗可能正是提問者需要的答案。</p></div>}
              {selected.replies.map((reply) => {
                const own = reply.authorId === me.id;
                const canReward = selected.authorId === me.id && !own;
                return <div className={`forum-message ${own ? "forum-message-own" : ""}`} key={reply.id}><Avatar name={reply.author} /><div className="forum-message-body"><div className="forum-message-meta"><Author id={reply.authorId} badge={badgesFor(forum, reply.authorId)} /><span>{relativeTime(reply.createdAt)}</span></div><div className="forum-bubble">{reply.text && <p>{reply.text}</p>}{reply.attachments.map((attachment) => <MediaView attachment={attachment} key={attachment.id} />)}</div>{(canReward || reply.rewarded) && <button type="button" disabled={!canReward} onClick={() => reward(selected.id, reply.id)} className={`forum-reward ${reply.rewarded ? "is-rewarded" : ""}`}><Award size={15} fill={reply.rewarded ? "currentColor" : "none"} />{reply.rewarded ? "已嘉許 · 暖心回答" : "嘉許這則回答"}</button>}</div></div>;
              })}
              <div ref={threadEnd} />
            </div>
            <form className="forum-composer" onSubmit={submitReply}><div className="forum-composer-top"><span><span className="forum-live-pulse" /> 即時對話</span><span>左滑可返回話題列表</span></div>{attachments.length > 0 && <div className="forum-attachment-tray">{attachments.map((attachment) => <span key={attachment.id}>{attachment.kind === "image" ? <ImagePlus size={14} /> : attachment.kind === "video" ? <Video size={14} /> : <Mic size={14} />}{attachment.name}<button type="button" aria-label={`移除 ${attachment.name}`} onClick={() => setAttachments((items) => items.filter((item) => item.id !== attachment.id))}><X size={13} /></button></span>)}</div>}<div className="forum-compose-row"><button type="button" aria-label="加入圖片、語音或影片" onClick={() => fileInput.current?.click()}><ImagePlus size={21} /></button><button type="button" aria-label={recording ? "停止錄音" : "錄製語音"} className={recording ? "recording" : ""} onClick={toggleRecording}><Mic size={20} /></button><textarea rows={1} placeholder={recording ? `錄音中 ${recordSeconds} 秒…` : "輸入你的回答…"} value={replyText} onChange={(event) => setReplyText(event.target.value)} /><button type="submit" className="forum-send" disabled={!replyText.trim() && !attachments.length} aria-label="送出回答"><Send size={18} fill="currentColor" /></button></div><input ref={fileInput} className="forum-visually-hidden" type="file" accept="image/*,audio/*,video/*" multiple onChange={attachFiles} /></form>
          </> : <div className="forum-room-placeholder"><div className="forum-placeholder-art"><MessageCircle size={52} strokeWidth={1.3} /><span>✦</span></div><span className="forum-section-kicker">A BETTER CITY, TOGETHER</span><h2>每個問題，<br />都是對話的開始。</h2><p>從左側選擇一則話題，加入即時討論。<br />也可以提出你的問題，讓大家一起幫忙。</p><button type="button" onClick={() => setComposeOpen(true)}>開始提問 <ArrowUp size={16} /></button><div className="forum-placeholder-stat"><span><strong>{forum.threads.length}</strong> 則話題</span><span><strong>{forum.threads.reduce((sum, thread) => sum + thread.replies.length, 0)}</strong> 則回答</span><span><strong>{forum.threads.flatMap((thread) => thread.replies).filter((reply) => reply.rewarded).length}</strong> 個嘉許</span></div></div>}
        </section>
      </div>

      <nav className="forum-bottom-nav" aria-label="主要導覽"><button className={!selected ? "active" : ""} onClick={() => setSelectedId(null)}><Menu size={21} />討論</button><button onClick={() => setComposeOpen(true)}><span className="forum-nav-add">+</span>提問</button><button onClick={() => { setIdentity("helper"); setSelectedId(null); setToast(`你有 ${rewardCount} 個回答嘉許`); }}><Award size={21} />我的徽章</button></nav>
    </div>

    {composeOpen && <div className="forum-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false); }}><form className="forum-dialog" onSubmit={submitQuestion} role="dialog" aria-modal="true" aria-label="提出問題"><div className="forum-dialog-header"><div><span className="forum-section-kicker">ASK THE CITY</span><h2>提出你的問題</h2></div><button type="button" onClick={() => setComposeOpen(false)} aria-label="關閉"><X size={22} /></button></div><p className="forum-dialog-subtitle">用自己的話描述困擾，大家會一起找答案。</p><div className="forum-dialog-author"><Avatar name={me.name} /><span><strong>@{me.id}</strong><small>以目前使用者身分發布</small></span></div><textarea autoFocus maxLength={1000} placeholder="例如：剛搬來臺北，租屋補助要怎麼申請？" value={question} onChange={(event) => setQuestion(event.target.value)} /><div className="forum-dialog-hint"><Sparkles size={15} />發布後會自動加入標籤 <span>{question.length}/1000</span></div><button type="button" className="forum-extra-button" aria-expanded={extraOpen} onClick={() => setExtraOpen(!extraOpen)}><MoreHorizontal size={22} /><span>額外選項</span><ChevronRight size={17} className={extraOpen ? "rotated" : ""} /></button>{extraOpen && <div className="forum-extra-panel"><div className="forum-extra-icon"><MapPin size={20} /></div><div><strong>通知附近的使用者</strong><p>發布後將提供此問題的位置選項，讓附近的人更容易看見。此原型不會取得或傳送實際位置。</p></div><label className="forum-switch"><input type="checkbox" checked={nearby} onChange={(event) => setNearby(event.target.checked)} /><span /></label></div>}<button className="forum-dialog-submit" type="submit" disabled={!question.trim()}>發布問題 <ArrowUp size={17} /></button></form></div>}
    {toast && <div className="forum-toast" role="status"><Check size={16} />{toast}</div>}
  </main>;
}
