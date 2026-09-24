import "./styles.css";
import { useBoard } from "./app/useBoard";
import { todayISO } from "./app/surgeryService";
import { NoticeStack } from "./ui/NoticeStack";
import { MetricCards } from "./ui/MetricCards";
import { RegistrationForm } from "./ui/RegistrationForm";
import { KanbanBoard } from "./ui/KanbanBoard";
import { MicroscopeSchedule } from "./ui/MicroscopeSchedule";

function App() {
  const { cases, notices, service, run, resetDemo } = useBoard();

  return (
    <main className="app-shell">
      <NoticeStack notices={notices} />

      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-04 · 牙体牙髓 · port 5104</p>
          <h1>根尖手术排程与术后随访看板</h1>
          <p className="subtitle">
            按牙位登记术前影像日期、麻醉结论与手术时段；同一显微镜头同一时段只接一台手术，
            影像过期或麻醉未确认留在待排。术后补录根尖切除长度、倒充材料与标本编号，
            两周复查疼痛未缓解或骨缺损增大即转入复诊名单。
          </p>
        </div>
        <div className="stack-card">
          <span>今日 / 影像有效期 / 复查周期</span>
          <strong>
            {todayISO()} · 术前影像 30 天有效 · 术后第 14 天复查
          </strong>
          <button className="reset-btn" onClick={resetDemo}>
            恢复示例数据
          </button>
        </div>
      </section>

      <MetricCards cases={cases} />

      <RegistrationForm service={service} run={run} />

      <KanbanBoard cases={cases} service={service} run={run} />

      <MicroscopeSchedule cases={cases} today={todayISO()} />

      <footer className="foot-note">
        资料（domain/types）· 判断（domain/rules）· 保存（storage）· 界面（ui）四层分离；
        数据保存在本机浏览器 localStorage，刷新不丢失。
      </footer>
    </main>
  );
}

export default App;
