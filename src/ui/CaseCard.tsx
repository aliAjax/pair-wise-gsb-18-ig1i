// 界面层：病例卡片，按状态展示资料与可执行操作
import { useState, type ReactNode } from "react";
import { formatCN } from "../domain/dates";
import {
  DEFECT_CHANGE_TEXT,
  MICROSCOPE_LABEL,
  READINESS_TEXT,
  SLOT_LABEL,
  expectedReviewDate,
  followupReasons,
} from "../domain/rules";
import { pendingBlockers } from "../application/selectors";
import type {
  OperativeInput,
  ReviewInput,
  ScheduleInput,
  SurgeryCase,
} from "../domain/types";
import type { ActionResult } from "../application/useCases";
import { OperativeForm, ReviewForm, ScheduleForm } from "./forms";

type ActiveForm = "schedule" | "operative" | "review" | null;

export interface CaseActions {
  schedule: (id: string, input: ScheduleInput) => ActionResult;
  unschedule: (id: string) => ActionResult;
  recordOperative: (id: string, input: OperativeInput) => ActionResult;
  recordReview: (id: string, input: ReviewInput) => ActionResult;
}

function Tag({ tone, children }: { tone: "ok" | "warn" | "danger" | "info"; children: ReactNode }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function CaseCard({
  caseItem,
  allCases,
  actions,
}: {
  caseItem: SurgeryCase;
  allCases: SurgeryCase[];
  actions: CaseActions;
}) {
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const blockers = caseItem.status === "pending" ? pendingBlockers(caseItem) : null;
  const imageStale = blockers?.reasons.some(
    (r) => r === "image_expired" || r === "missing_image"
  );
  const anesthesiaPending = blockers?.reasons.includes("anesthesia_unconfirmed");

  return (
    <article className="case-card">
      <header className="case-head">
        <div>
          <h3>
            <span className="tooth-no">{caseItem.toothNo}</span>
            <span className="patient-name">{caseItem.patientName}</span>
          </h3>
          <p className="diagnosis">{caseItem.diagnosis}</p>
        </div>
      </header>

      <dl className="case-facts">
        <div>
          <dt>术前影像</dt>
          <dd className={imageStale ? "fact-bad" : ""}>
            {formatCN(caseItem.imageDate)}
          </dd>
        </div>
        <div>
          <dt>麻醉结论</dt>
          <dd className={anesthesiaPending ? "fact-bad" : "fact-good"}>
            {caseItem.anesthesia === "confirmed" ? "已确认" : "未确认"}
          </dd>
        </div>
        {caseItem.schedule && (
          <>
            <div>
              <dt>手术日期</dt>
              <dd>{formatCN(caseItem.schedule.date)}</dd>
            </div>
            <div>
              <dt>时段</dt>
              <dd>{SLOT_LABEL[caseItem.schedule.slot]}</dd>
            </div>
            <div>
              <dt>显微镜</dt>
              <dd>{MICROSCOPE_LABEL[caseItem.schedule.microscopeId]}</dd>
            </div>
          </>
        )}
      </dl>

      {/* 待排：留滞原因 */}
      {caseItem.status === "pending" && blockers && !blockers.ready && (
        <div className="blockers">
          {blockers.reasons.map((r) => (
            <Tag key={r} tone="danger">
              {READINESS_TEXT[r]}
            </Tag>
          ))}
        </div>
      )}
      {caseItem.status === "pending" && blockers?.ready && (
        <div className="blockers">
          <Tag tone="ok">资料齐备，可排程</Tag>
        </div>
      )}

      {/* 已手术：术后资料 */}
      {caseItem.operative && (
        <dl className="case-facts operative">
          <div>
            <dt>根尖切除</dt>
            <dd>{caseItem.operative.apicoLengthMm} mm</dd>
          </div>
          <div>
            <dt>倒充材料</dt>
            <dd>{caseItem.operative.retrofillMaterial}</dd>
          </div>
          <div>
            <dt>标本编号</dt>
            <dd className="mono">{caseItem.operative.specimenNo}</dd>
          </div>
        </dl>
      )}

      {/* 等待复查提示 */}
      {caseItem.status === "operated" && caseItem.operative && (
        <p className="review-due">
          应于 {formatCN(expectedReviewDate(caseItem.operative.surgeryDate))} 完成两周复查
        </p>
      )}

      {/* 复查结果 */}
      {caseItem.review && (
        <div className="review-result">
          <p>
            复查日期：{formatCN(caseItem.review.reviewedAt)} ·{" "}
            {caseItem.review.painResolved ? "疼痛已缓解" : "疼痛未缓解"} ·{" "}
            {DEFECT_CHANGE_TEXT[caseItem.review.defectChange]}
          </p>
          {caseItem.review.notes && <p className="review-notes">{caseItem.review.notes}</p>}
          {caseItem.status === "followup" && (
            <div className="blockers">
              {followupReasons(caseItem.review).map((r) => (
                <Tag key={r} tone="danger">
                  {r}
                </Tag>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 操作区与展开表单 */}
      {caseItem.status === "pending" && activeForm === "schedule" && (
        <ScheduleForm
          caseItem={caseItem}
          allCases={allCases}
          onSubmit={(input) => actions.schedule(caseItem.id, input)}
          onCancel={() => setActiveForm(null)}
        />
      )}
      {caseItem.status === "scheduled" && activeForm === "operative" && (
        <OperativeForm
          caseItem={caseItem}
          onSubmit={(input) => actions.recordOperative(caseItem.id, input)}
          onCancel={() => setActiveForm(null)}
        />
      )}
      {caseItem.status === "operated" && activeForm === "review" && (
        <ReviewForm
          caseItem={caseItem}
          onSubmit={(input) => actions.recordReview(caseItem.id, input)}
          onCancel={() => setActiveForm(null)}
        />
      )}

      <footer className="case-actions">
        {caseItem.status === "pending" && activeForm !== "schedule" && (
          <button className="primary-action small" onClick={() => setActiveForm("schedule")}>
            排入手术时段
          </button>
        )}
        {caseItem.status === "scheduled" && (
          <>
            {activeForm !== "operative" && (
              <button className="primary-action small" onClick={() => setActiveForm("operative")}>
                补录术后信息
              </button>
            )}
            <button className="ghost small" onClick={() => actions.unschedule(caseItem.id)}>
              退回待排
            </button>
          </>
        )}
        {caseItem.status === "operated" && activeForm !== "review" && (
          <button className="primary-action small" onClick={() => setActiveForm("review")}>
            登记两周复查
          </button>
        )}
      </footer>
    </article>
  );
}
