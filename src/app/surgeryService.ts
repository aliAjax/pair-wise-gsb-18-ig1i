// 应用编排层：把判断层规则与保存层仓储接起来。
// 界面只调用本文件的函数，不直接改病例，也不直接碰 localStorage。
// 每个写操作都先做规则校验再落库；违例抛 RuleError，由界面提示。

import {
  BoneDefectTrend,
  BoardData,
  DAY_PERIODS,
  FollowUp,
  PostOpRecord,
  SurgeryCase,
  SurgerySlot,
} from "../domain/types";
import {
  assertCanSchedule,
  evaluateFollowUp,
  isValidISODate,
  isValidToothNo,
  RuleError,
  schedulingHolds,
  validatePostOp,
} from "../domain/rules";
import { CaseRepository, sortCases } from "../storage/repository";

export interface ActionResult {
  ok: boolean;
  message: string;
  /** 排程被留在待排时，附带原因码供界面翻译 */
  holdReasons?: SurgeryCase["lastHoldReasons"];
}

/** 界面执行服务动作的统一入口类型：返回结果或 null（规则违例时） */
export type RunAction = <T extends ActionResult>(fn: () => T) => T | null;

export interface NewCaseInput {
  patientName: string;
  toothNo: string;
  imagingDate: string;
  anesthesia: SurgeryCase["anesthesia"];
}

export class SurgeryBoardService {
  constructor(
    private readonly repo: CaseRepository,
    private readonly clock: () => string = () => todayISO()
  ) {}

  private read(): BoardData {
    return this.repo.load();
  }

  private write(data: BoardData): void {
    data.cases = sortCases(data.cases);
    this.repo.save(data);
  }

  list(): SurgeryCase[] {
    return sortCases(this.read().cases);
  }

  get(id: string): SurgeryCase {
    const found = this.read().cases.find((c) => c.id === id);
    if (!found) throw new RuleError(`找不到病例 ${id}`, "INVALID_STATE");
    return found;
  }

  /** 登记一台新病例：登记时即做一次待排判断；资料不齐直接进待排 */
  register(input: NewCaseInput): ActionResult {
    const name = input.patientName.trim();
    if (!name) throw new RuleError("患者姓名不能为空", "INVALID_FIELD");
    if (!isValidToothNo(input.toothNo))
      throw new RuleError("牙位需为 FDI 两位编号（恒牙象限 1-4 + 牙位 1-8，如 46）", "INVALID_TOOTH");
    if (input.imagingDate && !isValidISODate(input.imagingDate))
      throw new RuleError("影像日期格式不正确（应为 YYYY-MM-DD）", "INVALID_FIELD");

    const today = this.clock();
    const holds = schedulingHolds(input.imagingDate, input.anesthesia, today);
    const now = new Date().toISOString();
    const data = this.read();
    const caseItem: SurgeryCase = {
      id: nextCaseId(data),
      patientName: name,
      toothNo: input.toothNo,
      imagingDate: input.imagingDate,
      anesthesia: input.anesthesia,
      slot: null,
      status: "待排",
      postOp: null,
      followUp: null,
      lastHoldReasons: holds,
      createdAt: now,
      updatedAt: now,
    };
    data.cases.push(caseItem);
    this.write(data);

    return holds.length === 0
      ? { ok: true, message: `牙位 ${input.toothNo} 已登记，资料齐备，可排手术时段` }
      : {
          ok: true,
          holdReasons: holds,
          message: `牙位 ${input.toothNo} 已登记，因资料不齐留在待排`,
        };
  }

  /** 修改登记资料（影像日期 / 麻醉结论），并重算待排原因 */
  updateRegistration(
    id: string,
    patch: Partial<Pick<SurgeryCase, "patientName" | "imagingDate" | "anesthesia">>
  ): ActionResult {
    const data = this.read();
    const c = mustFind(data, id);
    if (c.status === "已结案")
      throw new RuleError("病例已结案，不能再修改登记资料", "INVALID_STATE");

    if (patch.patientName !== undefined) {
      const name = patch.patientName.trim();
      if (!name) throw new RuleError("患者姓名不能为空", "INVALID_FIELD");
      c.patientName = name;
    }
    if (patch.imagingDate !== undefined) {
      if (patch.imagingDate && !isValidISODate(patch.imagingDate))
        throw new RuleError("影像日期格式不正确（应为 YYYY-MM-DD）", "INVALID_FIELD");
      c.imagingDate = patch.imagingDate;
    }
    if (patch.anesthesia !== undefined) c.anesthesia = patch.anesthesia;

    c.lastHoldReasons = schedulingHolds(c.imagingDate, c.anesthesia, this.clock());
    // 已排病例不受影响；待排病例补齐资料后仍需手动选时段排入
    c.updatedAt = new Date().toISOString();
    this.write(data);
    return {
      ok: true,
      holdReasons: c.lastHoldReasons,
      message:
        c.lastHoldReasons.length === 0
          ? "登记资料已更新，待排原因已消除，可以排时段"
          : "登记资料已更新，仍有待排原因未消除",
    };
  }

