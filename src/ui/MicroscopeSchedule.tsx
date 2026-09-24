import { useMemo } from "react";
import { DayPeriod, DAY_PERIODS, SurgeryCase } from "../domain/types";
import { occupiesSlot } from "../domain/rules";

const MICROSCOPES = ["M1", "M2"];
const RANGE_DAYS = 7;

/** 显微镜头排期表：最近 7 天 × 上午/下午，一眼看出同镜同时段是否撞车 */
export function MicroscopeSchedule({
  cases,
  today,
}: {
  cases: SurgeryCase[];
  today: string;
}) {
  const days = useMemo(() => {
    const list: string[] = [];
    for (let i = 0; i < RANGE_DAYS; i += 1) {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + i);
      list.push(d.toISOString().slice(0, 10));
    }
    return list;
  }, [today]);

  const cell = (date: string, period: DayPeriod, scope: string) =>
    cases.find(
      (c) =>
        occupiesSlot(c) &&
        c.slot?.date === date &&
        c.slot.period === period &&
        c.slot.microscope === scope
    );

  return (
    <section className="panel schedule-panel">
      <div className="section-heading">
        <div>
          <p>显微镜排期</p>
          <h2>未来 {RANGE_DAYS} 天 · 同一镜号同一时段只能一台手术</h2>
        </div>
      </div>
      <div className="schedule-scroll">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>镜号 / 日期</th>
              {days.map((d) => (
                <th key={d} className={d === today ? "today" : ""}>
                  {d.slice(5).replace("-", "/")}
                  <small>{weekday(d)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MICROSCOPES.flatMap((scope) =>
              DAY_PERIODS.map((period) => (
                <tr key={`${scope}-${period}`}>
                  <th className="row-head">
                    {scope}
                    <small>{period}</small>
                  </th>
                  {days.map((d) => {
                    const c = cell(d, period, scope);
                    return (
                      <td
                        key={d}
                        className={[c ? "booked" : "free", d === today ? "today-cell" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        title={c ? `${c.patientName} · 牙位 ${c.toothNo}（${c.status}）` : "空闲"}
                      >
                        {c ? (
                          <span className="booked-cell">
                            <strong>{c.toothNo}</strong>
                            <small>
                              {c.patientName}
                              {c.status !== "已排" ? ` · ${c.status}` : ""}
                            </small>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function weekday(iso: string): string {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[new Date(iso + "T00:00:00").getDay()];
}
