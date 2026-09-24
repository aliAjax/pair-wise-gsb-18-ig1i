// 判断层：全部为纯函数，不含存储与界面逻辑
import { addDaysISO, daysBetween } from "./dates";
import type {
  CaseStatus,
  ReviewInput,
  ReviewRecord,
  ScheduleInput,
  OperativeInput,
  SurgeryCase,
} from "./types";

/** 术前影像有效期：距手术日期不超过 30 天 */
export const IMAGE_MAX_AGE_DAYS = 30;

/** 术后两周复查 */
export const REVIEW_WINDOW_DAYS = 14;

export interface SlotInfo {
  id: "AM" | "PM";
  label: string;
  time: string;
}

export const SLOTS: SlotInfo[] = [
  { id: "AM", label: "上午", time: "08:30–12:00" },
  { id: "PM", label: "下午", time: "13:30–17:00" },
];

export const SLOT_LABEL: Record<"AM" | "PM", string> = {
  AM: "上午 08:30–12:00",
  PM: "下午 13:30–17:00",
};

export const MICROSCOPES: { id: string; label: string }[] = [
  { id: "M1", label: "手术显微镜 M1（一号手术室）" },
  { id: "M2", label: "手术显微镜 M2（二号手术室）" },
];

export const MICROSCOPE_LABEL: Record<string, string> = {
  M1: "M1 一号手术室",
  M2: "M2 二号手术室",
};

export const RETROFILL_MATERIALS = ["MTA", "iRoot BP Plus", "生物陶瓷 CEM", "Super-EBA"];

export type ReadinessReason = "missing_image" | "image_expired" | "anesthesia_unconfirmed";

export interface Readiness {
  ready: boolean;
  reasons: ReadinessReason[];
}

/**
 * 术前资格判断（待排病例为什么留在待排）：
 * - 缺术前影像
 * - 影像距手术参考日（默认今天）超过有效期
 * - 麻醉结论未确认
 */
export function checkReadiness(
  caseItem: SurgeryCase,
  referenceDate: string
): Readiness {
  const reasons: ReadinessReason[] = [];

  if (!caseItem.imageDate) {
    reasons.push("missing_image");
  } else {
    const age = daysBetween(caseItem.imageDate, referenceDate);
    if (age < 0) {
      reasons.push("missing_image"); // 影像日期晚于参考日，视为未有效登记
    } else if (age > IMAGE_MAX_AGE_DAYS) {
      reasons.push("image_expired");
    }
  }

  if (caseItem.anesthesia !== "confirmed") {
    reasons.push("anesthesia_unconfirmed");
  }

  return { ready: reasons.length === 0, reasons };
}

export const READINESS_TEXT: Record<ReadinessReason, string> = {
  missing_image: "缺有效术前影像日期",
  image_expired: `术前影像已过期（超过 ${IMAGE_MAX_AGE_DAYS} 天，需重新拍片）`,
  anesthesia_unconfirmed: "麻醉结论未确认",
};

/** 同一显微镜同一日期同一时段是否已被其他手术占用 */
export function hasSlotConflict(
  input: ScheduleInput,
  cases: SurgeryCase[],
  selfId?: string
): SurgeryCase | null {
  for (const c of cases) {
    if (c.id === selfId) continue;
    if (c.status !== "scheduled" && c.status !== "operated") continue;
    const s = c.schedule;
    if (
      s &&
      s.date === input.date &&
      s.slot === input.slot &&
      s.microscopeId === input.microscopeId
    ) {
      return c;
    }
  }
  return null;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function result(errors: string[]): ValidationResult {
  return { ok: errors.length === 0, errors };
}

/** 排程校验：完整校验通过才允许进入已排程，否则留在待排 */
export function validateSchedule(
  caseItem: SurgeryCase,
  input: ScheduleInput,
  cases: SurgeryCase[],
  today: string
): ValidationResult {
  const errors: string[] = [];

  if (caseItem.status !== "pending") {
    errors.push("只有待排病例可以排程");
  }
  if (!input.date) {
    errors.push("请选择手术日期");
  } else if (daysBetween(today, input.date) < 0) {
    errors.push("手术日期不能早于今天");
  }
  if (!input.slot) errors.push("请选择时段");
  if (!input.microscopeId) errors.push("请选择手术显微镜");

  if (errors.length === 0 && input.date) {
    const readiness = checkReadiness(caseItem, input.date);
    for (const reason of readiness.reasons) errors.push(READINESS_TEXT[reason]);

    const conflict = hasSlotConflict(input, cases, caseItem.id);
    if (conflict) {
      errors.push(
        `${MICROSCOPE_LABEL[input.microscopeId]} ${input.date} ${SLOT_LABEL[input.slot]} 已排给 ${conflict.toothNo}（${conflict.patientName}）`
      );
    }
  }

  return result(errors);
}

/** 术后补录校验：切除长度、倒充材料必填，标本编号全库唯一 */
export function validateOperative(
  caseItem: SurgeryCase,
  input: OperativeInput,
  cases: SurgeryCase[]
): ValidationResult {
  const errors: string[] = [];

  if (caseItem.status !== "scheduled") {
    errors.push("只有已排程病例可以补录术后信息");
  }
  if (!Number.isFinite(input.apicoLengthMm) || input.apicoLengthMm <= 0) {
    errors.push("请填写根尖切除长度（大于 0 的毫米数）");
  } else if (input.apicoLengthMm > 20) {
    errors.push("根尖切除长度超出合理范围（不超过 20 mm）");
  }
  if (!input.retrofillMaterial.trim()) {
    errors.push("请选择倒充材料");
  }

  const specimenNo = input.specimenNo.trim();
  if (!specimenNo) {
    errors.push("请填写标本编号");
  } else {
    const duplicated = cases.find(
      (c) => c.id !== caseItem.id && c.operative?.specimenNo === specimenNo
    );
    if (duplicated) {
      errors.push(
        `标本编号 ${specimenNo} 已被 ${duplicated.toothNo}（${duplicated.patientName}）使用，编号不能重复`
      );
    }
  }

  return result(errors);
}

/**
 * 两周复查分流判断：
 * 疼痛未缓解 或 骨缺损增大 → 转入复诊名单；否则 → 复查通过
 */
export function shouldRouteToFollowup(
  input: Pick<ReviewInput, "painResolved" | "defectChange">
): boolean {
  return !input.painResolved || input.defectChange === "enlarged";
}

export function routeAfterReview(input: Pick<ReviewInput, "painResolved" | "defectChange">): CaseStatus {
  return shouldRouteToFollowup(input) ? "followup" : "reviewed_ok";
}

/** 复查后列入复诊名单的具体原因（界面展示用） */
export function followupReasons(review: ReviewRecord): string[] {
  const reasons: string[] = [];
  if (!review.painResolved) reasons.push("两周复查疼痛未缓解");
  if (review.defectChange === "enlarged") reasons.push("骨缺损较术前增大");
  return reasons;
}

export const DEFECT_CHANGE_TEXT: Record<ReviewRecord["defectChange"], string> = {
  healing: "骨缺损缩小/愈合",
  unchanged: "骨缺损基本稳定",
  enlarged: "骨缺损增大",
};

/** 该病例应复查的日期（术后 14 天） */
export function expectedReviewDate(surgeryDate: string): string {
  return addDaysISO(surgeryDate, REVIEW_WINDOW_DAYS);
}
