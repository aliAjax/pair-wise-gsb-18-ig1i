import { useState } from "react";
import { AnesthesiaConclusion } from "../domain/types";
import { RunAction, SurgeryBoardService } from "../app/surgeryService";

const ANESTHESIA_OPTIONS: AnesthesiaConclusion[] = ["未评估", "已确认", "禁忌"];

export function RegistrationForm({
  service,
  run,
}: {
  service: SurgeryBoardService;
  run: RunAction;
}) {
  const [patientName, setPatientName] = useState("");
  const [toothNo, setToothNo] = useState("");
  const [imagingDate, setImagingDate] = useState("");
  const [anesthesia, setAnesthesia] = useState<AnesthesiaConclusion>("未评估");

  const submit = () => {
    const result = run(() =>
      service.register({ patientName, toothNo: toothNo.trim(), imagingDate, anesthesia })
    );
    if (result?.ok) {
      setPatientName("");
      setToothNo("");
      setImagingDate("");
      setAnesthesia("未评估");
    }
  };

  return (
    <section className="panel register-panel">
      <div className="section-heading">
        <div>
          <p>牙位登记</p>
          <h2>新根尖手术病例</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>患者姓名</span>
          <input
            value={patientName}
            placeholder="如：张敏"
            onChange={(e) => setPatientName(e.target.value)}
          />
        </label>
        <label>
          <span>牙位（FDI 两位，如 46）</span>
          <input
            value={toothNo}
            placeholder="象限 1-4 + 牙位 1-8"
            maxLength={2}
            onChange={(e) => setToothNo(e.target.value)}
          />
        </label>
        <label>
          <span>术前影像日期（CBCT/根尖片，有效期 30 天）</span>
          <input type="date" value={imagingDate} onChange={(e) => setImagingDate(e.target.value)} />
        </label>
        <label>
          <span>麻醉结论</span>
          <select
            value={anesthesia}
            onChange={(e) => setAnesthesia(e.target.value as AnesthesiaConclusion)}
          >
            {ANESTHESIA_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action" onClick={submit}>
          登记并判定是否可排
        </button>
        <span className="form-hint">
          影像过期或麻醉未确认/禁忌时，登记后自动留在「待排」，不占用显微镜头
        </span>
      </div>
    </section>
  );
}
