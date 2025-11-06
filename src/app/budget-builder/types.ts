export type MonthKey = string; // "YYYY-MM"

export interface Month {
  key: MonthKey;
  label: string; // e.g. "January 2024"
  year: number;
  month: number; // 1..12
}

export type CategoryType = 'income' | 'expense';

export interface CategoryRow {
  id: string;
  type: CategoryType;
  parentId: string;
  name: string;
  values: Record<MonthKey, number>;
}

export interface CategoryGroup {
  id: string;
  type: CategoryType;
  name: string;
  rows: CategoryRow[];
}
