// 资料层：根尖手术排程与术后随访的数据结构与常量（纯数据，不含判断与保存）

/** 病例在根管看板上的泳道 */
export type CaseStatus =
  | "待排" // 资料不全或被规则留在待排
  | "已排" // 已占用显微镜头时段
  | "待复查" // 已手术，等待两周复查
  | "复诊" // 复查不通过，转入复诊名单
  | "已结案"; // 复查通过

/** 麻醉结论 */
export type AnesthesiaConclusion = "未评估" | "已确认" | "禁忌";

/** 上午 / 下午手术时段 */
export type DayPeriod = "上午" | "下午";

/** 术后两周复查：骨缺损变化趋势 */
export type BoneDefectTrend = "缩小" | "不变" | "增大";

/** 手术时段：同一显微镜头同一日期同一时段只能有一台手术 */
export interface SurgerySlot {
  date: string; // ISO：YYYY-MM-DD
  period: DayPeriod;
  microscope: string; // 显微镜头编号，如 M1
}

/** 术后补录资料 */
export interface PostOpRecord {
  surgeryDate: string; // 实际手术日期 YYYY-MM-DD
  resectionLengthMm: number; // 根尖切除长度（毫米）
  retrofillMaterial: string; // 倒充材料，如 MTA / iRoot BP Plus
  specimenNo: string; // 送检标本编号，全院唯一
}

/** 两周复查结果 */
export interface FollowUp {
  reviewDate: string; // 复查日期 YYYY-MM-DD
  painRelieved: boolean; // 疼痛是否缓解
  boneDefectTrend: BoneDefectTrend; // 骨缺损变化
  note?: string;
}

/** 一台根尖手术病例（按牙位登记） */
export interface SurgeryCase {
  id: string;
  patientName: string;
  toothNo: string; // FDI 两位牙位，如 46
  imagingDate: string; // 术前影像（CBCT/根尖片）日期 YYYY-MM-DD
  anesthesia: AnesthesiaConclusion;
  slot: SurgerySlot | null; // 排入的显微镜头时段
  status: CaseStatus;
  postOp: PostOpRecord | null;
  followUp: FollowUp | null;
  /** 最近一次排程被留在待排的原因码（资料补齐后重排时清空） */
  lastHoldReasons: HoldReasonCode[];
  createdAt: string;
  updatedAt: string;
}

/** 留在待排的原因码（判断层产出，界面层负责翻译成中文提示） */
export type HoldReasonCode =
  | "IMAGING_MISSING"
  | "IMAGING_EXPIRED"
  | "ANESTHESIA_UNCONFIRMED"
  | "ANESTHESIA_CONTRAINDICATED";

/** 保存层读写的整库结构 */
export interface BoardData {
  cases: SurgeryCase[];
}

/** 影像有效期（天）：超过即视为过期，需重拍 */
export const IMAGING_VALID_DAYS = 30;

/** 术后复查周期（天） */
export const REVIEW_DUE_DAYS = 14;

export const STATUS_ORDER: CaseStatus[] = [
  "待排",
  "已排",
  "待复查",
  "复诊",
  "已结案",
];

export const DAY_PERIODS: DayPeriod[] = ["上午", "下午"];
