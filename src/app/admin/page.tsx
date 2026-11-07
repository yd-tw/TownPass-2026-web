import type { Metadata } from "next";
import AdminApp from "./admin-app";

export const metadata: Metadata = {
  title: "論壇管理後台",
  description: "城市通論壇的管理後台：頁面問題分析、內容管理、待處理事項、使用者與稽核紀錄",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminApp />;
}
