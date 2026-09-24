// 界面状态钩子：界面通过它操作应用服务，并在每次落库后刷新看板
import { useCallback, useMemo, useState } from "react";
import { SurgeryCase } from "../domain/types";
import { RuleError } from "../domain/rules";
import { RunAction, SurgeryBoardService } from "./surgeryService";
import { CaseRepository, LocalStorageRepository } from "../storage/repository";
import { SEED_DATA } from "../storage/seed";

export interface Notice {
  id: number;
  kind: "success" | "error" | "warn";
  text: string;
}

function createService(repo: CaseRepository, seeded: boolean): SurgeryBoardService {
  if (!seeded) {
    // 首次使用：写入示例数据（纸表上常见的对不齐情况），便于直接演示
    if (repo.load().cases.length === 0) repo.save(SEED_DATA);
  }
  return new SurgeryBoardService(repo);
}

export function useBoard() {
  const { repo, seeded } = useMemo(() => {
    const local = new LocalStorageRepository();
    const hadData = local.load().cases.length > 0;
    return { repo: local, seeded: hadData };
  }, []);

  const service = useMemo(() => createService(repo, seeded), [repo, seeded]);
  const [cases, setCases] = useState<SurgeryCase[]>(() => service.list());
  const [notices, setNotices] = useState<Notice[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => setCases(service.list()), [service]);

  const notify = useCallback((kind: Notice["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setNotices((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((n) => n.id !== id));
    }, 5200);
  }, []);

  /** 统一执行应用服务动作：成功/留排提示，规则违例弹错误 */
  const run: RunAction = useCallback(
    (fn) => {
      try {
        const result = fn();
        refresh();
        if (!result.ok) {
          notify("warn", result.message);
        } else {
          notify("success", result.message);
        }
        return result;
      } catch (err) {
        if (err instanceof RuleError) {
          notify("error", err.message);
        } else {
          notify("error", "操作失败，请检查输入后重试");
        }
        return null;
      }
    },
    [refresh, notify]
  );

  const resetDemo = useCallback(() => {
    (repo as LocalStorageRepository).clear?.();
    repo.save(SEED_DATA);
    refresh();
    setActiveId(null);
    notify("success", "已恢复示例数据");
  }, [repo, refresh, notify]);

  return {
    cases,
    notices,
    activeId,
    setActiveId,
    service,
    run,
    refresh,
    resetDemo,
  };
}
