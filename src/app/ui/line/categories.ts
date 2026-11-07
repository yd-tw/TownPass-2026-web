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
import type { CategoryId, QuestionSummary } from "./api/types";

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

export function questionSystemTag(question: Pick<QuestionSummary, "system_tag" | "category" | "tags">) {
  return question.system_tag ?? (question.category ? categoryLabel(question.category) : question.tags[0] ?? null);
}

export function questionTags(question: Pick<QuestionSummary, "system_tag" | "category" | "tags">) {
  return question.tags.filter((tag) => {
    const label = tag.replace(/^#/, "").trim();
    return label.length > 0 && label !== categoryLabel("uncategorized");
  });
}

export function questionManualTags(question: Pick<QuestionSummary, "system_tag" | "category" | "tags">) {
  const fixed = questionSystemTag(question)?.replace(/^#/, "").trim();
  return questionTags(question).filter((tag) => tag.replace(/^#/, "").trim() !== fixed);
}

export function isUncategorized(question: Pick<QuestionSummary, "system_tag" | "category" | "tags">) {
  return questionSystemTag(question)?.replace(/^#/, "") === categoryLabel("uncategorized");
}

export function needsTagHelp(question: Pick<QuestionSummary, "system_tag" | "category" | "tags">) {
  return questionTags(question).length === 0;
}
