import {
  CircleHelp,
  FileText,
  Landmark,
  Languages,
  MapPin,
  ShieldAlert,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { META } from "./api/mock-api";
import type { CategoryId } from "./api/types";

/** 分類的圖示與顏色（文字標籤以 GET /meta 為準） */
export const CATEGORY_STYLE: Record<CategoryId, { icon: LucideIcon; color: string }> = {
  map_navigation: { icon: MapPin, color: "#6a9bcc" },
  admin_procedure: { icon: Landmark, color: "#788c5d" },
  document_contract: { icon: FileText, color: "#c6613f" },
  scam_check: { icon: ShieldAlert, color: "#b4442a" },
  app_usage: { icon: Smartphone, color: "#d97757" },
  language: { icon: Languages, color: "#5f7149" },
  other: { icon: CircleHelp, color: "#8a8780" },
};

export function categoryLabel(id: CategoryId) {
  return META.categories.find((c) => c.id === id)?.label ?? "其他";
}
