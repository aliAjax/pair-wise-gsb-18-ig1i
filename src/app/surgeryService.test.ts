// 编排层测试：判断规则与保存仓储如何协作（端到端业务流）
import { test } from "node:test";
import assert from "node:assert/strict";
import { SurgeryBoardService } from "./surgeryService";
import { RuleError } from "../domain/rules";
import { MemoryRepository } from "../storage/repository";

const TODAY = "2026-09-24";

function newService() {
  const repo = new MemoryRepository();
  const service = new SurgeryBoardService(repo, () => TODAY);
  return { repo, service };
}

// 注册一台资料齐备的病例
function registerReady(service: SurgeryBoardService) {
  return service.register({
    patientName: "张敏",
    toothNo: "46",
    imagingDate: "2026-09-10",
    anesthesia: "已确认",
  });
}

test("登记：资料齐备直接可排；资料不齐进待排并记录原因", () => {
  const { service } = newService();

  const ok = registerReady(service);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.holdReasons, undefined);
  let c = service.list()[0];
  assert.equal(c.status, "待排"); // 登记后仍需手动选时段

  service.register({
    patientName: "李伟",
    toothNo: "21",
    imagingDate: "2026-08-01", // 过期
    anesthesia: "未评估",
  });
  c = service.list().find((x) => x.toothNo === "21")!;
  assert.equal(c.status, "待排");
  assert.deepEqual(c.lastHoldReasons, ["IMAGING_EXPIRED", "ANESTHESIA_UNCONFIRMED"]);
});

test("登记校验：姓名空、牙位非法、日期非法都被拦", () => {
  const { service } = newService();
  assert.throws(() => service.register({ patientName: " ", toothNo: "46", imagingDate: "2026-09-10", anesthesia: "已确认" }), RuleError);
  assert.throws(() => service.register({ patientName: "甲", toothNo: "99", imagingDate: "2026-09-10", anesthesia: "已确认" }), RuleError);
  assert.throws(() => service.register({ patientName: "甲", toothNo: "46", imagingDate: "2026-13-40", anesthesia: "已确认" }), RuleError);
});

test("排程：资料齐备可占用镜号时段，持久化到仓储", () => {
  const { service, repo } = newService();
  registerReady(service);
  const id = service.list()[0].id;

  const r = service.schedule(id, { date: "2026-09-28", period: "上午", microscope: "M1" });
  assert.equal(r.ok, true);
  const c = service.get(id);
  assert.equal(c.status, "已排");
  assert.deepEqual(c.slot, { date: "2026-09-28", period: "上午", microscope: "M1" });
  // 确实落库
  assert.equal(repo.load().cases[0].status, "已排");
});

test("排程：影像过期/麻醉未确认时不抛错但留在待排", () => {
  const { service } = newService();
  service.register({ patientName: "李伟", toothNo: "21", imagingDate: "2026-08-01", anesthesia: "未评估" });
  const id = service.list()[0].id;

  const r = service.schedule(id, { date: "2026-09-28", period: "上午", microscope: "M1" });
  assert.equal(r.ok, false);
  assert.deepEqual(r.holdReasons, ["IMAGING_EXPIRED", "ANESTHESIA_UNCONFIRMED"]);
  const c = service.get(id);
  assert.equal(c.status, "待排");
  assert.equal(c.slot, null); // 没占到时段
});

test("排程：同一显微镜头同一时段第二台被 SLOT_CONFLICT 拦住", () => {
  const { service } = newService();
  registerReady(service);
  service.register({ patientName: "刘洋", toothNo: "47", imagingDate: "2026-09-12", anesthesia: "已确认" });
  const [a, b] = service.list();

  assert.equal(service.schedule(a.id, { date: "2026-09-28", period: "上午", microscope: "M1" }).ok, true);
  assert.throws(
    () => service.schedule(b.id, { date: "2026-09-28", period: "上午", microscope: "M1" }),
    (e: unknown) => e instanceof RuleError && e.code === "SLOT_CONFLICT"
  );
  // b 仍是待排、无时段
  assert.equal(service.get(b.id).status, "待排");
  assert.equal(service.get(b.id).slot, null);

  // 同一天下午或换 M2 可以排
  assert.equal(service.schedule(b.id, { date: "2026-09-28", period: "下午", microscope: "M1" }).ok, true);
});

test("资料补齐后重新排程成功，待排原因清空", () => {
  const { service } = newService();
  service.register({ patientName: "李伟", toothNo: "21", imagingDate: "2026-08-01", anesthesia: "未评估" });
  const id = service.list()[0].id;
  assert.equal(service.schedule(id, { date: "2026-09-28", period: "上午", microscope: "M1" }).ok, false);

  const upd = service.updateRegistration(id, { imagingDate: "2026-09-20", anesthesia: "已确认" });
  assert.deepEqual(upd.holdReasons, []);
  assert.equal(service.schedule(id, { date: "2026-09-28", period: "上午", microscope: "M1" }).ok, true);
  assert.equal(service.get(id).status, "已排");
});

test("取消排程释放时段，随后同同时段可以给另一台", () => {
  const { service } = newService();
  registerReady(service);
  service.register({ patientName: "乙", toothNo: "47", imagingDate: "2026-09-11", anesthesia: "已确认" });
  const [a, b] = service.list();
  const slot = { date: "2026-09-28", period: "上午" as const, microscope: "M1" };
  service.schedule(a.id, slot);
  assert.throws(() => service.schedule(b.id, slot), RuleError);
  service.unschedule(a.id);
  assert.equal(service.get(a.id).status, "待排");
  assert.equal(service.schedule(b.id, slot).ok, true);
});

