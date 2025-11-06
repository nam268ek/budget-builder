import { Injectable, WritableSignal, computed, effect, signal } from '@angular/core';
import { CategoryGroup, CategoryRow, CategoryType, Month } from './types';
import { buildMonths, uuid } from './util';

type NormalizedRange = {
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
};

@Injectable({ providedIn: 'root' })
export class BudgetBuilderStore {
  readonly startYear = signal(2024);
  readonly startMonth = signal(1);
  readonly endYear = signal(2024);
  readonly endMonth = signal(12);

  private readonly _months = signal<Month[]>(buildMonths(2024, 1, 2024, 12));
  readonly months = this._months.asReadonly();

  private readonly _incomeGroups = signal<CategoryGroup[]>([
    this.makeGroup('income', 'General Income', [
      ['General Income', { '2024-01': 100, '2024-02': 120 }],
      ['Sales', { '2024-01': 200, '2024-02': 400 }],
      ['Commission', { '2024-01': 0, '2024-02': 200 }],
    ]),
    this.makeGroup('income', 'Other Income', [
      ['Training', { '2024-01': 500, '2024-02': 550 }],
      ['Consulting', { '2024-01': 500, '2024-02': 600 }],
    ]),
  ]);
  readonly incomeGroups = this._incomeGroups.asReadonly();

  private readonly _expenseGroups = signal<CategoryGroup[]>([
    this.makeGroup('expense', 'Operational Expenses', [
      ['Management Fees', { '2024-01': 100, '2024-02': 200 }],
      ['Cloud Hosting', { '2024-01': 200, '2024-02': 400 }],
    ]),
    this.makeGroup('expense', 'Salaries & Wages', [
      ['Full Time Dev Salaries', { '2024-01': 100, '2024-02': 120 }],
      ['Part Time Dev Salaries', { '2024-01': 80, '2024-02': 80 }],
      ['Remote Salaries', { '2024-01': 20, '2024-02': 0 }],
    ]),
  ]);
  readonly expenseGroups = this._expenseGroups.asReadonly();

  readonly allRows = computed(() => {
    return [...this._incomeGroups(), ...this._expenseGroups()].flatMap(group => group.rows);
  });

  readonly incomeTotalsByMonth = computed<Record<string, number>>(() =>
    this.sumByMonth(this._incomeGroups()),
  );
  readonly expenseTotalsByMonth = computed<Record<string, number>>(() =>
    this.sumByMonth(this._expenseGroups()),
  );
  readonly profitLossByMonth = computed<Record<string, number>>(() => {
    const income = this.incomeTotalsByMonth();
    const expense = this.expenseTotalsByMonth();
    const result: Record<string, number> = {};
    for (const month of this._months()) {
      result[month.key] = (income[month.key] || 0) - (expense[month.key] || 0);
    }
    return result;
  });
  readonly openingByMonth = computed<Record<string, number>>(() => {
    const months = this._months();
    const profitLoss = this.profitLossByMonth();
    const result: Record<string, number> = {};
    let running = 0;
    for (let i = 0; i < months.length; i++) {
      const mk = months[i].key;
      result[mk] = i === 0 ? 0 : running;
      running = result[mk] + (profitLoss[mk] || 0);
    }
    return result;
  });
  readonly closingByMonth = computed<Record<string, number>>(() => {
    const months = this._months();
    const profitLoss = this.profitLossByMonth();
    const opening = this.openingByMonth();
    const result: Record<string, number> = {};
    for (const month of months) {
      result[month.key] = (opening[month.key] || 0) + (profitLoss[month.key] || 0);
    }
    return result;
  });

  constructor() {
    effect(
      () => {
        const months = this._months();
        this.syncGroupsWithMonths(this._incomeGroups, months);
        this.syncGroupsWithMonths(this._expenseGroups, months);
      },
      { allowSignalWrites: true },
    );
  }

  setStartMonth(month: number) {
    this.startMonth.set(month);
    this.updateRange();
  }

  setStartYear(year: number) {
    this.startYear.set(year);
    this.updateRange();
  }

  setEndMonth(month: number) {
    this.endMonth.set(month);
    this.updateRange();
  }

  setEndYear(year: number) {
    this.endYear.set(year);
    this.updateRange();
  }

  addRowUnder(groupId: string, type: CategoryType): string | null {
    const months = this._months();
    const newRow: CategoryRow = {
      id: uuid(),
      type,
      parentId: groupId,
      name: 'New category',
      values: Object.fromEntries(months.map(m => [m.key, 0])),
    };

    const target = this.groupsSignal(type);
    let inserted = false;
    const nextGroups = target().map(group => {
      if (group.id !== groupId) return group;
      inserted = true;
      return { ...group, rows: [...group.rows, newRow] };
    });

    if (inserted) {
      target.set(nextGroups);
      return newRow.id;
    }

    return null;
  }

  addParent(type: CategoryType) {
    const group = this.makeGroup(type, type === 'income' ? 'New Income' : 'New Expense');
    const target = this.groupsSignal(type);
    target.set([...target(), group]);
  }

  deleteRow(rowId: string, parentId: string, type: CategoryType) {
    const target = this.groupsSignal(type);
    let changed = false;
    const nextGroups = target().map(group => {
      if (group.id !== parentId) return group;
      const nextRows = group.rows.filter(row => row.id !== rowId);
      if (nextRows.length === group.rows.length) return group;
      changed = true;
      return { ...group, rows: nextRows };
    });

    if (changed) target.set(nextGroups);
  }

