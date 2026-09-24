// 判断层规则测试（纯函数）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertCanSchedule,
  daysBetween,
  evaluateFollowUp,
  findSlotConflict,
  isImagingFresh,
  isReviewDue,
  isSpecimenDuplicate,
  isValidToothNo,
  RuleError,
  schedulingHolds,
  validatePostOp,
} from "./rules";
import { SurgeryCase } from "./types";

const TODAY = "2026-09-24";

function makeCase(partial: Partial<SurgeryCase> & Pick<SurgeryCase, "id">): SurgeryCase {
  return {
    patientName: "测试",
    toothNo: "46",
    imagingDate: "2026-09-10",
    anesthesia: "已确认",
    slot: null,
    status: "待排",
    postOp: null,
    followUp: null,
    lastHoldReasons: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...partial,
  };
}

test("FDI 牙位：只接受恒牙象限 1-4 与牙位 1-8", () => {
  assert.equal(isValidToothNo("46"), true);
  assert.equal(isValidToothNo("11"), true);
  assert.equal(isValidToothNo("48"), true);
  assert.equal(isValidToothNo("51"), false); // 乳牙象限
  assert.equal(isValidToothNo("19"), false); // 牙位超界
  assert.equal(isValidToothNo("4"), false);
  assert.equal(isValidToothNo("abc"), false);
});

test("影像 30 天内有效，第 31 天过期；未来日期不算有效", () => {
  assert.equal(isImagingFresh("2026-09-24", TODAY), true); // 当天
  assert.equal(isImagingFresh("2026-08-25", TODAY), true); // 第 30 天
  assert.equal(isImagingFresh("2026-08-24", TODAY), false); // 第 31 天
  assert.equal(isImagingFresh("2026-09-30", TODAY), false); // 未来日期
  assert.equal(daysBetween("2026-09-01", "2026-09-16"), 15);
});

test("排程待排原因：影像缺失/过期、麻醉未评估/禁忌", () => {
  assert.deepEqual(schedulingHolds("2026-09-10", "已确认", TODAY), []);
  assert.deepEqual(schedulingHolds("", "已确认", TODAY), ["IMAGING_MISSING"]);
  assert.deepEqual(schedulingHolds("2026-08-01", "已确认", TODAY), ["IMAGING_EXPIRED"]);
  assert.deepEqual(schedulingHolds("2026-09-10", "未评估", TODAY), ["ANESTHESIA_UNCONFIRMED"]);
  assert.deepEqual(schedulingHolds("2026-09-10", "禁忌", TODAY), ["ANESTHESIA_CONTRAINDICATED"]);
  assert.deepEqual(schedulingHolds("2026-08-01", "禁忌", TODAY), [
    "IMAGING_EXPIRED",
    "ANESTHESIA_CONTRAINDICATED",
  ]);
});

test("同一显微镜头同一日期同一时段冲突；换镜/换时段/换日均不冲突", () => {
  const existing = makeCase({
    id: "C-1",
    status: "已排",
    slot: { date: "2026-09-28", period: "上午", microscope: "M1" },
  });
  const cases = [existing];

  assert.ok(
    findSlotConflict({ date: "2026-09-28", period: "上午", microscope: "M1" }, cases) === existing
  );
  assert.equal(findSlotConflict({ date: "2026-09-28", period: "下午", microscope: "M1" }, cases), null);
  assert.equal(findSlotConflict({ date: "2026-09-28", period: "上午", microscope: "M2" }, cases), null);
  assert.equal(findSlotConflict({ date: "2026-09-29", period: "上午", microscope: "M1" }, cases), null);
  // 忽略自己（重排）
  assert.equal(
    findSlotConflict(
      { date: "2026-09-28", period: "上午", microscope: "M1" },
      cases,
      "C-1"
    ),
    null
  );
});

