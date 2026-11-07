import {
  CircleDashed,
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
  map_navigation: { icon: MapPin, color: "#468d9b" },
  admin_procedure: { icon: Landmark, color: "#22474e" },
  document_contract: { icon: FileText, color: "#b07d2c" },
  scam_check: { icon: ShieldAlert, color: "#e5464b" },
  app_usage: { icon: Smartphone, color: "#e6692c" },
  language: { icon: Languages, color: "#356c77" },
  other: { icon: CircleHelp, color: "#738995" },
  uncategorized: { icon: CircleDashed, color: "#738995" },
};

export function categoryLabel(id: CategoryId) {
  return META.categories.find((c) => c.id === id)?.label ?? "其他";
}
