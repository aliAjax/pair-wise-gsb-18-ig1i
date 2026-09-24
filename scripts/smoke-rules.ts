// 判断层纯函数冒烟测试：node --import tsx 不依赖额外框架时，可直接用 esbuild 转译运行
// 运行：npx tsx scripts/smoke-rules.ts
import assert from "node:assert";
import {
  checkReadiness,
  hasSlotConflict,
  routeAfterReview,
  shouldRouteToFollowup,
  validateOperative,
  validateSchedule,
  expectedReviewDate,
} from "../src/domain/rules";
import { addDaysISO, todayISO } from "../src/domain/dates";
import type { OperativeInput, ScheduleInput, SurgeryCase } from "../src/domain/types";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

function baseCase(over: Partial<SurgeryCase> = {}): SurgeryCase {
  return {
    id: "c1",
    patientName: "张敏",
    toothNo: "#36",
    diagnosis: "慢性根尖周炎",
    imageDate: addDaysISO("2026-09-24", -4),
    anesthesia: "confirmed",
    schedule: null,
    operative: null,
    review: null,
    status: "pending",
    ...over,
  };
}

const TODAY = "2026-09-24";

test("影像 30 天内 + 麻醉已确认 → 可排", () => {
  assert.deepStrictEqual(checkReadiness(baseCase(), TODAY), { ready: true, reasons: [] });
});

test("影像超过 30 天 → 过期留在待排", () => {
  const r = checkReadiness(baseCase({ imageDate: addDaysISO(TODAY, -31) }), TODAY);
  assert.strictEqual(r.ready, false);
  assert.ok(r.reasons.includes("image_expired"));
});

test("影像恰好 30 天 → 仍有效", () => {
  const r = checkReadiness(baseCase({ imageDate: addDaysISO(TODAY, -30) }), TODAY);
  assert.strictEqual(r.ready, true);
});

test("缺影像日期 → 缺有效影像", () => {
  const r = checkReadiness(baseCase({ imageDate: null }), TODAY);
  assert.ok(r.reasons.includes("missing_image"));
});

test("麻醉未确认 → 留滞", () => {
  const r = checkReadiness(baseCase({ anesthesia: "unconfirmed" }), TODAY);
  assert.deepStrictEqual(r.reasons, ["anesthesia_unconfirmed"]);
});

test("影像过期 + 麻醉未确认同时报出", () => {
  const r = checkReadiness(
    baseCase({ imageDate: addDaysISO(TODAY, -60), anesthesia: "unconfirmed" }),
    TODAY
  );
  assert.strictEqual(r.reasons.length, 2);
});

test("同一显微镜同一时段已被占用 → 冲突", () => {
  const other = baseCase({
    id: "c2",
    toothNo: "#11",
    status: "scheduled",
    schedule: { date: "2026-09-25", slot: "AM", microscopeId: "M1" },
  });
  const input: ScheduleInput = { date: "2026-09-25", slot: "AM", microscopeId: "M1" };
  assert.strictEqual(hasSlotConflict(input, [other])?.id, "c2");
  // 换时段 / 换镜头 / 换日期均不冲突
  assert.strictEqual(
    hasSlotConflict({ ...input, slot: "PM" }, [other]),
    null
  );
  assert.strictEqual(
    hasSlotConflict({ ...input, microscopeId: "M2" }, [other]),
    null
  );
  assert.strictEqual(
    hasSlotConflict({ ...input, date: "2026-09-26" }, [other]),
    null
  );
});

test("排程校验：过期/未确认/冲突全部拦截", () => {
  const other = baseCase({
    id: "c2",
    status: "scheduled",
    schedule: { date: "2026-09-25", slot: "AM", microscopeId: "M1" },
  });
  const mine = baseCase({ imageDate: addDaysISO(TODAY, -40), anesthesia: "unconfirmed" });
  const input: ScheduleInput = { date: "2026-09-25", slot: "AM", microscopeId: "M1" };
  const r = validateSchedule(mine, input, [other], TODAY);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("过期")));
  assert.ok(r.errors.some((e) => e.includes("麻醉")));
  assert.ok(r.errors.some((e) => e.includes("已排给")));
});

test("资料齐备且无冲突 → 排程通过", () => {
  const input: ScheduleInput = { date: "2026-09-25", slot: "AM", microscopeId: "M1" };
  const r = validateSchedule(baseCase(), input, [], TODAY);
  assert.strictEqual(r.ok, true);
});

test("手术日期早于今天 → 拦截", () => {
  const input: ScheduleInput = { date: "2026-09-20", slot: "AM", microscopeId: "M1" };
  const r = validateSchedule(baseCase(), input, [], TODAY);
  assert.ok(r.errors.some((e) => e.includes("不能早于今天")));
});

test("标本编号重复 → 拦截", () => {
  const other = baseCase({
    id: "c2",
    status: "operated",
    operative: {
      surgeryDate: "2026-09-10",
      apicoLengthMm: 3,
      retrofillMaterial: "MTA",
      specimenNo: "SP-001",
    },
  });
  const mine = baseCase({
    status: "scheduled",
    schedule: { date: "2026-09-25", slot: "PM", microscopeId: "M1" },
  });
  const input: OperativeInput = {
    apicoLengthMm: 2.5,
    retrofillMaterial: "iRoot BP Plus",
    specimenNo: "SP-001",
  };
  const r = validateOperative(mine, input, [other]);
  assert.ok(r.errors.some((e) => e.includes("编号不能重复")));
});

test("标本编号唯一 + 长度合法 → 术后补录通过", () => {
  const mine = baseCase({
    status: "scheduled",
    schedule: { date: "2026-09-25", slot: "PM", microscopeId: "M1" },
  });
  const r = validateOperative(mine, {
    apicoLengthMm: 3,
    retrofillMaterial: "MTA",
    specimenNo: "SP-999",
  }, []);
  assert.strictEqual(r.ok, true);
});

test("切除长度非正数或超范围 → 拦截", () => {
  const mine = baseCase({ status: "scheduled" });
  assert.strictEqual(
    validateOperative(mine, { apicoLengthMm: 0, retrofillMaterial: "MTA", specimenNo: "X" }, []).ok,
    false
  );
  assert.strictEqual(
    validateOperative(mine, { apicoLengthMm: 25, retrofillMaterial: "MTA", specimenNo: "X" }, []).ok,
    false
  );
});

test("复查：疼痛未缓解 → 复诊名单", () => {
  assert.strictEqual(shouldRouteToFollowup({ painResolved: false, defectChange: "healing" }), true);
  assert.strictEqual(routeAfterReview({ painResolved: false, defectChange: "healing" }), "followup");
});

test("复查：骨缺损增大 → 复诊名单", () => {
  assert.strictEqual(shouldRouteToFollowup({ painResolved: true, defectChange: "enlarged" }), true);
});

test("复查：疼痛缓解且骨缺损未增大 → 通过", () => {
  assert.strictEqual(routeAfterReview({ painResolved: true, defectChange: "healing" }), "reviewed_ok");
  assert.strictEqual(routeAfterReview({ painResolved: true, defectChange: "unchanged" }), "reviewed_ok");
});

test("术后第 14 天为应复查日", () => {
  assert.strictEqual(expectedReviewDate("2026-09-10"), "2026-09-24");
});

test("今天日期为 YYYY-MM-DD", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

console.log(`\n${passed} 项规则测试全部通过`);