test("待复查/复诊病例仍占坑；待排与已结案不占坑", () => {
  const slot = { date: "2026-09-28", period: "上午" as const, microscope: "M1" };
  assert.notEqual(findSlotConflict(slot, [makeCase({ id: "a", status: "待复查", slot })]), null);
  assert.notEqual(findSlotConflict(slot, [makeCase({ id: "b", status: "复诊", slot })]), null);
  assert.equal(findSlotConflict(slot, [makeCase({ id: "c", status: "已结案", slot })]), null);
  assert.equal(findSlotConflict(slot, [makeCase({ id: "d", status: "待排" })]), null);
});

test("assertCanSchedule：资料不齐返回原因；资料齐但撞时段抛 SLOT_CONFLICT", () => {
  const slot = { date: "2026-09-28", period: "上午" as const, microscope: "M1" };
  const cases = [makeCase({ id: "C-9", status: "已排", slot })];

  const holds = assertCanSchedule("2026-08-01", "未评估", slot, [], undefined, TODAY);
  assert.equal(holds.length, 2);

  assert.throws(
    () => assertCanSchedule("2026-09-10", "已确认", slot, cases, undefined, TODAY),
    (err: unknown) => err instanceof RuleError && err.code === "SLOT_CONFLICT"
  );

  // 换个空闲镜号可以排
  assert.deepEqual(
    assertCanSchedule(
      "2026-09-10",
      "已确认",
      { ...slot, microscope: "M2" },
      cases,
      undefined,
      TODAY
    ),
    []
  );
});

test("标本编号重复判定（忽略自身、按 trim 比较）", () => {
  const cases = [
    makeCase({ id: "C-1", postOp: { surgeryDate: "2026-09-08", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "SP-001" } }),
  ];
  assert.equal(isSpecimenDuplicate("SP-001", cases), true);
  assert.equal(isSpecimenDuplicate(" SP-001 ", cases), true);
  assert.equal(isSpecimenDuplicate("SP-002", cases), false);
  assert.equal(isSpecimenDuplicate("SP-001", cases, "C-1"), false);
});

test("术后补录校验：数值范围、必填、重复编号", () => {
  const cases = [
    makeCase({ id: "C-1", postOp: { surgeryDate: "2026-09-08", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "SP-001" } }),
  ];
  const base = { surgeryDate: "2026-09-28", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "SP-009" };
  assert.equal(validatePostOp(base, cases), null);
  assert.match(validatePostOp({ ...base, resectionLengthMm: 0 }, cases) ?? "", /大于 0/);
  assert.match(validatePostOp({ ...base, resectionLengthMm: 12 }, cases) ?? "", /合理范围/);
  assert.match(validatePostOp({ ...base, retrofillMaterial: " " }, cases) ?? "", /倒充材料/);
  assert.match(validatePostOp({ ...base, specimenNo: "SP-001" }, cases) ?? "", /不能重复/);
  assert.match(validatePostOp({ ...base, surgeryDate: "bad" }, cases) ?? "", /日期/);
});

test("两周复查结论：疼痛未缓解或骨缺损增大→复诊；都好→结案", () => {
  assert.equal(evaluateFollowUp({ reviewDate: TODAY, painRelieved: false, boneDefectTrend: "缩小" }), "复诊");
  assert.equal(evaluateFollowUp({ reviewDate: TODAY, painRelieved: true, boneDefectTrend: "增大" }), "复诊");
  assert.equal(evaluateFollowUp({ reviewDate: TODAY, painRelieved: false, boneDefectTrend: "增大" }), "复诊");
  assert.equal(evaluateFollowUp({ reviewDate: TODAY, painRelieved: true, boneDefectTrend: "不变" }), "已结案");
  assert.equal(evaluateFollowUp({ reviewDate: TODAY, painRelieved: true, boneDefectTrend: "缩小" }), "已结案");
});

test("复查到期：术后第 14 天可复查", () => {
  assert.equal(isReviewDue("2026-09-10", "2026-09-23"), false);
  assert.equal(isReviewDue("2026-09-10", "2026-09-24"), true);
  assert.equal(isReviewDue("2026-09-10", "2026-10-01"), true);
});