  renameGroup(groupId: string, type: CategoryType, name: string) {
    const trimmed = name.trim();
    const target = this.groupsSignal(type);
    let changed = false;
    const nextGroups = target().map(group => {
      if (group.id !== groupId) return group;
      if (group.name === trimmed) return group;
      changed = true;
      return { ...group, name: trimmed };
    });

    if (changed) target.set(nextGroups);
  }

  renameRow(rowId: string, parentId: string, type: CategoryType, name: string) {
    const trimmed = name.trim();
    const target = this.groupsSignal(type);
    let changed = false;
    const nextGroups = target().map(group => {
      if (group.id !== parentId) return group;
      let groupChanged = false;
      const rows = group.rows.map(row => {
        if (row.id !== rowId) return row;
        if (row.name === trimmed) return row;
        groupChanged = true;
        return { ...row, name: trimmed };
      });
      if (!groupChanged) return group;
      changed = true;
      return { ...group, rows };
    });

    if (changed) target.set(nextGroups);
  }

  updateCellValue(rowId: string, parentId: string, type: CategoryType, monthKey: string, rawValue: number) {
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    const target = this.groupsSignal(type);
    let changed = false;
    const nextGroups = target().map(group => {
      if (group.id !== parentId) return group;
      let groupChanged = false;
      const rows = group.rows.map(row => {
        if (row.id !== rowId) return row;
        const current = row.values[monthKey] ?? 0;
        if (current === value) return row;
        groupChanged = true;
        return { ...row, values: { ...row.values, [monthKey]: value } };
      });
      if (!groupChanged) return group;
      changed = true;
      return { ...group, rows };
    });

    if (changed) target.set(nextGroups);
  }

  applyValueToAllMonths(rowId: string, parentId: string, type: CategoryType, monthKey: string) {
    const target = this.groupsSignal(type);
    const months = this._months();
    let changed = false;
    const nextGroups = target().map(group => {
      if (group.id !== parentId) return group;
      let groupChanged = false;
      const rows = group.rows.map(row => {
        if (row.id !== rowId) return row;
        const baseValue = row.values[monthKey] ?? 0;
        const nextValues: Record<string, number> = {};
        let rowChanged = false;
        for (const month of months) {
          const current = row.values[month.key] ?? 0;
          nextValues[month.key] = baseValue;
          if (current !== baseValue) rowChanged = true;
        }
        if (!rowChanged) return row;
        groupChanged = true;
        return { ...row, values: nextValues };
      });
      if (!groupChanged) return group;
      changed = true;
      return { ...group, rows };
    });

    if (changed) target.set(nextGroups);
  }

  findGroupById(groupId: string): CategoryGroup | undefined {
    return [...this._incomeGroups(), ...this._expenseGroups()].find(group => group.id === groupId);
  }

  private updateRange() {
    const normalized = this.normalizeRange({
      startYear: this.startYear(),
      startMonth: this.startMonth(),
      endYear: this.endYear(),
      endMonth: this.endMonth(),
    });

    if (normalized.startYear !== this.startYear()) this.startYear.set(normalized.startYear);
    if (normalized.startMonth !== this.startMonth()) this.startMonth.set(normalized.startMonth);
    if (normalized.endYear !== this.endYear()) this.endYear.set(normalized.endYear);
    if (normalized.endMonth !== this.endMonth()) this.endMonth.set(normalized.endMonth);

    this._months.set(
      buildMonths(normalized.startYear, normalized.startMonth, normalized.endYear, normalized.endMonth),
    );
  }

  private normalizeRange(range: NormalizedRange): NormalizedRange {
    const sameOrAfterStart =
      range.endYear > range.startYear ||
      (range.endYear === range.startYear && range.endMonth >= range.startMonth);
    if (sameOrAfterStart) return range;
    return {
      startYear: range.endYear,
      startMonth: range.endMonth,
      endYear: range.startYear,
      endMonth: range.startMonth,
    };
  }

  private syncGroupsWithMonths(target: WritableSignal<CategoryGroup[]>, months: Month[]) {
    const groups = target();
    let changed = false;

    const nextGroups = groups.map(group => {
      let groupChanged = false;
      const rows = group.rows.map(row => {
        const updatedRow = this.ensureMonthCoverage(row, months);
        if (updatedRow !== row) groupChanged = true;
        return updatedRow;
      });
      if (!groupChanged) return group;
      changed = true;
      return { ...group, rows };
    });

    if (changed) target.set(nextGroups);
  }

  private ensureMonthCoverage(row: CategoryRow, months: Month[]): CategoryRow {
    const missing = months.filter(month => !(month.key in row.values));
    if (missing.length === 0) return row;
    const values = { ...row.values };
    for (const month of missing) values[month.key] = 0;
    return { ...row, values };
  }

  private sumByMonth(groupsSignal: CategoryGroup[]): Record<string, number> {
    const result: Record<string, number> = {};
    for (const month of this._months()) {
      result[month.key] = 0;
    }
    for (const group of groupsSignal) {
      for (const row of group.rows) {
        for (const month of this._months()) {
          result[month.key] += row.values[month.key] || 0;
        }
      }
    }
    return result;
  }

  private makeGroup(
    type: CategoryType,
    name: string,
    seed: [string, Record<string, number>][] = [],
  ): CategoryGroup {
    const groupId = uuid();
    const rows: CategoryRow[] = seed.map(([rowName, values]) => ({
      id: uuid(),
      type,
      parentId: groupId,
      name: rowName,
      values: { ...values },
    }));
    return { id: groupId, type, name, rows };
  }

  private groupsSignal(type: CategoryType): WritableSignal<CategoryGroup[]> {
    return type === 'income' ? this._incomeGroups : this._expenseGroups;
  }
}
