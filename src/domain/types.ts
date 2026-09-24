// 资料层：根尖手术看板的数据结构定义（只描述数据，不含任何业务判断）

/** 麻醉结论：未确认 / 已确认 */
export type AnesthesiaStatus = "unconfirmed" | "confirmed";

/** 显微镜头时段：上午 / 下午（同一显微镜每一时段只接一台手术） */
export type SlotId = "AM" | "PM";

/** 两周复查骨缺损变化 */
export type DefectChange = "healing" | "unchanged" | "enlarged";

/** 病例流转状态：待排 → 已排程 → 已手术 → 复查通过 / 复诊名单 */
export type CaseStatus =
  | "pending"
  | "scheduled"
  | "operated"
  | "reviewed_ok"
  | "followup";

/** 排程信息：手术日期、时段、显微镜头 */
export interface Schedule {
  date: string; // YYYY-MM-DD
  slot: SlotId;
  microscopeId: string; // M1 / M2
}

/** 术后补录：根尖切除长度、倒充材料、标本编号 */
export interface OperativeRecord {
  surgeryDate: string; // 取自排程日期
  apicoLengthMm: number; // 根尖切除长度（mm）
  retrofillMaterial: string; // 倒充材料
  specimenNo: string; // 标本编号（全库唯一）
}

/** 两周复查记录 */
export interface ReviewRecord {
  reviewedAt: string;
  painResolved: boolean; // 疼痛是否已缓解
  defectChange: DefectChange; // 骨缺损变化
  notes: string;
}

/** 一台根尖手术病例的完整资料 */
export interface SurgeryCase {
  id: string;
  patientName: string;
  toothNo: string; // 牙位，如 #36
  diagnosis: string;
  imageDate: string | null; // 术前影像日期
  anesthesia: AnesthesiaStatus; // 麻醉结论
  schedule: Schedule | null;
  operative: OperativeRecord | null;
  review: ReviewRecord | null;
  status: CaseStatus;
}

export interface RegisterInput {
  patientName: string;
  toothNo: string;
  diagnosis: string;
  imageDate: string | null;
  anesthesia: AnesthesiaStatus;
}

export interface ScheduleInput {
  date: string;
  slot: SlotId;
  microscopeId: string;
}

export interface OperativeInput {
  apicoLengthMm: number;
  retrofillMaterial: string;
  specimenNo: string;
}

export interface ReviewInput {
  reviewedAt: string;
  painResolved: boolean;
  defectChange: DefectChange;
  notes: string;
}