test("术后补录：三件套落库、进入待复查；标本编号重复被拦且状态不变", () => {
  const { service } = newService();
  registerReady(service);
  service.register({ patientName: "乙", toothNo: "36", imagingDate: "2026-09-11", anesthesia: "已确认" });
  const [a, b] = service.list();
  service.schedule(a.id, { date: "2026-09-25", period: "上午", microscope: "M1" });
  service.schedule(b.id, { date: "2026-09-25", period: "下午", microscope: "M1" });

  const r = service.recordPostOp(a.id, {
    surgeryDate: "2026-09-25",
    resectionLengthMm: 3,
    retrofillMaterial: "MTA",
    specimenNo: "SP-2026-0312",
  });
  assert.equal(r.ok, true);
  assert.equal(service.get(a.id).status, "待复查");
  assert.equal(service.get(a.id).postOp?.specimenNo, "SP-2026-0312");

  // b 用同一个标本号 → 拦住，仍为已排
  assert.throws(
    () =>
      service.recordPostOp(b.id, {
        surgeryDate: "2026-09-25",
        resectionLengthMm: 2.5,
        retrofillMaterial: "iRoot BP Plus",
        specimenNo: "SP-2026-0312",
      }),
    (e: unknown) => e instanceof RuleError && /不能重复/.test(e.message)
  );
  assert.equal(service.get(b.id).status, "已排");
  assert.equal(service.get(b.id).postOp, null);
});

test("术后补录：非法切除长度与空材料被拦", () => {
  const { service } = newService();
  registerReady(service);
  const id = service.list()[0].id;
  service.schedule(id, { date: "2026-09-25", period: "上午", microscope: "M1" });
  assert.throws(() => service.recordPostOp(id, { surgeryDate: "2026-09-25", resectionLengthMm: -1, retrofillMaterial: "MTA", specimenNo: "S1" }), RuleError);
  assert.throws(() => service.recordPostOp(id, { surgeryDate: "2026-09-25", resectionLengthMm: 3, retrofillMaterial: "", specimenNo: "S1" }), RuleError);
});

test("两周复查：骨缺损增大→复诊名单；疼痛缓解且骨缺损缩小→结案", () => {
  const { service } = newService();
  registerReady(service);
  const id = service.list()[0].id;
  service.schedule(id, { date: "2026-09-10", period: "上午", microscope: "M1" });
  service.recordPostOp(id, { surgeryDate: "2026-09-10", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "S1" });

  const bad = service.review(id, { painRelieved: true, boneDefectTrend: "增大" });
  assert.equal(bad.ok, false);
  assert.equal(service.get(id).status, "复诊");
  assert.equal(service.get(id).followUp?.reviewDate, TODAY);

  // 结案后不再占坑：另一台可排同一时段
  const { service: s2 } = newService();
  s2.register({ patientName: "x", toothNo: "11", imagingDate: "2026-09-01", anesthesia: "已确认" });
  const id2 = s2.list()[0].id;
  s2.schedule(id2, { date: "2026-09-10", period: "上午", microscope: "M1" });
  s2.recordPostOp(id2, { surgeryDate: "2026-09-10", resectionLengthMm: 2, retrofillMaterial: "MTA", specimenNo: "S2" });
  assert.equal(s2.review(id2, { painRelieved: true, boneDefectTrend: "缩小" }).ok, true);
  assert.equal(s2.get(id2).status, "已结案");

  s2.register({ patientName: "y", toothNo: "12", imagingDate: "2026-09-02", anesthesia: "已确认" });
  const id3 = s2.list().find((c) => c.toothNo === "12")!.id;
  assert.equal(s2.schedule(id3, { date: "2026-09-10", period: "上午", microscope: "M1" }).ok, true);
});

test("疼痛未缓解单独也足以转入复诊", () => {
  const { service } = newService();
  registerReady(service);
  const id = service.list()[0].id;
  service.schedule(id, { date: "2026-09-10", period: "下午", microscope: "M2" });
  service.recordPostOp(id, { surgeryDate: "2026-09-10", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "S3" });
  service.review(id, { painRelieved: false, boneDefectTrend: "缩小" });
  assert.equal(service.get(id).status, "复诊");
});

test("状态机：未手术不能补录；未复查不能登记结果；复诊结案", () => {
  const { service } = newService();
  registerReady(service);
  const id = service.list()[0].id;
  assert.throws(() => service.recordPostOp(id, { surgeryDate: "2026-09-25", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "S" }), RuleError);

  service.schedule(id, { date: "2026-09-10", period: "上午", microscope: "M1" });
  assert.throws(() => service.review(id, { painRelieved: true, boneDefectTrend: "缩小" }), RuleError);

  service.recordPostOp(id, { surgeryDate: "2026-09-10", resectionLengthMm: 3, retrofillMaterial: "MTA", specimenNo: "S" });
  service.review(id, { painRelieved: false, boneDefectTrend: "不变" });
  assert.equal(service.closeRevisit(id, "再次处理后消退").ok, true);
  assert.equal(service.get(id).status, "已结案");
});
