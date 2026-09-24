import { useState } from "react";
import {
  BoneDefectTrend,
  DayPeriod,
  SurgeryCase,
} from "../domain/types";
import {
  daysUntilReview,
  isImagingFresh,
} from "../domain/rules";
import { RunAction, SurgeryBoardService, todayISO } from "../app/surgeryService";
import {
  ANESTHESIA_TEXT,
  BONE_TREND_TEXT,
  holdReasonsText,
} from "./labels";

const MICROSCOPES = ["M1", "M2"];
const PERIODS: DayPeriod[] = ["上午", "下午"];
const BONE_TRENDS: BoneDefectTrend[] = ["缩小", "不变", "增大"];

export function CaseCard({
  c,
  service,
  run,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
}) {
  const today = todayISO();
  const fresh = c.imagingDate ? isImagingFresh(c.imagingDate, today) : false;
  const holds = holdReasonsText(c.lastHoldReasons);

  return (
    <article className={`case-card case-${toneOf(c.status)}`}>
      <header className="case-head">
        <div className="case-tooth">{c.toothNo}</div>
        <div className="case-id">
          <strong>{c.patientName}</strong>
          <span>{c.id}</span>
        </div>
        <span className={`status-badge badge-${toneOf(c.status)}`}>{c.status}</span>
      </header>

      <dl className="case-facts">
        <div>
          <dt>术前影像</dt>
          <dd className={fresh ? "" : "fact-bad"}>
            {c.imagingDate || "未登记"}
            {c.imagingDate && (fresh ? " · 有效" : " · 已过期")}
          </dd>
        </div>
        <div>
          <dt>麻醉结论</dt>
          <dd className={c.anesthesia === "已确认" ? "" : "fact-bad"}>
            {ANESTHESIA_TEXT[c.anesthesia]}
          </dd>
        </div>
        <div>
          <dt>显微镜头时段</dt>
          <dd>
            {c.slot
              ? `${c.slot.microscope} · ${c.slot.date} ${c.slot.period}`
              : "未安排"}
          </dd>
        </div>
      </dl>

      {holds.length > 0 && (
        <ul className="hold-list">
          {holds.map((h) => (
            <li key={h}>⛔ {h}</li>
          ))}
        </ul>
      )}

      {c.postOp && (
        <dl className="case-facts postop">
          <div>
            <dt>根尖切除</dt>
            <dd>{c.postOp.resectionLengthMm} mm</dd>
          </div>
          <div>
            <dt>倒充材料</dt>
            <dd>{c.postOp.retrofillMaterial}</dd>
          </div>
          <div>
            <dt>标本编号</dt>
            <dd>{c.postOp.specimenNo}</dd>
          </div>
        </dl>
      )}

      {c.status === "待复查" && c.postOp && (
        <ReviewHint surgeryDate={c.postOp.surgeryDate} today={today} />
      )}

      {c.followUp && (
        <p className="followup-note">
          复查（{c.followUp.reviewDate}）：
          {c.followUp.painRelieved ? "疼痛已缓解" : "疼痛未缓解"} ·{" "}
          {BONE_TREND_TEXT[c.followUp.boneDefectTrend]}
          {c.followUp.note ? ` · ${c.followUp.note}` : ""}
        </p>
      )}

      <CaseActions c={c} service={service} run={run} />
    </article>
  );
}

function ReviewHint({ surgeryDate, today }: { surgeryDate: string; today: string }) {
  const d = daysUntilReview(surgeryDate, today);
  return (
    <p className={`review-hint ${d >= 0 ? "due" : ""}`}>
      {d > 0
        ? `术后第 ${14 - d > 0 ? 14 - d : 0} 天，满两周复查还需 ${d} 天`
        : d === 0
        ? "今天满两周，请登记复查结果"
        : `已超过复查日 ${-d} 天，请尽快登记复查结果`}
    </p>
  );
}