  /**
   * 排入手术时段：
   * - 资料不齐（影像缺失/过期、麻醉未确认/禁忌）→ 不抛错，留在待排并返回原因；
   * - 同一显微镜头同一时段已有手术 → 抛 SLOT_CONFLICT，由界面拦住。
   */
  schedule(id: string, slot: SurgerySlot): ActionResult {
    if (!isValidISODate(slot.date))
      throw new RuleError("手术日期格式不正确（应为 YYYY-MM-DD）", "INVALID_FIELD");
    if (!DAY_PERIODS.includes(slot.period))
      throw new RuleError("手术时段只能是上午或下午", "INVALID_FIELD");
    if (!slot.microscope.trim())
      throw new RuleError("显微镜头编号不能为空", "INVALID_FIELD");

    const data = this.read();
    const c = mustFind(data, id);
    if (c.status !== "待排" && c.status !== "已排")
      throw new RuleError(`当前状态（${c.status}）不能再排手术时段`, "INVALID_STATE");

    const holds = assertCanSchedule(
      c.imagingDate,
      c.anesthesia,
      slot,
      data.cases,
      c.id,
      this.clock()
    );
    if (holds.length > 0) {
      c.lastHoldReasons = holds;
      c.slot = null;
      c.status = "待排";
      c.updatedAt = new Date().toISOString();
      this.write(data);
      return {
        ok: false,
        holdReasons: holds,
        message: "资料不齐，病例留在待排",
      };
    }

    c.slot = { date: slot.date, period: slot.period, microscope: slot.microscope.trim() };
    c.status = "已排";
    c.lastHoldReasons = [];
    c.updatedAt = new Date().toISOString();
    this.write(data);
    return {
      ok: true,
      message: `已排入 ${slot.microscope} · ${slot.date} ${slot.period}`,
    };
  }

  /** 取消排程（退回待排，释放显微镜头时段） */
  unschedule(id: string): ActionResult {
    const data = this.read();
    const c = mustFind(data, id);
    if (c.status !== "已排")
      throw new RuleError(`只有已排病例可以取消排程（当前：${c.status}）`, "INVALID_STATE");
    c.slot = null;
    c.status = "待排";
    c.lastHoldReasons = schedulingHolds(c.imagingDate, c.anesthesia, this.clock());
    c.updatedAt = new Date().toISOString();
    this.write(data);
    return { ok: true, message: "已取消排程，显微镜头时段已释放" };
  }

  /**
   * 术后补录：根尖切除长度、倒充材料、标本编号。
   * 标本编号重复由判断层拦截（RuleError），状态转为待复查。
   */
  recordPostOp(id: string, postOp: PostOpRecord): ActionResult {
    const data = this.read();
    const c = mustFind(data, id);
    if (c.status !== "已排")
      throw new RuleError(`只有已排病例可以补录术后资料（当前：${c.status}）`, "INVALID_STATE");

    const error = validatePostOp(postOp, data.cases, c.id);
    if (error) throw new RuleError(error, "SPECIMEN_DUPLICATE");

    c.postOp = { ...postOp, retrofillMaterial: postOp.retrofillMaterial.trim(), specimenNo: postOp.specimenNo.trim() };
    c.status = "待复查";
    c.updatedAt = new Date().toISOString();
    this.write(data);
    return { ok: true, message: `术后资料已补录（标本 ${c.postOp.specimenNo}），进入两周复查` };
  }

  /**
   * 两周复查：疼痛未缓解或骨缺损增大 → 复诊名单；否则结案。
   */
  review(
    id: string,
    result: { painRelieved: boolean; boneDefectTrend: BoneDefectTrend; note?: string }
  ): ActionResult {
    const data = this.read();
    const c = mustFind(data, id);
    if (c.status !== "待复查")
      throw new RuleError(`只有待复查病例可以登记复查结果（当前：${c.status}）`, "INVALID_STATE");
    if (!c.postOp) throw new RuleError("缺少术后记录，无法复查", "INVALID_STATE");

    const followUp: FollowUp = {
      reviewDate: this.clock(),
      painRelieved: result.painRelieved,
      boneDefectTrend: result.boneDefectTrend,
      note: result.note?.trim() || undefined,
    };
    const verdict = evaluateFollowUp(followUp);
    c.followUp = followUp;
    c.status = verdict;
    c.updatedAt = new Date().toISOString();
    this.write(data);

    return verdict === "复诊"
      ? { ok: false, message: "疼痛未缓解或骨缺损增大，已转入复诊名单" }
      : { ok: true, message: "复查通过，病例已结案" };
  }

  /** 复诊处理完成（如再次手术后重新进入复查流程，由医生确认后结案） */
  closeRevisit(id: string, note: string): ActionResult {
    const data = this.read();
    const c = mustFind(data, id);
    if (c.status !== "复诊")
      throw new RuleError(`只有复诊名单中的病例可以结案（当前：${c.status}）`, "INVALID_STATE");
    c.status = "已结案";
    if (note.trim()) c.followUp = { ...(c.followUp as FollowUp), note: note.trim() };
    c.updatedAt = new Date().toISOString();
    this.write(data);
    return { ok: true, message: "复诊处理完成，病例已结案" };
  }
}

function mustFind(data: BoardData, id: string): SurgeryCase {
  const c = data.cases.find((item) => item.id === id);
  if (!c) throw new RuleError(`找不到病例 ${id}`, "INVALID_STATE");
  return c;
}

function nextCaseId(data: BoardData): string {
  const max = data.cases.reduce((acc, c) => {
    const n = Number(c.id.replace(/^C-/, ""));
    return Number.isFinite(n) ? Math.max(acc, n) : acc;
  }, 1000);
  return `C-${max + 1}`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
