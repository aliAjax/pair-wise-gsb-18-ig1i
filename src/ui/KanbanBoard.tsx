import { CaseStatus, STATUS_ORDER, SurgeryCase } from "../domain/types";
import { CaseCard } from "./CaseCard";
import { RunAction, SurgeryBoardService } from "../app/surgeryService";

export function KanbanBoard({
  cases,
  service,
  run,
}: {
  cases: SurgeryCase[];
  service: SurgeryBoardService;
  run: RunAction;
}) {
  return (
    <section className="board">
      {STATUS_ORDER.map((status) => (
        <BoardColumn
          key={status}
          status={status}
          cases={cases.filter((c) => c.status === status)}
          service={service}
          run={run}
        />
      ))}
    </section>
  );
}

function BoardColumn({
  status,
  cases,
  service,
  run,
}: {
  status: CaseStatus;
  cases: SurgeryCase[];
  service: SurgeryBoardService;
  run: RunAction;
}) {
  return (
    <div className={`board-col col-${status}`}>
      <header className="col-head">
        <h2>{status}</h2>
        <span className="col-count">{cases.length}</span>
      </header>
      <div className="col-body">
        {cases.length === 0 ? (
          <p className="col-empty">空</p>
        ) : (
          cases.map((c) => <CaseCard key={c.id} c={c} service={service} run={run} />)
        )}
      </div>
    </div>
  );
}