function CaseActions({
  c,
  service,
  run,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
}) {
  const [mode, setMode] = useState<"none" | "edit" | "schedule" | "postop" | "review">("none");

  if (c.status === "待排") {
    return (
      <div className="case-actions">
        {mode === "edit" && (
          <EditRegistration c={c} service={service} run={run} onDone={() => setMode("none")} />
        )}
        {mode === "schedule" && (
          <ScheduleForm c={c} service={service} run={run} onDone={() => setMode("none")} />
        )}
        {mode === "none" && (
          <div className="btn-row">
            <button onClick={() => setMode("edit")}>补/改影像与麻醉</button>
            <button className="primary-action" onClick={() => setMode("schedule")}>
              排手术时段
            </button>
          </div>
        )}
      </div>
    );
  }

  if (c.status === "已排") {
    return (
      <div className="case-actions">
        {mode === "postop" ? (
          <PostOpForm c={c} service={service} run={run} onDone={() => setMode("none")} />
        ) : (
          <div className="btn-row">
            <button onClick={() => run(() => service.unschedule(c.id))}>取消排程</button>
            <button className="primary-action" onClick={() => setMode("postop")}>
              术后补录
            </button>
          </div>
        )}
      </div>
    );
  }

  if (c.status === "待复查") {
    return (
      <div className="case-actions">
        {mode === "review" ? (
          <ReviewForm c={c} service={service} run={run} onDone={() => setMode("none")} />
        ) : (
          <div className="btn-row">
            <button className="primary-action" onClick={() => setMode("review")}>
              登记两周复查
            </button>
          </div>
        )}
      </div>
    );
  }

  if (c.status === "复诊") {
    return (
      <div className="case-actions">
        {mode === "review" ? (
          <RevisitCloseForm c={c} service={service} run={run} onDone={() => setMode("none")} />
        ) : (
          <div className="btn-row">
            <button className="primary-action" onClick={() => setMode("review")}>
              复诊处理后结案
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function EditRegistration({
  c,
  service,
  run,
  onDone,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
  onDone: () => void;
}) {
  const [imagingDate, setImagingDate] = useState(c.imagingDate);
  const [anesthesia, setAnesthesia] = useState(c.anesthesia);

  return (
    <div className="inline-form">
      <label>
        <span>新影像日期</span>
        <input type="date" value={imagingDate} onChange={(e) => setImagingDate(e.target.value)} />
      </label>
      <label>
        <span>麻醉结论</span>
        <select
          value={anesthesia}
          onChange={(e) => setAnesthesia(e.target.value as SurgeryCase["anesthesia"])}
        >
          {(["未评估", "已确认", "禁忌"] as const).map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        <button onClick={onDone}>收起</button>
        <button
          className="primary-action"
          onClick={() => {
            const r = run(() =>
              service.updateRegistration(c.id, { imagingDate, anesthesia })
            ) as ReturnType<SurgeryBoardService["updateRegistration"]> | null;
            if (r) onDone();
          }}
        >
          保存并重算待排原因
        </button>
      </div>
    </div>
  );
}

function ScheduleForm({
  c,
  service,
  run,
  onDone,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
  onDone: () => void;
}) {
  const [date, setDate] = useState(todayISO());
  const [period, setPeriod] = useState<DayPeriod>("上午");
  const [microscope, setMicroscope] = useState(MICROSCOPES[0]);

  return (
    <div className="inline-form">
      <label>
        <span>手术日期</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        <span>时段</span>
        <select value={period} onChange={(e) => setPeriod(e.target.value as DayPeriod)}>
          {PERIODS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label>
        <span>显微镜头</span>
        <select value={microscope} onChange={(e) => setMicroscope(e.target.value)}>
          {MICROSCOPES.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <div className="btn-row">
        <button onClick={onDone}>收起</button>
        <button
          className="primary-action"
          onClick={() => {
            const r = run(() =>
              service.schedule(c.id, { date, period, microscope })
            ) as ReturnType<SurgeryBoardService["schedule"]> | null;
            // 成功排入才收起；留在待排或冲突时保留表单便于改时段
            if (r?.ok) onDone();
          }}
        >
          排入（同镜同时段只接一台）
        </button>
      </div>
    </div>
  );
}

function PostOpForm({
  c,
  service,
  run,
  onDone,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
  onDone: () => void;
}) {
  const [surgeryDate, setSurgeryDate] = useState(c.slot?.date ?? todayISO());
  const [length, setLength] = useState("3");
  const [material, setMaterial] = useState("MTA");
  const [specimenNo, setSpecimenNo] = useState("");

  return (
    <div className="inline-form">
      <label>
        <span>手术日期</span>
        <input type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} />
      </label>
      <label>
        <span>根尖切除长度（mm）</span>
        <input
          type="number"
          min="0.5"
          max="10"
          step="0.1"
          value={length}
          onChange={(e) => setLength(e.target.value)}
        />
      </label>
      <label>
        <span>倒充材料</span>
        <input value={material} onChange={(e) => setMaterial(e.target.value)} />
      </label>
      <label>
        <span>标本编号（不可重复）</span>
        <input
          value={specimenNo}
          placeholder="如 SP-2026-0312"
          onChange={(e) => setSpecimenNo(e.target.value)}
        />
      </label>
      <div className="btn-row">
        <button onClick={onDone}>收起</button>
        <button
          className="primary-action"
          onClick={() => {
            const r = run(() =>
              service.recordPostOp(c.id, {
                surgeryDate,
                resectionLengthMm: Number(length),
                retrofillMaterial: material,
                specimenNo,
              })
            ) as ReturnType<SurgeryBoardService["recordPostOp"]> | null;
            if (r?.ok) onDone();
          }}
        >
          保存并进入两周复查
        </button>
      </div>
    </div>
  );
}

function ReviewForm({
  c,
  service,
  run,
  onDone,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
  onDone: () => void;
}) {
  const [painRelieved, setPainRelieved] = useState(true);
  const [trend, setTrend] = useState<BoneDefectTrend>("缩小");
  const [note, setNote] = useState("");

  return (
    <div className="inline-form">
      <label>
        <span>两周复查：疼痛</span>
        <select
          value={painRelieved ? "relieved" : "persistent"}
          onChange={(e) => setPainRelieved(e.target.value === "relieved")}
        >
          <option value="relieved">疼痛已缓解</option>
          <option value="persistent">疼痛未缓解</option>
        </select>
      </label>
      <label>
        <span>骨缺损变化</span>
        <select value={trend} onChange={(e) => setTrend(e.target.value as BoneDefectTrend)}>
          {BONE_TRENDS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="wide">
        <span>备注</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" />
      </label>
      <p className="rule-hint">
        规则：疼痛未缓解，或骨缺损增大 → 自动转入「复诊名单」；否则结案。
      </p>
      <div className="btn-row">
        <button onClick={onDone}>收起</button>
        <button
          className="primary-action"
          onClick={() => {
            const r = run(() =>
              service.review(c.id, { painRelieved, boneDefectTrend: trend, note })
            ) as ReturnType<SurgeryBoardService["review"]> | null;
            if (r) onDone();
          }}
        >
          提交复查结论
        </button>
      </div>
    </div>
  );
}

function RevisitCloseForm({
  c,
  service,
  run,
  onDone,
}: {
  c: SurgeryCase;
  service: SurgeryBoardService;
  run: RunAction;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="inline-form">
      <label className="wide">
        <span>复诊处理记录</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：再次根管倒充填后症状消退" />
      </label>
      <div className="btn-row">
        <button onClick={onDone}>收起</button>
        <button
          className="primary-action"
          onClick={() => {
            const r = run(() => service.closeRevisit(c.id, note)) as
              | ReturnType<SurgeryBoardService["closeRevisit"]>
              | null;
            if (r?.ok) onDone();
          }}
        >
          确认结案
        </button>
      </div>
    </div>
  );
}

function toneOf(status: SurgeryCase["status"]): "watch" | "ok" | "due" | "danger" | "done" {
  switch (status) {
    case "待排":
      return "watch";
    case "已排":
      return "ok";
    case "待复查":
      return "due";
    case "复诊":
      return "danger";
    case "已结案":
      return "done";
  }
}
