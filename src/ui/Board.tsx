// 界面层：五列看板、牙位登记弹窗、显微镜时段占用表
import { useMemo, useState, type FormEvent } from "react";
import { todayISO } from "../domain/dates";
import { MICROSCOPES, MICROSCOPE_LABEL, SLOT_LABEL } from "../domain/rules";
import type {
  AnesthesiaStatus,
  RegisterInput,
  Schedule,
  SurgeryCase,
} from "../domain/types";
import type { ActionResult } from "../application/useCases";
import type { BoardColumn } from "../application/selectors";
import { CaseCard, type CaseActions } from "./CaseCard";
import { ErrorBanner } from "./forms";

// ---------------- 牙位登记弹窗 ----------------

function RegisterModal({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: RegisterInput) => ActionResult;
  onClose: () => void;
}) {
  const [patientName, setPatientName] = useState("");
  const [toothNo, setToothNo] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [imageDate, setImageDate] = useState<string>("");
  const [anesthesia, setAnesthesia] = useState<AnesthesiaStatus>("unconfirmed");
  const [errors, setErrors] = useState<string[]>([]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = onSubmit({
      patientName,
      toothNo,
      diagnosis,
      imageDate: imageDate || null,
      anesthesia,
    });
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>牙位登记</h2>
          <button className="ghost small" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <form onSubmit={submit}>
          <ErrorBanner errors={errors} />
          <div className="form-grid">
            <label className="form-field">
              <span>
                牙位<em>*</em>
              </span>
              <input placeholder="如 #36" value={toothNo} onChange={(e) => setToothNo(e.target.value)} />
            </label>
            <label className="form-field">
              <span>
                患者姓名<em>*</em>
              </span>
              <input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
            </label>
            <label className="form-field wide">
              <span>
                诊断<em>*</em>
              </span>
              <input
                placeholder="如 慢性根尖周炎"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>术前影像日期</span>
              <input
                type="date"
                max={todayISO()}
                value={imageDate}
                onChange={(e) => setImageDate(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>麻醉结论</span>
              <select
                value={anesthesia}
                onChange={(e) => setAnesthesia(e.target.value as AnesthesiaStatus)}
              >
                <option value="unconfirmed">未确认</option>
                <option value="confirmed">已确认</option>
              </select>
            </label>
          </div>
          <p className="form-tip">
            影像超过 30 天或麻醉未确认时，病例会留在「待排」列，无法排入手术时段。
          </p>
          <div className="form-actions">
            <button type="submit" className="primary-action">
              登记入待排
            </button>
            <button type="button" className="ghost" onClick={onClose}>
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------- 显微镜时段占用表 ----------------

interface SlotOccupancy {
  date: string;
  slot: Schedule["slot"];
  microscopeId: string;
  caseItem: SurgeryCase;
}

function MicroscopeAgenda({ cases }: { cases: SurgeryCase[] }) {
  const today = todayISO();
  const occupancy: SlotOccupancy[] = useMemo(() => {
    return cases
      .filter(
        (c) =>
          c.schedule &&
          (c.status === "scheduled" || c.status === "operated") &&
          c.schedule.date >= today
      )
      .map((c) => ({
        date: c.schedule!.date,
        slot: c.schedule!.slot,
        microscopeId: c.schedule!.microscopeId,
        caseItem: c,
      }))
      .sort((a, b) =>
        a.date === b.date
          ? a.slot.localeCompare(b.slot)
          : a.date.localeCompare(b.date)
      );
  }, [cases, today]);

  const dates = [...new Set(occupancy.map((o) => o.date))].sort();

  return (
    <section className="panel agenda-panel">
      <div className="section-heading">
        <div>
          <p>手术显微镜时段表</p>
          <h2>同一镜头同一时段只接一台手术</h2>
        </div>
        <span className="agenda-legend">上午 08:30–12:00 · 下午 13:30–17:00</span>
      </div>
      {dates.length === 0 ? (
        <p className="empty-note">近期暂无已排手术。</p>
      ) : (
        <div className="agenda-scroll">
          <table className="agenda-table">
            <thead>
              <tr>
                <th>日期</th>
                {MICROSCOPES.flatMap((m) =>
                  (["AM", "PM"] as const).map((slot) => (
                    <th key={m.id + slot}>
                      {MICROSCOPE_LABEL[m.id]} · {SLOT_LABEL[slot].split(" ")[0]}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {dates.map((date) => (
                <tr key={date}>
                  <td className="agenda-date">{date}</td>
                  {MICROSCOPES.flatMap((m) =>
                    (["AM", "PM"] as const).map((slot) => {
                      const hit = occupancy.find(
                        (o) => o.date === date && o.microscopeId === m.id && o.slot === slot
                      );
                      return (
                        <td key={m.id + slot} className={hit ? "cell-booked" : "cell-free"}>
                          {hit ? (
                            <span>
                              <strong>
                                {hit.caseItem.toothNo} {hit.caseItem.patientName}
                              </strong>
                              <small>{hit.caseItem.diagnosis}</small>
                            </span>
                          ) : (
                            <span className="cell-free-label">空闲</span>
                          )}
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------- 五列看板 ----------------

export function Board({
  columns,
  cases,
  actions,
  query,
  registerOpen,
  onRegister,
  onRegisterClose,
  resetDemo,
}: {
  columns: BoardColumn[];
  cases: SurgeryCase[];
  actions: CaseActions;
  query: string;
  registerOpen: boolean;
  onRegister: (input: RegisterInput) => ActionResult;
  onRegisterClose: () => void;
  resetDemo: () => void;
}) {
  const q = query.trim().toLowerCase();

  const filtered = q
    ? columns.map((col) => ({
        ...col,
        cases: col.cases.filter(
          (c) =>
            c.toothNo.toLowerCase().includes(q) ||
            c.patientName.toLowerCase().includes(q) ||
            c.diagnosis.toLowerCase().includes(q) ||
            c.operative?.specimenNo.toLowerCase().includes(q)
        ),
      }))
    : columns;

  return (
    <>
      <MicroscopeAgenda cases={cases} />

      <section className="kanban">
        {filtered.map((column) => (
          <section key={column.status} className={`kanban-column status-${column.status}`}>
            <header className="kanban-head">
              <h2>{column.title}</h2>
              <span className="kanban-count">{column.cases.length}</span>
            </header>
            <p className="kanban-hint">{column.hint}</p>
            <div className="kanban-cards">
              {column.cases.length === 0 && <p className="column-empty">暂无病例</p>}
              {column.cases.map((c) => (
                <CaseCard key={c.id} caseItem={c} allCases={cases} actions={actions} />
              ))}
            </div>
          </section>
        ))}
      </section>

      <div className="demo-tools">
        <button className="ghost small" onClick={resetDemo}>
          恢复示例数据
        </button>
      </div>

      {registerOpen && (
        <RegisterModal onSubmit={onRegister} onClose={onRegisterClose} />
      )}
    </>
  );
}
