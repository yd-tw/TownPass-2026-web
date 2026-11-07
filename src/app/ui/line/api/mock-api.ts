import {
  ApiError,
  type Answer,
  type AskerApi,
  type CategoryId,
  type Me,
  type Media,
  type Meta,
  type PublicUser,
  type QuestionDetail,
  type QuestionSummary,
  type Signal,
  type VoteSummary,
} from "./types";

/**
 * 依 api-spec.md 行為模擬的後端，資料只存在這個分頁的記憶體裡。
 * 換成真的後端時，實作同一個 AskerApi 介面即可，畫面不用改。
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 與 GET /meta 的實際回應相同 */
export const META: Meta = {
  categories: [
    { id: "map_navigation", label: "地圖與路線" },
    { id: "admin_procedure", label: "行政程序" },
    { id: "document_contract", label: "公文與合約" },
    { id: "scam_check", label: "疑似詐騙" },
    { id: "app_usage", label: "城市通操作" },
    { id: "language", label: "語言與文字" },
    { id: "other", label: "其他" },
    { id: "uncategorized", label: "未分類" },
  ],
  languages: ["zh-TW", "en", "ja", "ko", "vi", "id", "th", "tl"],
  points: { answer_accepted: 10, assist_completed: 30 },
  limits: {
    question_body_max_chars: 5000,
    media_per_post_max: 5,
    image_max_bytes: 10 * 1024 * 1024,
    audio_max_bytes: 20 * 1024 * 1024,
    audio_max_seconds: 180,
  },
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AUDIO_TYPES = ["audio/mp4", "audio/aac", "audio/mpeg", "audio/webm", "audio/x-m4a"];

/** 範例照片：用 SVG 畫一張「文件」示意圖 */
function placeholderImage(label: string, tint: string) {
  const lines = Array.from(
    { length: 7 },
    (_, i) =>
      `<rect x='150' y='${92 + i * 26}' width='${i % 3 === 2 ? 120 : 180}' height='9' rx='4' fill='#b0aea5'/>`,
  ).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='360' viewBox='0 0 480 360'><rect width='480' height='360' fill='${tint}'/><rect x='120' y='40' width='240' height='280' rx='6' fill='#faf9f5' transform='rotate(-3 240 180)'/><g transform='rotate(-3 240 180)'><rect x='150' y='62' width='110' height='14' rx='4' fill='#d97757'/>${lines}</g><text x='240' y='345' text-anchor='middle' font-size='18' fill='#3d3929' font-family='sans-serif'>${label}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);
const iso = (t: number) => new Date(t).toISOString();

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type VoteState = { up: number; mine: 1 | -1 | null };

const HELPERS: Record<string, PublicUser> = {
  xiaozhi: { id: "u-xiaozhi", nickname: "志工小志", points: 320 },
  wang: { id: "u-wang", nickname: "王小姐", points: 85 },
  li: { id: "u-li", nickname: "李警官（志工）", points: 610 },
  lin: { id: "u-lin", nickname: "林同學", points: 40 },
  ade: { id: "u-ade", nickname: "阿德", points: 120 },
  an: { id: "u-an", nickname: "志工小安", points: 210 },
};

/** 送出新問題後，模擬幾秒後有熱心的人回覆 */
const AUTO_REPLY: Partial<Record<CategoryId, string>> = {
  scam_check:
    "請先不要匯款、也不要把驗證碼告訴任何人！可以撥 165 反詐騙專線確認。",
  document_contract: "可以把文件拍清楚一點嗎？我幫您看看是什麼通知。",
  map_navigation: "請問您現在在哪裡附近？我幫您查怎麼走比較方便。",
  app_usage: "您好，請問是卡在哪一個畫面呢？可以拍照給我看看。",
};

/** 大量志工模式用的暱稱與回答（內容刻意寫成不管問什麼都說得通） */
const CROWD_SURNAMES = ["王", "陳", "林", "李", "張", "黃", "吳", "劉", "蔡", "楊"];
const CROWD_SUFFIXES = ["阿姨", "伯伯", "小姐", "先生", "同學", "志工", "大哥", "大姐", "老師", "阿公"];
const CROWD_REPLIES = [
  "您好，我看到您的問題了，可以再多說明一點嗎？",
  "可以先打 1999 台北市民當家熱線問問看，他們會幫您轉到負責的單位。",
  "我之前也遇過一樣的狀況，後來是直接去區公所櫃台問，他們很有耐心。",
  "照片有點模糊，可以靠近一點再拍一次嗎？我幫您看清楚。",
  "不用擔心，這個很常見，我一步一步跟您說。",
  "建議先不要急著處理，等確認清楚再說比較安全。",
  "如果是要繳費，可以帶去便利商店繳，不用跑銀行。",
  "請問您住在哪一區？不同區的辦法可能不太一樣。",
  "我可以陪您用視訊一起看，如果需要的話跟我說。",
  "台北通 App 裡面就可以查到，打開首頁往下滑就有。",
  "這個要帶身分證和印章去辦，記得先影印一份。",
  "可以請家人或里長幫忙確認，比較放心。",
  "如果有人打電話要您匯款，那一定是詐騙，直接掛掉就好。",
  "我剛剛幫您查了一下，官網上有寫，期限還有兩個禮拜。",
  "您可以到住家附近的里辦公處問，他們都會幫忙。",
  "看起來是一般通知，不用特別處理，留著就好。",
  "建議搭捷運比較方便，到站後出口有服務台可以問路。",
  "您可以按住麥克風直接說，我們聽得懂台語也沒關係。",
  "同意上面的說法，我也是這樣處理的。",
  "我是社工，這類問題可以打 1957 福利諮詢專線。",
  "如果看不清楚字，手機設定裡可以把字放大。",
  "先別擔心！大部分這種信都只是通知，不會有罰款。",
  "我也不太確定，但可以幫您問問看朋友。",
  "記得不要把驗證碼或密碼告訴任何人喔。",
  "可以把整張拍下來嗎？包含最上面的機關名稱。",
];
const CROWD_FOLLOW_UPS = [
  "補充一下：記得先確認寄件單位是不是真的。",
  "我剛剛又查了一下，上面說的沒錯。",
  "有需要的話我可以再詳細說明。",
  "祝您順利！",
];

function shuffle<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type MockOptions = {
  /** 大量志工模式：發問後陸續有 50～100 位志工回答 */
  crowd?: boolean;
};

export function createMockApi(
  initialNickname: string,
  options: MockOptions = {},
): AskerApi {
  const now = Date.now();
  const me: Me = {
    id: "u-me",
    nickname: initialNickname,
    points: 0,
    languages: ["zh-TW"],
    nearby_notifications_enabled: false,
    nearby_radius_m: 1000,
    location_sharing: "off",
  };
  const meUser = (): PublicUser => ({
    id: me.id,
    nickname: me.nickname,
    points: me.points,
  });

  const questions: QuestionDetail[] = [];
  const answers: Answer[] = [];
  const votes = new Map<string, VoteState>();
  const requestIds = new Map<string, string>();
  /** POST /media 上傳過的檔案 */
  const uploaded = new Map<string, Media>();
  const listeners = new Set<(s: Signal) => void>();
  const emit = (s: Signal) => {
    // 模擬網路延遲後才收到 socket 訊號
    setTimeout(() => listeners.forEach((l) => l(s)), 150);
  };

  // ---- 範例資料 ----
  const addQuestion = (
    ago: number,
    category: CategoryId,
    title: string,
    body: string,
    opts: { media?: Media[]; status?: QuestionDetail["status"] } = {},
  ) => {
    const media = opts.media ?? [];
    const q: QuestionDetail = {
      id: makeId("q"),
      status: opts.status ?? "open",
      title,
      category,
      language: "zh-TW",
      assistance_mode: "online",
      location_sharing: "off",
      author: meUser(),
      context: null,
      area: null,
      thumbnail_url: media.find((m) => m.kind === "image")?.url ?? null,
      has_audio: media.some((m) => m.kind === "audio"),
      answer_count: 0,
      reward_points: 0,
      can_claim: false,
      hidden_parts: [],
      created_at: iso(now - ago),
      body,
      media,
      is_author: true,
      accepted_answer_id: null,
      assist_status: null,
    };
    questions.push(q);
    return q;
  };
  const addAnswer = (
    q: QuestionDetail,
    ago: number,
    author: PublicUser,
    body: string,
    up = 0,
    accepted = false,
  ) => {
    const a: Answer = {
      id: makeId("a"),
      question_id: q.id,
      author,
      body,
      media: [],
      language: "zh-TW",
      is_accepted: accepted,
      votes: { upvotes: up, my_vote: null },
      hidden_parts: [],
      created_at: iso(now - ago),
    };
    answers.push(a);
    votes.set(a.id, { up, mine: null });
    q.answer_count++;
    if (accepted) q.accepted_answer_id = a.id;
    return a;
  };

  const q1 = addQuestion(
    3 * DAY,
    "document_contract",
    "這張公文是什麼意思？",
    "收到區公所寄來的信，看不太懂要我做什麼",
    {
      status: "resolved",
      media: [
        {
          id: makeId("m"),
          kind: "image",
          url: placeholderImage("區公所來信", "#e8e6dc"),
          width: 480,
          height: 360,
        },
      ],
    },
  );
  addAnswer(
    q1,
    3 * DAY - 40 * MIN,
    HELPERS.xiaozhi,
    "這是房屋稅的繳款通知，繳費期限是 11/30。可以拿到便利商店繳，或用台北通直接繳費。",
    5,
    true,
  );
  addAnswer(q1, 3 * DAY - 55 * MIN, HELPERS.wang, "補充：信封裡應該還有一張繳款單，帶那張去超商就可以了", 2);
  addAnswer(q1, 3 * DAY - 70 * MIN, meUser(), "找到了！謝謝你們 🙏");

  const q2 = addQuestion(
    50 * MIN,
    "scam_check",
    "接到電話說我的帳戶被盜用，要我去 ATM",
    "剛剛有人打電話說是銀行，說我的帳戶被盜用，要我現在去 ATM 操作解除，這是真的嗎？",
  );
  addAnswer(
    q2,
    45 * MIN,
    HELPERS.li,
    "這是詐騙！銀行絕對不會叫您去 ATM 操作。請直接掛掉電話，有疑問就撥 165 反詐騙專線。",
    8,
  );
  addAnswer(q2, 30 * MIN, HELPERS.lin, "對，ATM 沒有「解除設定」這種功能，千萬不要去", 3);

  const q3 = addQuestion(
    5 * HOUR,
    "app_usage",
    "台北通怎麼查公車什麼時候來？",
    "台北通怎麼查公車什麼時候來？我想坐 285",
  );
  addAnswer(
    q3,
    2 * HOUR,
    HELPERS.ade,
    "打開台北通 →「交通」→「公車動態」，輸入 285 就可以看到還有幾分鐘到站",
    1,
  );

  addQuestion(
    20 * MIN,
    "map_navigation",
    "從台北車站要怎麼去榮總？",
    "從台北車站要怎麼去榮總？搭捷運還是公車比較方便？",
  );

  // ---- 工具 ----
  const findQuestion = (id: string) => {
    const q = questions.find((x) => x.id === id);
    if (!q) throw new ApiError(404, "NOT_FOUND", "問題不存在或已撤回");
    return q;
  };
  const findAnswer = (id: string) => {
    const a = answers.find((x) => x.id === id);
    if (!a) throw new ApiError(404, "NOT_FOUND", "回答不存在");
    return a;
  };
  const voteSummary = (id: string): VoteSummary => {
    const v = votes.get(id) ?? { up: 0, mine: null };
    return { upvotes: v.up, my_vote: v.mine };
  };
  const withVotes = (a: Answer): Answer => ({ ...a, votes: voteSummary(a.id) });
  const toSummary = (q: QuestionDetail): QuestionSummary => ({
    id: q.id,
    status: q.status,
    title: q.title,
    category: q.category,
    language: q.language,
    assistance_mode: q.assistance_mode,
    location_sharing: q.location_sharing,
    author: q.author,
    context: null,
    area: null,
    thumbnail_url: q.thumbnail_url,
    has_audio: q.has_audio,
    answer_count: q.answer_count,
    reward_points: q.reward_points,
    can_claim: q.can_claim,
    hidden_parts: q.hidden_parts,
    created_at: q.created_at,
  });

  /** 模擬很多志工在短時間內陸續回答同一個問題 */
  const scheduleCrowd = (q: QuestionDetail) => {
    const count = 50 + Math.floor(Math.random() * 51);
    const names = shuffle(
      CROWD_SURNAMES.flatMap((s) => CROWD_SUFFIXES.map((x) => s + x)),
    ).slice(0, count);
    type Item = { author: PublicUser; body: string; image: boolean };
    const items: Item[] = [];
    names.forEach((nickname, i) => {
      const author = {
        id: `u-crowd-${i}`,
        nickname,
        points: Math.floor(Math.random() * 500),
      };
      items.push({
        author,
        body: CROWD_REPLIES[Math.floor(Math.random() * CROWD_REPLIES.length)],
        image: Math.random() < 0.06,
      });
      // 約一成的人會再補一句
      if (Math.random() < 0.1) {
        items.push({
          author,
          body: CROWD_FOLLOW_UPS[Math.floor(Math.random() * CROWD_FOLLOW_UPS.length)],
          image: false,
        });
      }
    });
    let delay = 2000;
    for (const item of items) {
      delay += 150 + Math.random() * 300;
      setTimeout(() => {
        if (!questions.includes(q) || q.status === "resolved") return;
        const a = addAnswer(q, 0, item.author, item.body, Math.floor(Math.random() * 12));
        a.created_at = iso(Date.now());
        if (item.image) {
          a.media = [
            {
              id: makeId("m"),
              kind: "image",
              url: placeholderImage("參考照片", "#c9dbeb"),
              width: 480,
              height: 360,
            },
          ];
        }
        emit({ type: "answers.changed", question_id: q.id });
      }, delay);
    }
  };

  const scheduleAutoReply = (q: QuestionDetail) => {
    if (options.crowd) {
      scheduleCrowd(q);
      return;
    }
    setTimeout(() => {
      if (!questions.includes(q)) return;
      addAnswer(
        q,
        0,
        HELPERS.an,
        AUTO_REPLY[q.category] ??
          "您好，我看到您的問題了，可以再多說明一點嗎？我來幫您看看。",
      );
      // addAnswer 以 now 為基準，這裡改成實際送出的時間
      answers[answers.length - 1].created_at = iso(Date.now());
      emit({ type: "answers.changed", question_id: q.id });
    }, 6000);
  };

  return {
    async getMeta() {
      return clone(META);
    },

    async getMe() {
      await wait(100);
      return clone(me);
    },

    async updateMe(patch) {
      await wait();
      const nickname = patch.nickname?.trim();
      if (nickname !== undefined) {
        if (!nickname || nickname.length > 30) {
          throw new ApiError(400, "VALIDATION_ERROR", "暱稱長度需為 1 到 30 字");
        }
        me.nickname = nickname;
        for (const q of questions) q.author = meUser();
        for (const a of answers) if (a.author.id === me.id) a.author = meUser();
      }
      return clone(me);
    },

    async listMyQuestions() {
      await wait();
      return clone(
        questions
          .filter((q) => q.author.id === me.id)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(toSummary),
      );
    },

    async getQuestion(id) {
      await wait(150);
      return clone(findQuestion(id));
    },

    async createQuestion(req) {
      await wait(400);
      const existing = requestIds.get(req.client_request_id);
      if (existing) return clone(findQuestion(existing));
      const body = req.body?.trim() ?? "";
      const mediaIds = req.media_ids ?? [];
      if (!body && mediaIds.length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "body 和 media_ids 至少要有一個");
      }
      const media = mediaIds.map((id) => {
        const m = uploaded.get(id);
        if (!m) throw new ApiError(400, "VALIDATION_ERROR", "找不到媒體檔");
        return m;
      });
      const fallbackTitle = media.some((m) => m.kind === "audio")
        ? "（語音提問）"
        : "（照片提問）";
      const q: QuestionDetail = {
        id: makeId("q"),
        status: "open",
        title: req.title ?? (body ? body.slice(0, 30) : fallbackTitle),
        category: req.category,
        language: req.language,
        assistance_mode: req.assistance_mode,
        location_sharing: req.location_sharing ?? me.location_sharing,
        author: meUser(),
        context: null,
        area: null,
        thumbnail_url: media.find((m) => m.kind === "image")?.url ?? null,
        has_audio: media.some((m) => m.kind === "audio"),
        answer_count: 0,
        reward_points: 0,
        can_claim: false,
        hidden_parts: [],
        created_at: iso(Date.now()),
        body: body || null,
        media,
        is_author: true,
        accepted_answer_id: null,
        assist_status: null,
      };
      questions.push(q);
      requestIds.set(req.client_request_id, q.id);
      emit({ type: "feed.changed" });
      scheduleAutoReply(q);
      return clone(q);
    },

    async deleteQuestion(id) {
      await wait();
      const q = findQuestion(id);
      if (q.author.id !== me.id) throw new ApiError(403, "FORBIDDEN", "只有發問者可以撤回");
      questions.splice(questions.indexOf(q), 1);
      for (let i = answers.length - 1; i >= 0; i--) {
        if (answers[i].question_id === id) answers.splice(i, 1);
      }
      emit({ type: "feed.changed" });
    },

    async listAnswers(questionId) {
      await wait(150);
      findQuestion(questionId);
      return clone(
        answers
          .filter((a) => a.question_id === questionId)
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map(withVotes),
      );
    },

    async createAnswer(questionId, req) {
      await wait(300);
      const q = findQuestion(questionId);
      const body = req.body?.trim() ?? "";
      const mediaIds = req.media_ids ?? [];
      if (!body && mediaIds.length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "body 和 media_ids 至少要有一個");
      }
      const a: Answer = {
        id: makeId("a"),
        question_id: q.id,
        author: meUser(),
        body: body || null,
        media: mediaIds.map((id) => {
          const m = uploaded.get(id);
          if (!m) throw new ApiError(400, "VALIDATION_ERROR", "找不到媒體檔");
          return m;
        }),
        language: req.language ?? "zh-TW",
        is_accepted: false,
        votes: { upvotes: 0, my_vote: null },
        hidden_parts: [],
        created_at: iso(Date.now()),
      };
      answers.push(a);
      votes.set(a.id, { up: 0, mine: null });
      q.answer_count++;
      emit({ type: "answers.changed", question_id: q.id });
      return clone(a);
    },

    async deleteAnswer(answerId) {
      await wait();
      const a = findAnswer(answerId);
      if (a.author.id !== me.id) throw new ApiError(403, "FORBIDDEN", "只能刪除自己的回答");
      if (a.is_accepted) throw new ApiError(409, "ANSWER_ACCEPTED", "已採納的回答不能刪除");
      answers.splice(answers.indexOf(a), 1);
      const q = questions.find((x) => x.id === a.question_id);
      if (q) q.answer_count--;
      emit({ type: "answers.changed", question_id: a.question_id });
    },

    async acceptAnswer(answerId) {
      await wait();
      const a = findAnswer(answerId);
      const q = findQuestion(a.question_id);
      if (q.author.id !== me.id) throw new ApiError(403, "FORBIDDEN", "只有發問者可以採納");
      if (a.author.id === me.id) {
        throw new ApiError(403, "SELF_ACTION_NOT_ALLOWED", "不能採納自己的回答");
      }
      if (q.accepted_answer_id) throw new ApiError(409, "ALREADY_ACCEPTED", "已經採納過了");
      a.is_accepted = true;
      q.accepted_answer_id = a.id;
      q.status = "resolved";
      a.author = { ...a.author, points: a.author.points + META.points.answer_accepted };
      emit({ type: "question.changed", question_id: q.id });
      emit({ type: "answers.changed", question_id: q.id });
      return clone(withVotes(a));
    },

    async vote(answerId, value) {
      await wait(150);
      const a = findAnswer(answerId);
      if (a.author.id === me.id) {
        throw new ApiError(403, "SELF_ACTION_NOT_ALLOWED", "不能投自己的回答");
      }
      const v = votes.get(answerId) ?? { up: 0, mine: null };
      if (v.mine === 1) v.up--;
      v.mine = value;
      if (value === 1) v.up++;
      votes.set(answerId, v);
      emit({ type: "answers.changed", question_id: a.question_id });
      return voteSummary(answerId);
    },

    async unvote(answerId) {
      await wait(150);
      const a = findAnswer(answerId);
      const v = votes.get(answerId) ?? { up: 0, mine: null };
      if (v.mine === 1) v.up--;
      v.mine = null;
      votes.set(answerId, v);
      emit({ type: "answers.changed", question_id: a.question_id });
      return voteSummary(answerId);
    },

    async uploadMedia(file, kind, durationSeconds) {
      await wait(400);
      if (kind === "image") {
        if (!IMAGE_TYPES.includes(file.type)) {
          throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "照片只支援 JPEG、PNG、WebP");
        }
        if (file.size > META.limits.image_max_bytes) {
          throw new ApiError(413, "FILE_TOO_LARGE", "照片不能超過 10 MB");
        }
      } else {
        const type = file.type.split(";")[0];
        if (!AUDIO_TYPES.includes(type)) {
          throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "不支援這種錄音格式");
        }
        if (!durationSeconds) {
          throw new ApiError(400, "VALIDATION_ERROR", "語音需要 duration_seconds");
        }
        if (durationSeconds > META.limits.audio_max_seconds) {
          throw new ApiError(400, "VALIDATION_ERROR", "語音最長 3 分鐘");
        }
      }
      const m: Media = {
        id: makeId("m"),
        kind,
        url: URL.createObjectURL(file),
        duration_seconds: kind === "audio" ? durationSeconds : undefined,
      };
      uploaded.set(m.id, m);
      return clone(m);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
