/**
 * 後端 API 的資料結構，欄位名稱與 api-spec.md 一致。
 * 只放發問者畫面用得到的部分。
 */

export type CategoryId =
  | "map_navigation"
  | "admin_procedure"
  | "document_contract"
  | "scam_check"
  | "app_usage"
  | "language"
  | "other"
  /** 未分類：長輩發問的預設值，之後由志工分流 */
  | "uncategorized";

export type QuestionStatus = "open" | "in_progress" | "resolved";
export type AssistanceMode = "online" | "onsite" | "either";
export type AssistStatus = "claimed" | "arrived" | "completed" | "cancelled";
export type LocationSharing = "off" | "approximate" | "exact";
export type UserRole = "user" | "admin" | "bot";

export type PublicUser = {
  id: string;
  nickname: string;
  points: number;
  role: UserRole;
};

export type Me = PublicUser & {
  languages: string[];
  nearby_notifications_enabled: boolean;
  nearby_radius_m: number;
  location_sharing: LocationSharing;
};

export type Media = {
  id: string;
  kind: "image" | "audio" | "video";
  url: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
};

/** 因個資標記待決定而暫時隱藏的內容 */
export type HiddenPart = {
  part: "body" | "media";
  media_id?: string;
  reason: "pii_pending";
};

export type QuestionSummary = {
  id: string;
  status: QuestionStatus;
  /** 內容待個資確認時為 null */
  title: string | null;
  /** 後端回傳的自訂標籤；分類是獨立欄位 */
  tags: string[];
  category: CategoryId;
  language: string;
  assistance_mode: AssistanceMode;
  location_sharing: LocationSharing;
  author: PublicUser;
  /** 從城市通頁面發問時的來源；App 外的問題為 null */
  context: Record<string, unknown> | null;
  /** 公開的概略位置 */
  area: Record<string, unknown> | null;
  thumbnail_url: string | null;
  has_audio?: boolean;
  has_video?: boolean;
  answer_count: number;
  reward_points: number;
  can_claim: boolean;
  hidden_parts: HiddenPart[];
  created_at: string;
};

export type QuestionDetail = QuestionSummary & {
  body: string | null;
  media: Media[];
  is_author: boolean;
  accepted_answer_id: string | null;
  assist_status: AssistStatus | null;
};

export type VoteSummary = {
  upvotes: number;
  my_vote: 1 | -1 | null;
};

export type Answer = {
  id: string;
  question_id: string;
  author: PublicUser;
  body: string | null;
  media: Media[];
  language?: string;
  is_accepted: boolean;
  votes: VoteSummary;
  hidden_parts: HiddenPart[];
  created_at: string;
};

export type Coordinates = {
  lat: number;
  lng: number;
  accuracy_m?: number;
};

export type CreateQuestionRequest = {
  title?: string;
  body?: string;
  media_ids?: string[];
  tags?: string[];
  language: string;
  /** 可不傳：後端會自動分類，不確定時為 uncategorized */
  category?: CategoryId;
  assistance_mode: AssistanceMode;
  location_sharing?: LocationSharing;
  /** location_sharing 不是 off 時必填 */
  location?: Coordinates | null;
  client_request_id: string;
};

export type CreateAnswerRequest = {
  body?: string;
  media_ids?: string[];
  language?: string;
  client_request_id?: string;
};

export type Meta = {
  categories: { id: CategoryId; label: string }[];
  languages: string[];
  points: { answer_accepted: number; assist_completed: number };
  limits: {
    question_body_max_chars: number;
    media_per_post_max: number;
    image_max_bytes: number;
    audio_max_bytes: number;
    audio_max_seconds: number;
    video_max_bytes?: number;
    video_max_seconds?: number;
  };
};

/** Socket.IO 只送「有更新」的訊號，前端收到後再用 REST 重抓 */
export type Signal =
  /** 需要整個重抓（也用在斷線重連之後） */
  | { type: "feed.changed" }
  | { type: "question.changed"; question_id: string }
  | { type: "answers.changed"; question_id: string };

export type ForumPage = { questions: QuestionDetail[]; nextCursor: string | null };

/** 發問者畫面需要的 API；之後換成真的後端只要實作同一個介面 */
export type AskerApi = {
  getMeta(): Promise<Meta>;
  getMe(): Promise<Me>;
  updateMe(patch: { nickname?: string }): Promise<Me>;
  /** GET /questions?author=me */
  listMyQuestions(): Promise<QuestionSummary[]>;
  /** 公開討論串列表；tagQuery 會交由後端搜尋所有標籤 */
  listForumQuestions(filter?: { category?: CategoryId; tagQuery?: string; cursor?: string }): Promise<ForumPage>;
  /**
   * 志工分類：PUT /questions/{id}/category。
   * 只能改未分類的問題（已分類回 409 INVALID_STATE）；不能送 uncategorized（400）。
   */
  setQuestionCategory(questionId: string, category: CategoryId): Promise<QuestionDetail>;
  getQuestion(id: string): Promise<QuestionDetail>;
  createQuestion(req: CreateQuestionRequest): Promise<QuestionDetail>;
  deleteQuestion(id: string): Promise<void>;
  /** GET /questions/{id}/answers?sort=oldest（聊天室依時間排列） */
  listAnswers(questionId: string): Promise<Answer[]>;
  createAnswer(questionId: string, req: CreateAnswerRequest): Promise<Answer>;
  deleteAnswer(answerId: string): Promise<void>;
  resolveQuestion(questionId: string): Promise<QuestionDetail>;
  vote(answerId: string, value: 1 | -1): Promise<VoteSummary>;
  unvote(answerId: string): Promise<VoteSummary>;
  uploadMedia(
    file: Blob,
    kind: "image" | "audio" | "video",
    durationSeconds?: number,
  ): Promise<Media>;
  /** 對應 Socket.IO 的 answers.changed 等訊號 */
  subscribe(listener: (signal: Signal) => void): () => void;
  /** 要收哪些問題的即時訊號（question:subscribe / unsubscribe） */
  watch(questionIds: string[]): void;
  /** 關閉連線 */
  close(): void;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
