import type { CategoryId } from "@/app/ui/line/api/types";
import { categoryLabel } from "@/app/ui/line/categories";
import {
  ApiError,
  PII_PENDING_MESSAGE,
  type AdminApi,
  type AdminUser,
  type Answer,
  type AuditEntry,
  type CacheEntry,
  type PageAnalytics,
  type PageStat,
  type PiiReport,
  type QuestionContext,
  type QuestionDetail,
  type QuestionSummary,
} from "./api";

/*
 * 示範模式（/admin?demo=mock）：資料只存在這個分頁，重新整理就會重置。
 * 不需要管理員 ID，也不會碰到正式後端，方便展示和測試介面。
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function wait(ms = 250) {
  return new Promise((r) => setTimeout(r, ms));
}

function clone<T>(v: T): T {
  return structuredClone(v);
}

let seq = 0;
const makeId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function user(
  id: string,
  nickname: string,
  extra: Partial<AdminUser> = {},
): AdminUser {
  return {
    id,
    nickname,
    points: 0,
    role: "user",
    languages: ["zh-TW"],
    nearby_notifications_enabled: true,
    nearby_radius_m: 1000,
    location_sharing: "approximate",
    townpass_user_id: `tp-${id}`,
    trust_score: 50,
    banned_at: null,
    ban_reason: null,
    created_at: new Date(Date.now() - 30 * DAY).toISOString(),
    ...extra,
  };
}

const SERVICES: Record<string, { name: string; pages: [string, string][] }> = {
  "townpass-app": {
    name: "城市通",
    pages: [
      ["/home", "首頁"],
      ["/setting/account", "個人帳號"],
      ["/card/easycard", "悠遊卡綁定"],
    ],
  },
  "parking": { name: "停車繳費", pages: [["/parking/pay", "停車費繳納"], ["/parking/record", "繳費紀錄"]] },
  "library": { name: "圖書館", pages: [["/library/borrow", "借閱紀錄"]] },
  "tax": { name: "地方稅", pages: [["/tax/house", "房屋稅查詢"]] },
};

function ctx(service: string, page: number, extra: Record<string, unknown> = {}): QuestionContext {
  const s = SERVICES[service];
  const [route, title] = s.pages[page];
  return {
    service_id: service,
    service_name: s.name,
    page_route: route,
    page_title: title,
    extra: {
      appVersion: "3.4.0",
      platform: "android",
      deviceModel: "Pixel 7",
      routeHistory: ["/home", route],
      ...extra,
    },
  };
}

const PREVIEW_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'><rect width='400' height='260' fill='#e3e7e9'/><rect x='30' y='30' width='340' height='200' rx='12' fill='#fff'/><text x='50' y='80' font-size='18' fill='#30383d'>繳費通知單</text><text x='50' y='120' font-size='14' fill='#475259'>姓名：王小明</text><text x='50' y='150' font-size='14' fill='#475259'>電話：0912-345-678</text><text x='50' y='190' font-size='14' fill='#475259'>應繳金額：NT$ 1,280</text></svg>",
)}`;

export function createMockAdminApi(): AdminApi {
  const now = Date.now();
  const iso = (ago: number) => new Date(now - ago).toISOString();

  const me = user("admin-1", "管理員小陳", { role: "admin", trust_score: 100, points: 0 });
  const users: AdminUser[] = [
    me,
    user("u-1", "美玉阿嬤", { points: 0, trust_score: 48 }),
    user("u-2", "李警官（志工）", { points: 340, trust_score: 92 }),
    user("u-3", "林同學", { points: 120, trust_score: 76 }),
    user("u-4", "阿德", { points: 60, trust_score: 64 }),
    user("u-5", "王伯伯", { points: 0, trust_score: 40 }),
    user("u-6", "亂發廣告的帳號", { points: 0, trust_score: 3, banned_at: iso(2 * DAY), ban_reason: "連續張貼廣告" }),
    user("bot-1", "城市通小幫手", { role: "bot", trust_score: 80 }),
    user("u-7", "陳媽媽", { points: 10, trust_score: 55 }),
  ];
  const byId = (id: string) => users.find((u) => u.id === id)!;
  const pub = (id: string) => {
    const u = byId(id);
    return { id: u.id, nickname: u.nickname, points: u.points, role: u.role };
  };

  type Seed = {
    author: string;
    title: string;
    body: string;
    category: CategoryId;
    status: QuestionDetail["status"];
    ago: number;
    context: QuestionContext | null;
    tags?: string[];
    answers?: [string, string, number][];
    hiddenBody?: boolean;
  };
  const seeds: Seed[] = [
    { author: "u-1", title: "悠遊卡綁定一直失敗", body: "我照著步驟按，最後都跳出「綁定失敗」，是不是卡片壞了？", category: "app_usage", status: "open", ago: 2 * HOUR, context: ctx("townpass-app", 2), tags: ["悠遊卡"] },
    { author: "u-5", title: "悠遊卡綁定要輸入什麼號碼", body: "卡片背面有兩組號碼，不知道要輸入哪一個", category: "app_usage", status: "resolved", ago: 26 * HOUR, context: ctx("townpass-app", 2), tags: ["悠遊卡"], answers: [["u-3", "輸入背面右下角那組 16 碼的就可以了", 25 * HOUR]] },
    { author: "u-7", title: "綁定悠遊卡後餘額沒顯示", body: "綁好了但是餘額一直是 0", category: "app_usage", status: "in_progress", ago: 3 * DAY, context: ctx("townpass-app", 2), answers: [["u-2", "餘額要等下次刷卡後才會同步喔", 3 * DAY - HOUR]] },
    { author: "u-4", title: "悠遊卡掛失要去哪裡", body: "卡片不見了，城市通裡面可以掛失嗎？", category: "app_usage", status: "open", ago: 5 * DAY, context: ctx("townpass-app", 2) },
    { author: "u-1", title: "停車費繳了還收到催繳", body: "上週在城市通繳了停車費，今天又收到催繳單，是不是被扣兩次？", category: "admin_procedure", status: "open", ago: 5 * HOUR, context: ctx("parking", 0), tags: ["停車費"] },
    { author: "u-5", title: "停車費可以用信用卡嗎", body: "繳費頁面只看到行動支付", category: "admin_procedure", status: "resolved", ago: 4 * DAY, context: ctx("parking", 0), answers: [["u-2", "可以，要先在支付方式加入信用卡", 4 * DAY - 2 * HOUR]] },
    { author: "u-7", title: "繳費紀錄找不到上個月的", body: "只看得到這個月的紀錄", category: "app_usage", status: "open", ago: 6 * DAY, context: ctx("parking", 1) },
    { author: "u-1", title: "有人打電話說要幫我解除分期", body: "對方說是銀行，要我去 ATM 操作，這是真的嗎？", category: "scam_check", status: "resolved", ago: 1 * DAY, context: null, tags: ["詐騙", "ATM"], answers: [["u-2", "這是詐騙！銀行不會叫您去 ATM 解除設定，請撥 165。", 23 * HOUR], ["bot-1", "（語意快取）ATM 沒有「解除分期」功能，請撥打 165 反詐騙專線確認。", 23 * HOUR]] },
    { author: "u-4", title: "房屋稅單上的地址不對", body: "去年搬家了，稅單還寄到舊地址", category: "admin_procedure", status: "open", ago: 2 * DAY, context: ctx("tax", 0), hiddenBody: true },
    { author: "u-5", title: "我兒子幫我裝的東西一直跳出來", body: "手機一直跳通知，不知道要按哪裡", category: "uncategorized", status: "open", ago: 40 * 60 * 1000, context: ctx("townpass-app", 0) },
    { author: "u-7", title: "這個要怎麼弄", body: "看不太懂", category: "uncategorized", status: "open", ago: 3 * HOUR, context: null },
    { author: "u-1", title: "借的書可以續借嗎", body: "到期日快到了", category: "other", status: "open", ago: 8 * DAY, context: ctx("library", 0), tags: ["圖書館"] },
    { author: "u-4", title: "個人帳號的手機號碼要怎麼改", body: "換號碼了", category: "app_usage", status: "open", ago: 9 * DAY, context: ctx("townpass-app", 1) },
    { author: "u-6", title: "超便宜代購", body: "加我 LINE 立即賺錢", category: "other", status: "open", ago: 2 * DAY + HOUR, context: null },
  ];

  const questions: QuestionDetail[] = [];
  const answers: Record<string, Answer[]> = {};
  for (const s of seeds) {
    const id = makeId("q");
    const list: Answer[] = (s.answers ?? []).map(([author, body, ago]) => ({
      id: makeId("a"),
      question_id: id,
      author: pub(author),
      body,
      media: [],
      is_accepted: false,
      cached_from: author.startsWith("bot") ? { question_id: "q-older", answer_id: "a-older" } : null,
      votes: { upvotes: Math.floor(Math.random() * 6), my_vote: null },
      hidden_parts: [],
      created_at: iso(ago),
    }));
    answers[id] = list;
    questions.push({
      id,
      status: s.status,
      title: s.title,
      category: s.category,
      // 規格：tags 第一個是固定標籤，後面是手動標籤
      system_tag: categoryLabel(s.category),
      tags: [categoryLabel(s.category), ...(s.tags ?? [])],
      language: "zh-TW",
      author: pub(s.author),
      context: s.context,
      answer_count: list.length,
      // 管理員看得到待確認的隱藏內容；hidden_parts 仍標示哪些對一般人隱藏
      hidden_parts: s.hiddenBody ? [{ part: "body", reason: "pii_pending" }] : [],
      created_at: iso(s.ago),
      body: s.body,
      media: [],
      accepted_answer_id: null,
    });
  }
  const findQ = (id: string) => {
    const q = questions.find((x) => x.id === id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "找不到這個問題");
    return q;
  };
  const findA = (id: string) => {
    for (const list of Object.values(answers)) {
      const a = list.find((x) => x.id === id);
      if (a) return { a, list };
    }
    throw new ApiError(404, "NOT_FOUND", "找不到這則回答");
  };

  const taxQ = questions.find((q) => q.title === "房屋稅單上的地址不對")!;
  const scamQ = questions.find((q) => q.title === "停車費繳了還收到催繳")!;
  const pii: PiiReport[] = [
    {
      id: makeId("pii"),
      status: "pending",
      target_type: "question",
      target_id: taxQ.id,
      question_id: taxQ.id,
      text_field: "body",
      text_ranges: [{ start: 3, end: 16 }],
      original_text: "我住在信義路五段 7 號 3 樓，去年搬家了，稅單還寄到舊地址",
      preview_url: null,
      created_at: iso(2 * DAY - HOUR),
    },
    {
      id: makeId("pii"),
      status: "pending",
      target_type: "question",
      target_id: scamQ.id,
      question_id: scamQ.id,
      media_id: "m-1",
      regions: [{ x: 0.1, y: 0.4, w: 0.45, h: 0.12 }, { x: 0.1, y: 0.52, w: 0.55, h: 0.12 }],
      preview_url: PREVIEW_SVG,
      created_at: iso(4 * HOUR),
    },
    {
      id: makeId("pii"),
      status: "accepted",
      target_type: "question",
      target_id: questions[0].id,
      question_id: questions[0].id,
      text_field: "body",
      text_ranges: [{ start: 2, end: 6 }],
      created_at: iso(3 * DAY),
      resolved_at: iso(3 * DAY - HOUR),
    },
  ];

  const audit: AuditEntry[] = [
    {
      id: makeId("log"),
      admin: pub(me.id),
      action: "user.ban",
      target_type: "user",
      target_id: "u-6",
      detail: { reason: "連續張貼廣告" },
      created_at: iso(2 * DAY),
    },
    {
      id: makeId("log"),
      admin: pub(me.id),
      action: "question.delete",
      target_type: "question",
      target_id: "q-deleted-1",
      detail: { title: "免費領取口罩", body: "點這個連結填資料就送（連結已移除）", author: { id: "u-6", nickname: "亂發廣告的帳號" } },
      created_at: iso(2 * DAY + 5 * 60 * 1000),
    },
  ];
  function log(action: string, target_type: AuditEntry["target_type"], target_id: string, detail: Record<string, unknown>) {
    audit.unshift({ id: makeId("log"), admin: pub(me.id), action, target_type, target_id, detail, created_at: new Date().toISOString() });
  }

  const cache: CacheEntry[] = [
    { source_answer_id: "a-c1", source_question_id: "q-c1", question_title: "接到電話說要解除分期", answer_body: "ATM 沒有「解除分期」功能，請撥打 165 反詐騙專線確認。", score: 5, positive_count: 6, negative_count: 1, reply_count: 31, blocked: false, updated_at: iso(3 * HOUR) },
    { source_answer_id: "a-c2", source_question_id: "q-c2", question_title: "悠遊卡綁定要輸入什麼號碼", answer_body: "輸入背面右下角那組 16 碼的就可以了", score: 1, positive_count: 3, negative_count: 2, reply_count: 12, blocked: false, updated_at: iso(DAY) },
    { source_answer_id: "a-c3", source_question_id: "q-c3", question_title: "停車費可以用信用卡嗎", answer_body: "可以，要先在支付方式加入信用卡", score: -2, positive_count: 1, negative_count: 3, reply_count: 9, blocked: false, updated_at: iso(2 * DAY) },
    { source_answer_id: "a-c4", source_question_id: "q-c4", question_title: null, answer_body: null, score: -3, positive_count: 0, negative_count: 4, reply_count: 15, blocked: true, updated_at: iso(4 * DAY) },
  ];

  const summary = (q: QuestionDetail): QuestionSummary => clone(q);
  const alive = (id: string) => questions.some((q) => q.id === id);
  function hasPendingTextPii(targetId: string) {
    return pii.some((p) => p.status === "pending" && p.target_id === targetId && p.text_field);
  }

  return {
    demo: true,
    me,

    async pageAnalytics(f) {
      await wait();
      const since = f.since ? Date.parse(f.since) : -Infinity;
      const until = f.until ? Date.parse(f.until) : Infinity;
      const inRange = questions.filter((q) => {
        const t = Date.parse(q.created_at);
        return t >= since && t <= until && (!f.service_id || q.context?.service_id === f.service_id);
      });
      const map = new Map<string, PageStat>();
      for (const q of inRange) {
        if (!q.context?.page_route) continue;
        const key = `${q.context.service_id} ${q.context.page_route}`;
        const s = map.get(key) ?? {
          service_id: q.context.service_id,
          service_name: q.context.service_name,
          page_route: q.context.page_route,
          page_title: q.context.page_title ?? null,
          question_count: 0,
          open_count: 0,
          in_progress_count: 0,
          resolved_count: 0,
          unanswered_count: 0,
          categories: [],
          last_asked_at: q.created_at,
        };
        s.question_count++;
        if (q.status === "open") s.open_count++;
        else if (q.status === "in_progress") s.in_progress_count++;
        else s.resolved_count++;
        if ((answers[q.id] ?? []).length === 0) s.unanswered_count++;
        const category = q.category ?? "uncategorized";
        const c = s.categories.find((x) => x.category === category);
        if (c) c.count++;
        else s.categories.push({ category, count: 1 });
        if (q.created_at > s.last_asked_at) s.last_asked_at = q.created_at;
        map.set(key, s);
      }
      const pages = [...map.values()]
        .map((p) => ({ ...p, categories: p.categories.sort((a, b) => b.count - a.count) }))
        .sort((a, b) => b.question_count - a.question_count);
      const withPage = inRange.filter((q) => q.context?.page_route).length;
      const result: PageAnalytics = {
        total_questions: inRange.length,
        questions_with_page: withPage,
        questions_without_page: inRange.length - withPage,
        pages,
      };
      return result;
    },

    async listQuestions(f) {
      await wait();
      const tq = f.tag_q?.trim().toLowerCase();
      const items = questions
        .filter((q) => (!f.status || q.status === f.status) && (!f.category || q.category === f.category) && (!f.language || q.language === f.language) && (!f.service_id || q.context?.service_id === f.service_id))
        .filter((q) => !tq || q.tags.some((t) => t.toLowerCase().includes(tq)))  // 固定標籤和手動標籤都會被搜尋到
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(summary);
      return { items, next: null };
    },

    async getQuestion(id) {
      await wait(150);
      return clone(findQ(id));
    },

    async listAnswers(id) {
      await wait(150);
      findQ(id);
      return clone(answers[id] ?? []);
    },

    async editQuestion(id, patch) {
      await wait();
      const q = findQ(id);
      if (hasPendingTextPii(id)) throw new ApiError(409, "PII_PENDING", PII_PENDING_MESSAGE);
      const before = { title: q.title, body: q.body };
      if (patch.title !== undefined) q.title = patch.title;
      if (patch.body !== undefined) q.body = patch.body;
      log("question.edit", "question", id, { before, after: { title: q.title, body: q.body } });
      return clone(q);
    },

    async editAnswer(id, body) {
      await wait();
      const { a } = findA(id);
      if (hasPendingTextPii(id)) throw new ApiError(409, "PII_PENDING", PII_PENDING_MESSAGE);
      log("answer.edit", "answer", id, { before: { body: a.body }, after: { body } });
      a.body = body;
      return clone(a);
    },

    async deleteQuestion(id) {
      await wait();
      const q = findQ(id);
      questions.splice(questions.indexOf(q), 1);
      log("question.delete", "question", id, { title: q.title, body: q.body, author: q.author });
      delete answers[id];
    },

    async deleteAnswer(id) {
      await wait();
      const { a, list } = findA(id);
      list.splice(list.indexOf(a), 1);
      const q = questions.find((x) => x.id === a.question_id);
      if (q) q.answer_count = list.length;
      log("answer.delete", "answer", id, { body: a.body, author: a.author, question_id: a.question_id });
    },

    async setCategory(id, category) {
      await wait();
      const q = findQ(id);
      log("question.category", "question", id, { before: q.system_tag, after: categoryLabel(category) });
      q.category = category;
      q.system_tag = categoryLabel(category);
      q.tags = [q.system_tag, ...q.tags.slice(1)];
      return clone(q);
    },

    async setTags(id, tags) {
      await wait();
      const q = findQ(id);
      // 傳入完整的手動標籤清單；送了固定標籤也會被略過
      const clean = [...new Set(tags.map((t) => t.replace(/^#/, "").trim()).filter((t) => t && t !== q.system_tag))];
      if (clean.length > 5) throw new ApiError(400, "VALIDATION_ERROR", "手動標籤最多 5 個");
      if (clean.some((t) => t.length > 20)) throw new ApiError(400, "VALIDATION_ERROR", "每個標籤最多 20 字");
      log("question.tags", "question", id, { before: q.tags.slice(1), after: clean });
      q.tags = [q.system_tag, ...clean];
      return clone(q);
    },

    async resolve(id) {
      await wait();
      const q = findQ(id);
      if (q.status === "resolved") throw new ApiError(409, "INVALID_STATE", "這個問題已經解決了");
      q.status = "resolved";
      log("question.resolve", "question", id, {});
      return clone(q);
    },

    async listPiiReports(status) {
      await wait();
      return { items: clone(pii.filter((p) => (!status || p.status === status) && alive(p.question_id))), next: null };
    },

    async acceptPii(id) {
      await wait();
      const p = pii.find((x) => x.id === id);
      if (!p) throw new ApiError(404, "NOT_FOUND", "找不到這個標記");
      if (p.status !== "pending") throw new ApiError(409, "INVALID_STATE", "這個標記已經處理過了");
      p.status = "accepted";
      p.resolved_at = new Date().toISOString();
      const q = questions.find((x) => x.id === p.question_id);
      if (q) q.hidden_parts = [];
      log("pii.accept", "pii_report", id, { question_id: p.question_id });
    },

    async denyPii(id) {
      await wait();
      const p = pii.find((x) => x.id === id);
      if (!p) throw new ApiError(404, "NOT_FOUND", "找不到這個標記");
      if (p.status !== "pending") throw new ApiError(409, "INVALID_STATE", "這個標記已經處理過了");
      p.status = "denied";
      p.resolved_at = new Date().toISOString();
      const q = questions.find((x) => x.id === p.question_id);
      if (q) q.hidden_parts = [];
      log("pii.deny", "pii_report", id, { question_id: p.question_id });
    },

    async listUsers(f) {
      await wait();
      const q = f.q?.trim().toLowerCase();
      return {
        items: clone(
          users.filter(
            (u) =>
              (!f.role || u.role === f.role) &&
              (!q || u.nickname.toLowerCase().includes(q) || u.townpass_user_id.toLowerCase().includes(q) || u.id === q),
          ),
        ),
        next: null,
      };
    },

    async setRole(id, role) {
      await wait();
      if (id === me.id) throw new ApiError(403, "FORBIDDEN", "不能變更自己的身份");
      const u = byId(id);
      log("user.role", "user", id, { before: u.role, after: role });
      u.role = role;
      return clone(u);
    },

    async ban(id, reason) {
      await wait();
      if (id === me.id) throw new ApiError(403, "FORBIDDEN", "不能停權自己");
      const u = byId(id);
      u.banned_at = new Date().toISOString();
      u.ban_reason = reason ?? null;
      log("user.ban", "user", id, { reason: reason ?? null });
      return clone(u);
    },

    async unban(id) {
      await wait();
      const u = byId(id);
      u.banned_at = null;
      u.ban_reason = null;
      log("user.unban", "user", id, {});
      return clone(u);
    },

    async cacheAnalytics() {
      await wait();
      return clone([...cache].sort((a, b) => a.score - b.score));
    },

    async auditLog(f) {
      await wait();
      return {
        items: clone(
          audit.filter(
            (e) =>
              (!f.action || e.action === f.action) &&
              (!f.target_id || e.target_id === f.target_id.trim()) &&
              (!f.admin_id || e.admin.id === f.admin_id.trim()),
          ),
        ),
        next: null,
      };
    },
  };
}
