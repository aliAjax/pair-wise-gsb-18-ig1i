// 保存层：只管资料的读写与持久化，不含任何业务判断
// Repository 是接口；当前提供 LocalStorageRepository，
// 以后接后端 API 时只需新增一个实现，领域判断与界面都不用改。

import { BoardData, SurgeryCase } from "../domain/types";

export interface CaseRepository {
  load(): BoardData;
  save(data: BoardData): void;
}

const DEFAULT_EMPTY: BoardData = { cases: [] };

export class LocalStorageRepository implements CaseRepository {
  constructor(private readonly storageKey = "hxwl-04-apical-board:v1") {}

  load(): BoardData {
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return structuredClone(DEFAULT_EMPTY);
      const parsed = JSON.parse(raw) as BoardData;
      if (!parsed || !Array.isArray(parsed.cases)) return structuredClone(DEFAULT_EMPTY);
      return parsed;
    } catch {
      // 数据损坏时不阻断看板启动，按空库处理
      return structuredClone(DEFAULT_EMPTY);
    }
  }

  save(data: BoardData): void {
    window.localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  clear(): void {
    window.localStorage.removeItem(this.storageKey);
  }
}

/** 内存仓储：供测试与未来服务端适配参考 */
export class MemoryRepository implements CaseRepository {
  private data: BoardData;

  constructor(initial: BoardData = { cases: [] }) {
    this.data = structuredClone(initial);
  }

  load(): BoardData {
    return structuredClone(this.data);
  }

  save(data: BoardData): void {
    this.data = structuredClone(data);
  }
}

/** 按 updatedAt 兜底，用 id 保持列表稳定顺序 */
export function sortCases(cases: SurgeryCase[]): SurgeryCase[] {
  return [...cases].sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.id.localeCompare(b.id)
      : a.createdAt.localeCompare(b.createdAt)
  );
}
