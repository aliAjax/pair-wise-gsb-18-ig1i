// 界面层：排程、术后补录、两周复查三类操作表单（只负责采集输入与展示校验结果）
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { todayISO } from "../domain/dates";
import {
  MICROSCOPES,
  RETROFILL_MATERIALS,
  SLOTS,
  expectedReviewDate,
} from "../domain/rules";
import type {
  DefectChange,
  OperativeInput,
  ReviewInput,
  ScheduleInput,
  SurgeryCase,
} from "../domain/types";
import type { ActionResult } from "../application/useCases";
import { previewConflict } from "../application/selectors";

export function ErrorBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="form-errors" role="alert">
      {errors.map((e) => (
        <p key={e}>⛔ {e}</p>
      ))}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span>
        {label}
        {required && <em>*</em>}
      </span>
      {children}
    </label>
  );
}

// ---------------- 排程 ----------------

export function ScheduleForm({
  caseItem,
  allCases,
  onSubmit,
  onCancel,
}: {
  caseItem: SurgeryCase;
  allCases: SurgeryCase[];
  onSubmit: (input: ScheduleInput) => ActionResult;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState<"AM" | "PM">("AM");
  const [microscopeId, setMicroscopeId] = useState("M1");
  const [errors, setErrors] = useState<string[]>([]);

  const input = useMemo(
    () => ({ date, slot, microscopeId }),
    [date, slot, microscopeId]
  );
  const conflict = previewConflict(allCases, input);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = onSubmit(input);
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setErrors([]);
      onCancel();
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <ErrorBanner errors={errors} />
      <div className="form-grid">
        <Field label="手术日期" required>
          <input
            type="date"
            value={date}
            min={todayISO()}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="时段" required>
          <select value={slot} onChange={(e) => setSlot(e.target.value as "AM" | "PM")}>
            {SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}（{s.time}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="手术显微镜" required>
          <select
            value={microscopeId}
            onChange={(e) => setMicroscopeId(e.target.value)}
          >
            {MICROSCOPES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {conflict && (
        <p className="conflict-hint">
          ⚠ 该镜头该时段已排：{conflict.toothNo} {conflict.patientName}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary-action small">
          确认排程
        </button>
        <button type="button" className="ghost small" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

// ---------------- 术后补录 ----------------

export function OperativeForm({
  caseItem,
  onSubmit,
  onCancel,
}: {
  caseItem: SurgeryCase;
  onSubmit: (input: OperativeInput) => ActionResult;
  onCancel: () => void;
}) {
  const [length, setLength] = useState("");
  const [material, setMaterial] = useState(RETROFILL_MATERIALS[0]);
  const [specimenNo, setSpecimenNo] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = onSubmit({
      apicoLengthMm: Number(length),
      retrofillMaterial: material,
      specimenNo,
    });
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setErrors([]);
      onCancel();
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <ErrorBanner errors={errors} />
      <div className="form-grid">
        <Field label="根尖切除长度（mm）" required>
          <input
            type="number"
            step="0.1"
            min="0.1"
            max="20"
            placeholder="如 3.0"
            value={length}
            onChange={(e) => setLength(e.target.value)}
          />
        </Field>
        <Field label="倒充材料" required>
          <select value={material} onChange={(e) => setMaterial(e.target.value)}>
            {RETROFILL_MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="标本编号" required>
          <input
            placeholder="如 SP-20260924-36"
            value={specimenNo}
            onChange={(e) => setSpecimenNo(e.target.value)}
          />
        </Field>
      </div>
      <p className="form-tip">
        手术日期取自排程：{caseItem.schedule?.date ?? "—"}。标本编号全库唯一，重复将被拦截。
      </p>
      <div className="form-actions">
        <button type="submit" className="primary-action small">
          保存术后记录
        </button>
        <button type="button" className="ghost small" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}

// ---------------- 两周复查 ----------------

export function ReviewForm({
  caseItem,
  onSubmit,
  onCancel,
}: {
  caseItem: SurgeryCase;
  onSubmit: (input: ReviewInput) => ActionResult;
  onCancel: () => void;
}) {
  const surgeryDate = caseItem.operative?.surgeryDate ?? todayISO();
  const suggested = expectedReviewDate(surgeryDate);
  const [reviewedAt, setReviewedAt] = useState(suggested);
  const [painResolved, setPainResolved] = useState(true);
  const [defectChange, setDefectChange] = useState<DefectChange>("healing");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const toFollowup = !painResolved || defectChange === "enlarged";

  useEffect(() => {
    setErrors([]);
  }, [painResolved, defectChange]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = onSubmit({ reviewedAt, painResolved, defectChange, notes });
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setErrors([]);
      onCancel();
    }
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      <ErrorBanner errors={errors} />
      <div className="form-grid">
        <Field label="复查日期" required>
          <input
            type="date"
            value={reviewedAt}
            min={surgeryDate}
            onChange={(e) => setReviewedAt(e.target.value)}
          />
        </Field>
        <Field label="疼痛是否缓解" required>
          <select
            value={painResolved ? "yes" : "no"}
            onChange={(e) => setPainResolved(e.target.value === "yes")}
          >
            <option value="yes">疼痛已缓解</option>
            <option value="no">疼痛未缓解</option>
          </select>
        </Field>
        <Field label="骨缺损变化（对比术前影像）" required>
          <select
            value={defectChange}
            onChange={(e) => setDefectChange(e.target.value as DefectChange)}
          >
            <option value="healing">缩小 / 愈合中</option>
            <option value="unchanged">基本稳定</option>
            <option value="enlarged">增大</option>
          </select>
        </Field>
        <Field label="复查备注">
          <input
            placeholder="体征、影像、医嘱"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <p className={toFollowup ? "routing-hint danger" : "routing-hint ok"}>
        {toFollowup
          ? "⚠ 满足复诊条件（疼痛未缓解或骨缺损增大），保存后转入复诊名单"
          : "✓ 复查通过，保存后进入复查通过列"}
      </p>
      <div className="form-actions">
        <button type="submit" className="primary-action small">
          保存复查结果
        </button>
        <button type="button" className="ghost small" onClick={onCancel}>
          取消
        </button>
      </div>
    </form>
  );
}
