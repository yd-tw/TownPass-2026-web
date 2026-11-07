export type Attachment = {
  id: string;
  kind: "image" | "audio" | "video";
  name: string;
  blob: Blob;
};

export type Reply = {
  id: string;
  authorId: string;
  author: string;
  text: string;
  createdAt: number;
  attachments: Attachment[];
  rewarded: boolean;
};

export type Thread = {
  id: string;
  authorId: string;
  author: string;
  question: string;
  tags: string[];
  createdAt: number;
  notifyNearby: boolean;
  replies: Reply[];
};

export type ForumState = { threads: Thread[] };

export const DEMO_ASKER = { id: "demo-asker", name: "小安" };
export const DEMO_HELPER = { id: "demo-helper", name: "阿哲" };

const minute = 60_000;

export function initialForum(): ForumState {
  const now = Date.now();
  return {
    threads: [
      {
        id: "sample-1", authorId: DEMO_ASKER.id, author: DEMO_ASKER.name,
        question: "剛搬到臺北，想知道租屋補助要從哪裡開始申請？需要先準備哪些文件？看了一圈網站還是有點搞不清楚。",
        tags: ["#租屋補助", "#申辦服務"],
        createdAt: now - 18 * minute, notifyNearby: true,
        replies: [
          { id: "sample-r1", authorId: DEMO_HELPER.id, author: DEMO_HELPER.name, text: "可以先到臺北市住宅服務網站看申請資格，通常會需要身分證明、租賃契約與所得資料。你現在是自己租屋嗎？", createdAt: now - 12 * minute, attachments: [], rewarded: false },
        ],
      },
      {
        id: "sample-2", authorId: "demo-yu", author: "羽晴",
        question: "明天要帶家人去大安森林公園，附近有無障礙廁所嗎？輪椅推行哪個入口比較方便？",
        tags: ["#無障礙", "#交通指引"],
        createdAt: now - 45 * minute, notifyNearby: true,
        replies: [
          { id: "sample-r2", authorId: "demo-min", author: "米娜", text: "我上次從信義路側進去，步道比較平順。公園服務中心旁也有無障礙廁所。", createdAt: now - 29 * minute, attachments: [], rewarded: true },
          { id: "sample-r3", authorId: "demo-chi", author: "小祈", text: "如果搭捷運，大安森林公園站 5 號出口有電梯，可以參考看看。", createdAt: now - 23 * minute, attachments: [], rewarded: false },
        ],
      },
      {
        id: "sample-3", authorId: "demo-cheng", author: "阿成",
        question: "收到一封說要補繳停車費的簡訊，網址看起來怪怪的。請問怎麼確認是不是真的？",
        tags: ["#防詐騙", "#停車繳費"],
        createdAt: now - 2 * 60 * minute, notifyNearby: false, replies: [],
      },
    ],
  };
}

const keywords: [RegExp, string][] = [
  [/租屋|房租|住宅|補助/, "#租屋補助"],
  [/捷運|公車|交通|停車/, "#交通指引"],
  [/詐騙|簡訊|可疑|釣魚/, "#防詐騙"],
  [/申請|申辦|文件|戶政/, "#申辦服務"],
  [/無障礙|輪椅|電梯/, "#無障礙"],
  [/公園|附近|地點|哪裡/, "#在地生活"],
];

/** 前端展示用的暫時規則；後續由後端產生標籤。 */
export function tagQuestion(question: string) {
  const cleaned = question.replace(/\s+/g, " ").trim();
  const tags = keywords.filter(([pattern]) => pattern.test(cleaned)).map(([, tag]) => tag).slice(0, 2);
  return { tags: tags.length ? tags : ["#生活求助"] };
}

const DB_NAME = "townpass-forum-preview";
const STORE = "forum";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadForum(): Promise<ForumState> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get("current");
      request.onsuccess = () => resolve((request.result as ForumState | undefined) ?? initialForum());
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveForum(value: ForumState): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
