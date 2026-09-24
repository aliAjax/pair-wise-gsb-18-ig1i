// 应用层：用例编排。界面只调用这里，不直接接触存储，也不自行实现业务判断
import { useCallback, useEffect, useMemo, useState } from "react";
import { todayISO } from "../domain/dates";
import {
  routeAfterReview,
  validateOperative,
  validateSchedule,
  type ValidationResult,
} from "../domain/rules";
import type { CaseRepository } from "../storage/repository";
import {
  buildColumns,
  buildMetrics,
} from "./selectors";
import type {
  OperativeInput,
  RegisterInput,
  ReviewInput,
  ScheduleInput,
  SurgeryCase,
} from "../domain/types";

export interface ActionResult {
  ok: boolean;
  errors: string[];
}

function makeId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useCases(repository: CaseRepository) {
  const [cases, setCases] = useState<SurgeryCase[]>(() => repository.load());

  useEffect(() => {
    repository.save(cases);
  }, [cases, repository]);

  const updateCase = useCallback((id: string, patch: Partial<SurgeryCase>) => {
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }, []);

  const register = useCallback(
    (input: RegisterInput): ActionResult => {
      const errors: string[] = [];
      if (!input.patientName.trim()) errors.push("请填写患者姓名");
      if (!input.toothNo.trim()) errors.push("请填写牙位");
      if (!input.diagnosis.trim()) errors.push("请填写诊断");
      if (errors.length > 0) return { ok: false, errors };

      const tooth = input.toothNo.trim().startsWith("#")
        ? input.toothNo.trim()
        : `#${input.toothNo.trim()}`;
      const duplicate = cases.some(
        (c) => c.toothNo === tooth && c.patientName === input.patientName.trim()
      );
      if (duplicate) {
        return {
          ok: false,
          errors: [`${tooth}（${input.patientName.trim()}）已登记，请勿重复登记`],
        };
      }

      const newCase: SurgeryCase = {
        id: makeId(),
        patientName: input.patientName.trim(),
        toothNo: tooth,
        diagnosis: input.diagnosis.trim(),
        imageDate: input.imageDate,
        anesthesia: input.anesthesia,
        schedule: null,
        operative: null,
        review: null,
        status: "pending",
      };
      setCases((prev) => [newCase, ...prev]);
      return { ok: true, errors: [] };
    },
    [cases]
  );

  const schedule = useCallback(
    (id: string, input: ScheduleInput): ActionResult => {
      const target = cases.find((c) => c.id === id);
      if (!target) return { ok: false, errors: ["病例不存在"] };

      const validation: ValidationResult = validateSchedule(
        target,
        input,
        cases,
        todayISO()
      );
      if (!validation.ok) return { ok: false, errors: validation.errors };

      updateCase(id, {
        schedule: { date: input.date, slot: input.slot, microscopeId: input.microscopeId },
        status: "scheduled",
      });
      return { ok: true, errors: [] };
    },
    [cases, updateCase]
  );

  const unschedule = useCallback(
    (id: string): ActionResult => {
      const target = cases.find((c) => c.id === id);
      if (!target) return { ok: false, errors: ["病例不存在"] };
      if (target.status !== "scheduled") {
        return { ok: false, errors: ["只有已排程病例可以退回待排"] };
      }
      updateCase(id, { schedule: null, status: "pending" });
      return { ok: true, errors: [] };
    },
    [cases, updateCase]
  );

  const recordOperative = useCallback(
    (id: string, input: OperativeInput): ActionResult => {
      const target = cases.find((c) => c.id === id);
      if (!target) return { ok: false, errors: ["病例不存在"] };

      const validation = validateOperative(target, input, cases);
      if (!validation.ok) return { ok: false, errors: validation.errors };

      updateCase(id, {
        operative: {
          surgeryDate: target.schedule?.date ?? todayISO(),
          apicoLengthMm: input.apicoLengthMm,
          retrofillMaterial: input.retrofillMaterial.trim(),
          specimenNo: input.specimenNo.trim(),
        },
        status: "operated",
      });
      return { ok: true, errors: [] };
    },
    [cases, updateCase]
  );

  const recordReview = useCallback(
    (id: string, input: ReviewInput): ActionResult => {
      const target = cases.find((c) => c.id === id);
      if (!target) return { ok: false, errors: ["病例不存在"] };
      if (target.status !== "operated") {
        return { ok: false, errors: ["只有已手术病例可以登记两周复查"] };
      }
      if (!input.reviewedAt) {
        return { ok: false, errors: ["请选择复查日期"] };
      }
      if (
        target.operative &&
        new Date(input.reviewedAt).getTime() <
          new Date(target.operative.surgeryDate).getTime()
      ) {
        return { ok: false, errors: ["复查日期不能早于手术日期"] };
      }

      const review = {
        reviewedAt: input.reviewedAt,
        painResolved: input.painResolved,
        defectChange: input.defectChange,
        notes: input.notes.trim(),
      };
      updateCase(id, { review, status: routeAfterReview(review) });
      return { ok: true, errors: [] };
    },
    [cases, updateCase]
  );

  const resetDemo = useCallback(() => {
    setCases(repository.reset());
  }, [repository]);

  const columns = useMemo(() => buildColumns(cases), [cases]);
  const metrics = useMemo(() => buildMetrics(cases), [cases]);

  return {
    cases,
    columns,
    metrics,
    register,
    schedule,
    unschedule,
    recordOperative,
    recordReview,
    resetDemo,
  };
}
