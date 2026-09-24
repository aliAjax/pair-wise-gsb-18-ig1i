import { useMemo, useState } from "react";
import "./styles.css";
import { createCaseRepository } from "./storage/repository";
import { useCases } from "./application/useCases";
import { Board } from "./ui/Board";
import { IMAGE_MAX_AGE_DAYS, REVIEW_WINDOW_DAYS } from "./domain/rules";

const repository = createCaseRepository();

function App() {
  const {
    cases,
    columns,
    metrics,
    register,
    schedule,
    unschedule,
    recordOperative,
    recordReview,
    resetDemo,
  } = useCases(repository);
  const [query, setQuery] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  const actions = useMemo(
    () => ({ schedule, unschedule, recordOperative, recordReview }),
    [schedule, unschedule, recordOperative, recordReview]
  );

  const metricCards = [
    { label: "待排（影像/麻醉待齐）", value: metrics.pending, tone: "status-watch" },
    { label: "已排程手术", value: metrics.scheduled, tone: "status-ok" },
    { label: "已手术待复查", value: metrics.operated, tone: "status-watch" },
    { label: "复诊名单", value: metrics.followup, tone: "status-danger" },
  ];

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · 牙体牙髓 · 根尖手术看板</p>
          <h1>根管看板：排程与术后随访</h1>
          <p className="subtitle">
            按牙位登记术前影像日期、麻醉结论与手术时段；同一显微镜头同一时段只接一台手术。
            影像过期或麻醉未确认留在待排；术后补录切除长度、倒充材料与唯一标本编号；
            两周复查疼痛未缓解或骨缺损增大自动转入复诊名单。
          </p>
        </div>
        <div className="stack-card">
          <span>分层结构</span>
          <strong>资料 types / 判断 rules / 保存 repository / 界面 ui</strong>
          <span>数据保存在本机浏览器（localStorage）</span>
        </div>
      </section>

      <section className="metrics-grid">
        {metricCards.map((m) => (
          <article key={m.label} className="metric-card">
            <span>{m.label}</span>
            <strong>{m.value}</strong>
            <i className={m.tone} />
          </article>
        ))}
      </section>

      <section className="toolbar panel">
        <button className="primary-action" onClick={() => setShowRegister(true)}>
          ＋ 牙位登记
        </button>
        <input
          className="search-input"
          placeholder="搜索牙位 / 患者 / 诊断 / 标本编号"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </section>

      <Board
        columns={columns}
        cases={cases}
        actions={actions}
        query={query}
        registerOpen={showRegister}
        onRegister={register}
        onRegisterClose={() => setShowRegister(false)}
        resetDemo={resetDemo}
      />

      <footer className="rules-note panel">
        <h2>排班与随访规则</h2>
        <ul>
          <li>术前影像距手术日期超过 {IMAGE_MAX_AGE_DAYS} 天视为过期，或麻醉结论未确认 → 病例留在「待排」，无法排程。</li>
          <li>同一手术显微镜同一天同一时段（上午/下午）只能排一台，冲突会在排程时拦截。</li>
          <li>术后必须补录根尖切除长度、倒充材料、标本编号；标本编号全库唯一，重复将被拦住。</li>
          <li>术后第 {REVIEW_WINDOW_DAYS} 天复查：疼痛未缓解或骨缺损增大 → 自动转入「复诊名单」；其余进入「复查通过」。</li>
        </ul>
      </footer>
    </main>
  );
}

export default App;
