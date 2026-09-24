// 判断层：纯函数业务规则，不读写存储、不触碰界面
// 规则：
// 1) 同一显微镜头同一日期同一时段只接一台手术；
// 2) 影像缺失/过期或麻醉未确认（或有禁忌）时留在待排；
// 3) 术后标本编号不可重复；
// 4) 两周复查疼痛未缓解或骨缺损增大，转入复诊名单，否则结案。

import {
  AnesthesiaConclusion,
  FollowUp,
  HoldReasonCode,
  IMAGING_VALID_DAYS,
  PostOpRecord,
  REVIEW_DUE_DAYS,
  SurgeryCase,
  SurgerySlot,
} from "./types";

/** 业务规则违例：界面层捕获后提示，编排层不产生脏状态 */
export class RuleError extends Error {
  constructor(
    message: string,
    readonly code:
      | "SLOT_CONFLICT"
      | "SPECIMEN_DUPLICATE"
      | "INVALID_TOOTH"
      | "INVALID_FIELD"
      | "INVALID_STATE"
  ) {
    super(message);
    this.name = "RuleError";
  }
}

/** 两个时段是否指向同一显微镜头的同一时段（冲突判定的唯一依据） */
export function sameSlot(a: SurgerySlot, b: SurgerySlot): boolean {
  return (
    a.date === b.date &&
    a.period === b.period &&
    a.microscope === b.microscope
  );
}

/**
 * 校验 FDI 两位牙位：象限 1-4（恒牙），牙位 1-8
 * 乳牙（5-8）根尖手术不适用，这里只接恒牙。
 */
export function isValidToothNo(toothNo: string): boolean {
  if (!/^[1-4][1-8]$/.test(toothNo)) return false;
  return true;
}

/** 校验 ISO 日期 YYYY-MM-DD */
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** 两个日历日相差的天数（b - a，按本地零点计） */
export function daysBetween(fromISO: string, toISO: string): number {
  const ms =
    new Date(toISO + "T00:00:00").getTime() -
    new Date(fromISO + "T00:00:00").getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * 影像是否在有效期内（拍摄日当天算第 0 天，第 IMAGING_VALID_DAYS 天仍有效）
 */
export function isImagingFresh(imagingDate: string, todayISO: string): boolean {
  if (!isValidISODate(imagingDate)) return false;
  const age = daysBetween(imagingDate, todayISO);
  return age >= 0 && age <= IMAGING_VALID_DAYS;
}

/**
 * 排入手术前的"待排原因"检查。
 * 返回空数组表示资料齐备可排；非空则病例必须留在待排。
 */
export function schedulingHolds(
  imagingDate: string,
  anesthesia: AnesthesiaConclusion,
  todayISO: string
): HoldReasonCode[] {
  const reasons: HoldReasonCode[] = [];

  if (!imagingDate) {
    reasons.push("IMAGING_MISSING");
  } else if (!isImagingFresh(imagingDate, todayISO)) {
    reasons.push("IMAGING_EXPIRED");
  }

  if (anesthesia === "未评估") {
    reasons.push("ANESTHESIA_UNCONFIRMED");
  } else if (anesthesia === "禁忌") {
    reasons.push("ANESTHESIA_CONTRAINDICATED");
  }

  return reasons;
}

/** 占用显微镜头时段的病例（已排或已手术但尚未结案的，都继续占坑） */
export function occupiesSlot(c: SurgeryCase): boolean {
  return c.slot !== null && (c.status === "已排" || c.status === "待复查" || c.status === "复诊");
}

/**
 * 时段冲突检查：同一显微镜头同一时段只能一台。
 * ignoreId 用于病例自身（重排时跳过自己）。
 */
export function findSlotConflict(
  slot: SurgerySlot,
  cases: SurgeryCase[],
  ignoreId?: string
): SurgeryCase | null {
  return (
    cases.find(
      (c) =>
        c.id !== ignoreId && occupiesSlot(c) && c.slot !== null && sameSlot(c.slot, slot)
    ) ?? null
  );
}

/** 完整的排程准入判断：返回待排原因（空=可排），冲突单独抛错 */
export function assertCanSchedule(
  imagingDate: string,
  anesthesia: AnesthesiaConclusion,
  slot: SurgerySlot,
  cases: SurgeryCase[],
  ignoreId: string | undefined,
  todayISO: string
): HoldReasonCode[] {
  const holds = schedulingHolds(imagingDate, anesthesia, todayISO);
  if (holds.length > 0) return holds;

  if (!isValidISODate(slot.date)) {
    throw new RuleError("手术日期格式不正确（应为 YYYY-MM-DD）", "INVALID_FIELD");
  }
  const conflict = findSlotConflict(slot, cases, ignoreId);
  if (conflict) {
    throw new RuleError(
      `显微镜头 ${slot.microscope} ${slot.date} ${slot.period} 已安排牙位 ${conflict.toothNo}（${conflict.patientName}），同一时段只能一台手术`,
      "SLOT_CONFLICT"
    );
  }
  return [];
}

/** 标本编号查重（空串也算未录；调用方先做必填校验） */
export function isSpecimenDuplicate(
  specimenNo: string,
  cases: SurgeryCase[],
  ignoreId?: string
): boolean {
  const key = specimenNo.trim();
  return cases.some(
    (c) => c.id !== ignoreId && c.postOp !== null && c.postOp.specimenNo.trim() === key
  );
}

/** 术后补录校验：必填、数值范围、标本号唯一 */
export function validatePostOp(
  postOp: PostOpRecord,
  cases: SurgeryCase[],
  ignoreId?: string
): string | null {
  if (!isValidISODate(postOp.surgeryDate)) return "手术日期格式不正确（应为 YYYY-MM-DD）";
  if (!Number.isFinite(postOp.resectionLengthMm) || postOp.resectionLengthMm <= 0)
    return "根尖切除长度必须为大于 0 的数值（mm）";
  if (postOp.resectionLengthMm > 10) return "根尖切除长度超出合理范围（上限 10mm），请核对";
  if (!postOp.retrofillMaterial.trim()) return "倒充材料不能为空";
  if (!postOp.specimenNo.trim()) return "标本编号不能为空";
  if (isSpecimenDuplicate(postOp.specimenNo, cases, ignoreId))
    return `标本编号 ${postOp.specimenNo} 已被其他病例使用，编号不能重复`;
  return null;
}

/**
 * 两周复查结论：
 * 疼痛未缓解 或 骨缺损增大 → 复诊名单；
 * 两者都通过（疼痛缓解且骨缺损不增大）→ 结案。
 */
export function evaluateFollowUp(followUp: FollowUp): "复诊" | "已结案" {
  if (!followUp.painRelieved) return "复诊";
  if (followUp.boneDefectTrend === "增大") return "复诊";
  return "已结案";
}

/** 是否到两周复查日（到第 14 天即可复查） */
export function isReviewDue(surgeryDateISO: string, todayISO: string): boolean {
  return daysBetween(surgeryDateISO, todayISO) >= REVIEW_DUE_DAYS;
}

/** 距离应复查日的天数（负数=还差几天，0=今天） */
export function daysUntilReview(surgeryDateISO: string, todayISO: string): number {
  return daysBetween(surgeryDateISO, todayISO) - REVIEW_DUE_DAYS;
}
