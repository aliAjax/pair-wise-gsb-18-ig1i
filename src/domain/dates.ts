// 资料层：本地时区日期工具，统一使用 YYYY-MM-DD，避免 UTC 偏移问题

export function parseISO(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

/** b - a 的整天差（b 晚于 a 为正） */
export function daysBetween(a: string, b: string): number {
  const ms = parseISO(b).getTime() - parseISO(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function addDaysISO(date: string, days: number): string {
  const next = parseISO(date);
  next.setDate(next.getDate() + days);
  return toISO(next);
}

/** 2026-09-24 → 2026年09月24日 */
export function formatCN(date: string | null): string {
  if (!date) return "未登记";
  const [y, m, d] = date.split("-");
  return `${y}年${m}月${d}日`;
}
