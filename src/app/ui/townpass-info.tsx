"use client";

import { useCallback, useEffect, useState } from "react";
import { callApp, isInTownPass, onAppMessage, type BridgeMessage } from "@/lib/townpass-bridge";

type UserInfo = {
  id: string;
  account: string;
  username: string;
  realName: string;
  idNo: string;
  email: string;
  phoneNo: string;
  birthday: string;
  memberType: string;
  verifyLevel: string;
  residentAddress: string;
  citizen: boolean;
  nativePeople: boolean;
  cityInternetUid: string;
};

type Location = { latitude: number; longitude: number; accuracy: number; timestamp: number };

type LogEntry = BridgeMessage & { at: number };

const USER_FIELDS: [keyof UserInfo, string][] = [
  ["id", "使用者 ID"],
  ["account", "帳號"],
  ["username", "暱稱"],
  ["realName", "真實姓名"],
  ["idNo", "身分證字號"],
  ["email", "Email"],
  ["phoneNo", "手機"],
  ["birthday", "生日"],
  ["memberType", "會員類型"],
  ["verifyLevel", "驗證等級"],
  ["residentAddress", "戶籍地址"],
  ["citizen", "市民"],
  ["nativePeople", "原住民"],
  ["cityInternetUid", "市民網路 UID"],
];

function show(v: unknown) {
  if (typeof v === "boolean") return v ? "是" : "否";
  if (v === "" || v == null) return "—";
  return String(v);
}

function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm dark:border-white/15 dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </header>
      <div className="px-4 py-3 text-sm">{children}</div>
    </section>
  );
}

export default function TownPassInfo() {
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [user, setUser] = useState<UserInfo | null | "empty">(null);
  const [location, setLocation] = useState<Location | null | "failed">(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<Record<string, unknown>>({});
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    // 無 request id，依序呼叫避免回覆混淆
    const u = await callApp<UserInfo | []>("userinfo");
    setUser(!u || Array.isArray(u) ? "empty" : u);
    const p = await callApp<Location | []>("location", null, 20000);
    setLocation(!p || Array.isArray(p) ? "failed" : p);
    setRaw({ userinfo: u ?? null, location: p ?? null });
    setLoading(false);
  }, []);

  const copy = useCallback(async () => {
    const text = JSON.stringify({ receivedAt: new Date().toISOString(), ...raw }, null, 2);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // WebView 不一定允許 Clipboard API，退回舊方法
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    }
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2000);
  }, [raw]);

  useEffect(() => {
    const ok = isInTownPass();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- window 只能在 client 判斷
    setInApp(ok);
    if (!ok) return;
    const off = onAppMessage((msg) => setLog((l) => [{ ...msg, at: Date.now() }, ...l].slice(0, 50)));
    void refresh();
    return off;
  }, [refresh]);

  if (inApp === null) return null;

  if (!inApp) {
    return (
      <Card title="Town Pass 資訊">
        <p className="text-zinc-500 dark:text-zinc-400">
          目前不在 Town Pass App 內開啟（找不到 <code>flutterObject</code>），無法接收 App 資訊。
        </p>
      </Card>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <button
        onClick={copy}
        disabled={loading || Object.keys(raw).length === 0}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-medium shadow-sm active:scale-[0.99] disabled:opacity-50 dark:border-white/15 dark:bg-zinc-900"
      >
        {copied === "ok" ? "✓ 已複製到剪貼簿" : copied === "fail" ? "複製失敗" : "複製全部資訊（JSON）"}
      </button>

      <Card
        title="使用者資料"
        action={
          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-full bg-zinc-900 px-3 py-1 text-xs text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          >
            {loading ? "接收中…" : "重新接收"}
          </button>
        }
      >
        {user === null ? (
          <p className="text-zinc-400">接收中…</p>
        ) : user === "empty" ? (
          <p className="text-zinc-400">沒有取得使用者資料</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {USER_FIELDS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                <dd className="break-all">{show(user[key])}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      <Card title="定位">
        {location === null ? (
          <p className="text-zinc-400">接收中…</p>
        ) : location === "failed" ? (
          <p className="text-zinc-400">無法取得定位（定位未開啟或權限被拒）</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-zinc-500 dark:text-zinc-400">緯度</dt>
            <dd>{location.latitude}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">經度</dt>
            <dd>{location.longitude}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">精度</dt>
            <dd>{Math.round(location.accuracy)} 公尺</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">時間</dt>
            <dd>{new Date(location.timestamp).toLocaleString("zh-TW")}</dd>
          </dl>
        )}
      </Card>

      <Card title="收到的原始訊息">
        {log.length === 0 ? (
          <p className="text-zinc-400">尚未收到訊息</p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-2 overflow-auto">
            {log.map((m, i) => (
              <li key={`${m.at}-${i}`} className="rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-800">
                <div className="mb-1 flex justify-between text-zinc-500">
                  <span className="font-mono font-semibold">{m.name}</span>
                  <span>{new Date(m.at).toLocaleTimeString("zh-TW")}</span>
                </div>
                <pre className="overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(m.data, null, 2)}</pre>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
