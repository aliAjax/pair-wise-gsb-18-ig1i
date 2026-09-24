import { SurgeryCase } from "../domain/types";
import { isReviewDue } from "../domain/rules";
import { todayISO } from "../app/surgeryService";

interface Metric {
  label: string;
  value: number;
  hint?: string;
  tone: "ok" | "watch" | "danger" | "plain";
}

export function MetricCards({ cases }: { cases: SurgeryCase[] }) {
  const today = todayISO();
  const pending = cases.filter((c) => c.status === "待排");
  const scheduled = cases.filter((c) => c.status === "已排");
  const awaiting = cases.filter((c) => c.status === "待复查");
  const dueNow = awaiting.filter((c) => c.postOp && isReviewDue(c.postOp.surgeryDate, today));
  const revisit = cases.filter((c) => c.status === "复诊");

  const metrics: Metric[] = [
    {
      label: "待排（资料不齐）",
      value: pending.length,
      hint: pending.length ? "影像/麻醉补齐后再排" : "没有卡住的病例",
      tone: "watch",
    },
    { label: "已排手术", value: scheduled.length, hint: "占用显微镜头时段", tone: "ok" },
    {
      label: "待复查",
      value: awaiting.length,
      hint: dueNow.length ? `${dueNow.length} 台已满两周，该复查` : "均未满两周",
      tone: dueNow.length ? "danger" : "plain",
    },
    {
      label: "复诊名单",
      value: revisit.length,
      hint: revisit.length ? "疼痛未缓解/骨缺损增大" : "暂无异常复查",
      tone: revisit.length ? "danger" : "ok",
    },
  ];

  return (
    <section className="metrics-grid">
      {metrics.map((m) => (
        <article key={m.label} className={`metric-card metric-${m.tone}`}>
          <span>{m.label}</span>
          <strong>{m.value}</strong>
          {m.hint && <small>{m.hint}</small>}
          <i className={`bar bar-${m.tone}`} />
        </article>
      ))}
    </section>
  );
}
