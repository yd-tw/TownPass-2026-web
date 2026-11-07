"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AdminApi, AdminUser, UserRole } from "../api";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorBox,
  LoadMore,
  Loading,
  ROLE_LABEL,
  SectionTitle,
  Select,
  errorText,
  formatTime,
  usePaged,
  useToast,
} from "../ui";

const ROLE_OPTIONS = (Object.entries(ROLE_LABEL) as [UserRole, string][]);

export function UsersSection({ api }: { api: AdminApi }) {
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<UserRole | "">("");
  // 後端還不能依停權狀態篩選：前端依 banned_at 自行過濾
  const [banned, setBanned] = useState<"" | "active" | "banned">("");
  const list = usePaged((cursor) => api.listUsers({ q: query || undefined, role: role || undefined }, cursor), [api, query, role]);
  const [confirm, setConfirm] = useState<{ kind: "ban" | "unban" | "role"; user: AdminUser; role?: UserRole } | null>(null);
  const notify = useToast();

  const items = list.items.filter((u) => !banned || (banned === "banned") === !!u.banned_at);
  const replace = (u: AdminUser) => list.setItems((x) => x.map((y) => (y.id === u.id ? u : y)));

  return (
    <>
      <SectionTitle title="使用者管理" desc="設定身份、停權或解除停權。停權會立即登出並中斷連線，已發布的內容不會自動移除。" />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="篩選">
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(q.trim());
          }}
        >
          <label className="flex h-10 items-center gap-1.5 rounded-lg border border-tp-gray-200 bg-white px-2.5 focus-within:border-tp-primary-500">
            <Search className="size-4 text-tp-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="暱稱或城市通 ID" aria-label="搜尋使用者" className="w-44 bg-transparent text-sm outline-none placeholder:text-tp-gray-400" />
          </label>
          <Button type="submit">搜尋</Button>
        </form>
        <Select label="身份" value={role} onChange={setRole} options={[["", "全部身份"], ...ROLE_OPTIONS] as [UserRole | "", string][]} />
        <Select
          label="停權狀態"
          value={banned}
          onChange={setBanned}
          options={[
            ["", "全部狀態"],
            ["active", "正常"],
            ["banned", "停權中"],
          ]}
        />
      </div>

      {list.error && <ErrorBox message={list.error} onRetry={list.reload} />}
      <Card className="overflow-hidden">
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : items.length === 0 ? (
          <Empty>沒有符合的使用者</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-tp-gray-100 text-left text-xs text-tp-gray-500">
                  <th className="py-2.5 pl-5 font-medium">使用者</th>
                  <th className="py-2.5 pr-3 text-right font-medium">積分</th>
                  <th className="py-2.5 pr-3 font-medium">可信度</th>
                  <th className="py-2.5 pr-3 font-medium">狀態</th>
                  <th className="py-2.5 pr-3 font-medium">身份</th>
                  <th className="py-2.5 pr-5 text-right font-medium">停權</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => {
                  const self = u.id === api.me.id;
                  return (
                    <tr key={u.id} className={cn("border-b border-tp-gray-100 last:border-0", u.banned_at && "bg-tp-warn-200/[0.03]")}>
                      <td className="py-3 pl-5">
                        <p className="flex items-center gap-1.5 font-semibold">
                          {u.nickname}
                          {self && <Badge tone="primary">你</Badge>}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-tp-gray-500">{u.townpass_user_id}</p>
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums">{u.points.toLocaleString("zh-TW")}</td>
                      <td className="py-3 pr-3">
                        <TrustScore value={u.trust_score} />
                      </td>
                      <td className="py-3 pr-3">
                        {u.banned_at ? (
                          <div>
                            <Badge tone="warn">停權中</Badge>
                            <p className="mt-0.5 text-xs text-tp-gray-500">
                              {formatTime(u.banned_at)}
                              {u.ban_reason && `：${u.ban_reason}`}
                            </p>
                          </div>
                        ) : (
                          <span className="text-tp-gray-600">正常</span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <Select
                          label={`${u.nickname} 的身份`}
                          value={u.role}
                          disabled={self}
                          onChange={(next) => setConfirm({ kind: "role", user: u, role: next })}
                          options={ROLE_OPTIONS}
                          className="h-9"
                        />
                      </td>
                      <td className="py-3 pr-5 text-right">
                        {u.banned_at ? (
                          <Button size="sm" disabled={self} onClick={() => setConfirm({ kind: "unban", user: u })}>
                            解除停權
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" disabled={self} title={self ? "不能停權自己" : undefined} onClick={() => setConfirm({ kind: "ban", user: u })} className="text-tp-warn-200 hover:bg-tp-warn-200/10">
                            停權
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <LoadMore hasMore={list.hasMore} busy={list.loadingMore} onClick={list.loadMore} />
      </Card>

      {confirm && (
        <ConfirmDialog
          danger={confirm.kind === "ban"}
          title={
            confirm.kind === "ban"
              ? `停權「${confirm.user.nickname}」？`
              : confirm.kind === "unban"
                ? `解除「${confirm.user.nickname}」的停權？`
                : `把「${confirm.user.nickname}」設為${ROLE_LABEL[confirm.role!]}？`
          }
          body={
            confirm.kind === "ban" ? (
              <p>會立即登出並中斷連線，之後也不能重新登入。已發布的內容不會自動移除。</p>
            ) : confirm.kind === "unban" ? (
              <p>對方可以再次登入使用。</p>
            ) : confirm.role === "admin" ? (
              <p>管理員可以修改、刪除所有內容，也能管理其他使用者。</p>
            ) : (
              <p>伺服器名單內的管理員，下次登入時會依名單恢復身份。</p>
            )
          }
          input={confirm.kind === "ban" ? { label: "停權原因（選填，會留在稽核紀錄）", maxLength: 200 } : undefined}
          confirmLabel={confirm.kind === "ban" ? "停權" : confirm.kind === "unban" ? "解除停權" : "確定"}
          onCancel={() => setConfirm(null)}
          onConfirm={async (reason) => {
            try {
              const u =
                confirm.kind === "ban"
                  ? await api.ban(confirm.user.id, reason || undefined)
                  : confirm.kind === "unban"
                    ? await api.unban(confirm.user.id)
                    : await api.setRole(confirm.user.id, confirm.role!);
              replace(u);
              notify(confirm.kind === "ban" ? "已停權" : confirm.kind === "unban" ? "已解除停權" : "已更新身份");
            } catch (e) {
              notify(errorText(e), "error");
            }
            setConfirm(null);
          }}
        />
      )}
    </>
  );
}

/** 可信度 0 到 100：數字為主，旁邊一條細條方便掃視 */
function TrustScore({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-7 text-right tabular-nums", v < 20 ? "font-semibold text-tp-warn-200" : "text-tp-gray-800")}>{value}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-tp-gray-100" aria-hidden>
        <span className={cn("block h-full rounded-full", v < 20 ? "bg-tp-warn-200" : "bg-tp-primary-500")} style={{ width: `${v}%` }} />
      </span>
    </div>
  );
}
