import { Month, MonthKey } from './types';

export function monthKey(year: number, month: number): MonthKey {
  const m = month.toString().padStart(2, '0');
  return `${year}-${m}`;
}

export function monthLabel(year: number, month: number): string {
  const date = new Date(year, month - 1, 1);
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function buildMonths(startYear: number, startMonth: number, endYear: number, endMonth: number): Month[] {
  const ms: Month[] = [];
  const start = new Date(startYear, startMonth - 1, 1);
  const end = new Date(endYear, endMonth - 1, 1);
  let cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    ms.push({ key: monthKey(y, m), label: monthLabel(y, m), year: y, month: m });
    cur = new Date(y, m, 1);
  }
  return ms;
}

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
