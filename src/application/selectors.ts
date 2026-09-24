// 应用层：看板派生数据（纯计算，供界面直接使用）
import { todayISO } from "../domain/dates";
import { checkReadiness, hasSlotConflict } from "../domain/rules";
import type { CaseStatus, ScheduleInput, SurgeryCase } from "../domain/types";

export interface BoardColumn {
  status: CaseStatus;
  title: string;
  hint: string;
  cases: SurgeryCase[];
}

export const COLUMN_SPEC: { status: CaseStatus; title: string; hint: string }[] = [
  { status: "pending", title: "待排", hint: "影像过期或麻醉未确认时留在此列" },
  { status: "scheduled", title: "已排程", hint: "等待手术" },
  { status: "operated", title: "已手术", hint: "等待术后两周复查" },
  { status: "reviewed_ok", title: "复查通过", hint: "疼痛缓解、骨缺损未增大" },
  { status: "followup", title: "复诊名单", hint: "疼痛未缓解或骨缺损增大" },
];

const STATUS_ORDER: Record<CaseStatus, number> = {
  pending: 0,
  scheduled: 1,
  operated: 2,
  reviewed_ok: 3,
  followup: 4,
};

/** 按状态分列，列内按登记信息/日期排序 */
export function buildColumns(cases: SurgeryCase[]): BoardColumn[] {
  const today = todayISO();
  return COLUMN_SPEC.map((spec) => ({
    ...spec,
    cases: cases
      .filter((c) => c.status === spec.status)
      .sort((a, b) => sortKey(a, today).localeCompare(sortKey(b, today))),
  }));
}

function sortKey(c: SurgeryCase, today: string): string {
  if (c.schedule) return c.schedule.date + c.schedule.slot;
  if (c.operative) return c.operative.surgeryDate;
  if (c.review) return c.review.reviewedAt;
  return c.imageDate ?? today;
}

export interface BoardMetrics {
  pending: number;
  scheduled: number;
  operated: number;
  followup: number;
}

export function buildMetrics(cases: SurgeryCase[]): BoardMetrics {
  const count = (s: CaseStatus) => cases.filter((c) => c.status === s).length;
  return {
    pending: count("pending"),
    scheduled: count("scheduled"),
    operated: count("operated"),
    followup: count("followup"),
  };
}

/** 待排病例当前的留滞原因 */
export function pendingBlockers(
  caseItem: SurgeryCase
): ReturnType<typeof checkReadiness> {
  return checkReadiness(caseItem, todayISO());
}

/** 该排程选择目前会与哪台已排/已手术病例冲突（界面实时提示） */
export function previewConflict(
  cases: SurgeryCase[],
  input: ScheduleInput | null
): SurgeryCase | null {
  if (!input || !input.date || !input.slot || !input.microscopeId) return null;
  return hasSlotConflict(input, cases);
}

export function statusRank(status: CaseStatus): number {
  return STATUS_ORDER[status];
}
