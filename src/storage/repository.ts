// 保存层：病例仓储。localStorage 持久化，首次加载使用示例数据；与判断、界面完全解耦
import { buildSeedCases } from "../domain/seed";
import type { SurgeryCase } from "../domain/types";

const STORAGE_KEY = "apico-board:cases:v1";

export interface CaseRepository {
  load(): SurgeryCase[];
  save(cases: SurgeryCase[]): void;
  reset(): SurgeryCase[];
}

export function createCaseRepository(): CaseRepository {
  return {
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as SurgeryCase[];
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        // 存储损坏时回落到示例数据
      }
      const seed = buildSeedCases();
      this.save(seed);
      return seed;
    },
    save(cases: SurgeryCase[]) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cases));
      } catch {
        // 隐私模式等写入失败时仅保留内存态，不影响当次操作
      }
    },
    reset() {
      const seed = buildSeedCases();
      this.save(seed);
      return seed;
    },
  };
}
