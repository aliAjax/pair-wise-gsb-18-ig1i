// 判断层原因码的中文翻译，以及状态徽标文案：界面层专属
import {
  AnesthesiaConclusion,
  BoneDefectTrend,
  CaseStatus,
  HoldReasonCode,
} from "../domain/types";

export const HOLD_REASON_TEXT: Record<HoldReasonCode, string> = {
  IMAGING_MISSING: "缺术前影像日期",
  IMAGING_EXPIRED: "术前影像已过期（超 30 天，需重拍）",
  ANESTHESIA_UNCONFIRMED: "麻醉结论未确认",
  ANESTHESIA_CONTRAINDICATED: "麻醉评估有禁忌",
};

export const STATUS_TEXT: Record<CaseStatus, string> = {
  待排: "待排",
  已排: "已排",
  待复查: "待复查",
  复诊: "复诊名单",
  已结案: "已结案",
};

export const ANESTHESIA_TEXT: Record<AnesthesiaConclusion, string> = {
  未评估: "麻醉未评估",
  已确认: "麻醉已确认",
  禁忌: "麻醉禁忌",
};

export const BONE_TREND_TEXT: Record<BoneDefectTrend, string> = {
  缩小: "骨缺损缩小",
  不变: "骨缺损不变",
  增大: "骨缺损增大",
};

export function holdReasonsText(reasons: HoldReasonCode[]): string[] {
  return reasons.map((r) => HOLD_REASON_TEXT[r]);
}
