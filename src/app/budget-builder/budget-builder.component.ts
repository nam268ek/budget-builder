import { CommonModule } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CategoryGroup, CategoryRow, CategoryType, Month } from './types';
import { buildMonths, clamp, uuid } from './util';

type CellCoord = { rowId: string; monthKey: string };

@Component({
  selector: 'app-budget-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './budget-builder.component.html',
  styleUrl: './budget-builder.component.css',
})
export class BudgetBuilderComponent {
  private host = inject(ElementRef<HTMLElement>);

  // Date range (default Jan-Dec 2024)
  startYear = signal(2024);
  startMonth = signal(1);
  endYear = signal(2024);
  endMonth = signal(12);

  months = signal<Month[]>(buildMonths(2024, 1, 2024, 12));

  // Income & Expense groups
  incomeGroups = signal<CategoryGroup[]>([
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

  expenseGroups = signal<CategoryGroup[]>([
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

  // Active cell selection
  active = signal<CellCoord | null>(null);

  // Context menu
  contextMenu = signal<{ x: number; y: number; cell: CellCoord } | null>(null);

  // Flattened rows helpers
  allRows = computed(() => {
    return [...this.incomeGroups(), ...this.expenseGroups()].flatMap(g => g.rows);
  });

  // Totals
  incomeTotalsByMonth = computed<Record<string, number>>(() => this.sumByMonth(this.incomeGroups()));
  expenseTotalsByMonth = computed<Record<string, number>>(() => this.sumByMonth(this.expenseGroups()));
  profitLossByMonth = computed<Record<string, number>>(() => {
    const inc = this.incomeTotalsByMonth();
    const exp = this.expenseTotalsByMonth();
    const res: Record<string, number> = {};
    for (const m of this.months()) res[m.key] = (inc[m.key] || 0) - (exp[m.key] || 0);
    return res;
  });
  openingByMonth = computed<Record<string, number>>(() => {
    const ms = this.months();
    const pl = this.profitLossByMonth();
    const res: Record<string, number> = {};
    let running = 0; // opening Jan = 0
    for (let i = 0; i < ms.length; i++) {
      const mk = ms[i].key;
      res[mk] = i === 0 ? 0 : running;
      running = res[mk] + (pl[mk] || 0);
    }
    return res;
  });
  closingByMonth = computed<Record<string, number>>(() => {
    const ms = this.months();
    const pl = this.profitLossByMonth();
    const op = this.openingByMonth();
    const res: Record<string, number> = {};
    for (const m of ms) res[m.key] = (op[m.key] || 0) + (pl[m.key] || 0);
    return res;
  });

  constructor() {
    // Keep values map aligned when months change
    effect(() => {
      const ms = this.months();
      for (const row of this.allRows()) {
        for (const m of ms) if (!(m.key in row.values)) row.values[m.key] = 0;
      }
    });

    // Initial focus
    queueMicrotask(() => this.focusFirstCell());
  }

  makeGroup(type: CategoryType, name: string, seed: [string, Record<string, number>][] = []): CategoryGroup {
    const gid = uuid();
    const rows: CategoryRow[] = seed.map(([n, v]) => ({
      id: uuid(),
      type,
      parentId: gid,
      name: n,
      values: { ...v },
    }));
    return { id: gid, type, name, rows };
  }

  // Range change
  onChangeRange() {
    const sY = this.startYear(), sM = this.startMonth(), eY = this.endYear(), eM = this.endMonth();
    const sameOrAfterStart = eY > sY || (eY === sY && eM >= sM);
    const startY = sameOrAfterStart ? sY : eY;
    const startM = sameOrAfterStart ? sM : eM;
    const endY = sameOrAfterStart ? eY : sY;
    const endM = sameOrAfterStart ? eM : sM;
    this.months.set(buildMonths(startY, startM, endY, endM));
    if (this.active()) {
      const mk = this.active()!.monthKey;
      if (!this.months().some(m => m.key === mk)) this.focusFirstCell();
    }
  }

  private sumByMonth(groups: CategoryGroup[]): Record<string, number> {
    const res: Record<string, number> = {};
    for (const m of this.months()) res[m.key] = 0;
    for (const g of groups) {
      for (const r of g.rows) {
        for (const m of this.months()) res[m.key] += (r.values[m.key] || 0);
      }
    }
    return res;
  }

  subtotal(group: CategoryGroup, mk: string): number {
    return group.rows.reduce((acc, r) => acc + (r.values[mk] || 0), 0);
  }

  trackGroup(_index: number, group: CategoryGroup) {
    return group.id;
  }

  trackRow(_index: number, row: CategoryRow) {
    return row.id;
  }

  addRowUnder(group: CategoryGroup) {
    const row: CategoryRow = {
      id: uuid(),
      type: group.type,
      parentId: group.id,
      name: 'New category',
      values: Object.fromEntries(this.months().map(m => [m.key, 0])),
    };
    group.rows.push(row);
    const coll = group.type === 'income' ? this.incomeGroups() : this.expenseGroups();
    const next = coll.map(g => (g.id === group.id ? { ...g, rows: [...g.rows] } : g));
    (group.type === 'income' ? this.incomeGroups : this.expenseGroups).set(next);
    queueMicrotask(() => this.focusCell(row.id, this.months()[0]?.key));
  }

  addParent(type: CategoryType) {
    const g = this.makeGroup(type, type === 'income' ? 'New Income' : 'New Expense');
    const next = (type === 'income' ? this.incomeGroups() : this.expenseGroups()).concat(g);
    (type === 'income' ? this.incomeGroups : this.expenseGroups).set(next);
    queueMicrotask(() => {
      if (g.rows[0]) this.focusCell(g.rows[0].id, this.months()[0]?.key);
    });
  }

  deleteRow(row: CategoryRow) {
    const src = row.type === 'income' ? this.incomeGroups() : this.expenseGroups();
    const next = src.map(g => (g.id === row.parentId ? { ...g, rows: g.rows.filter(r => r.id !== row.id) } : g));
    (row.type === 'income' ? this.incomeGroups : this.expenseGroups).set(next);
    this.active.set(null);
  }

  onInput(row: CategoryRow, mk: string, ev: Event) {
    const v = Number((ev.target as HTMLInputElement).value || 0);
    row.values[mk] = isFinite(v) ? v : 0;
    const src = row.type === 'income' ? this.incomeGroups() : this.expenseGroups();
    const next = src.map(g => (g.id === row.parentId ? { ...g, rows: g.rows.map(r => (r.id === row.id ? { ...row } : r)) } : g));
    (row.type === 'income' ? this.incomeGroups : this.expenseGroups).set(next);
  }

  focusFirstCell() {
    const firstRow = this.allRows()[0];
    const firstMonth = this.months()[0];
    if (firstRow && firstMonth) this.focusCell(firstRow.id, firstMonth.key);
  }

  focusCell(rowId: string | undefined, mk: string | undefined) {
    if (!rowId || !mk) return;
    this.active.set({ rowId, monthKey: mk });
    const el = this.host.nativeElement.querySelector(`input[data-cell-id="${rowId}:${mk}"]`) as HTMLInputElement;
    if (el) el.focus({ preventScroll: false });
  }

  onKeydown(ev: KeyboardEvent, row: CategoryRow, monthIndex: number) {
    const ms = this.months();
    const rows = this.allRows();
    const rIndex = rows.findIndex(r => r.id === row.id);

    const isLastMonth = monthIndex === ms.length - 1;

    switch (ev.key) {
      case 'ArrowRight':
        ev.preventDefault();
        this.focusCell(row.id, ms[clamp(monthIndex + 1, 0, ms.length - 1)].key);
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        this.focusCell(row.id, ms[clamp(monthIndex - 1, 0, ms.length - 1)].key);
        break;
      case 'ArrowDown':
        ev.preventDefault();
        this.focusCell(rows[Math.max(0, Math.min(rIndex + 1, rows.length - 1))]?.id, ms[monthIndex]?.key);
        break;
      case 'ArrowUp':
        ev.preventDefault();
        this.focusCell(rows[Math.max(0, Math.min(rIndex - 1, rows.length - 1))]?.id, ms[monthIndex]?.key);
        break;
      case 'Enter':
        ev.preventDefault();
        const group = (row.type === 'income' ? this.incomeGroups() : this.expenseGroups()).find(g => g.id === row.parentId)!;
        this.addRowUnder(group);
        break;
      case 'Tab':
        if (isLastMonth) {
          ev.preventDefault();
          const nextRow = rows[rIndex + 1];
          if (nextRow) this.focusCell(nextRow.id, ms[0].key);
          else {
            const g2 = (row.type === 'income' ? this.incomeGroups() : this.expenseGroups()).find(g => g.id === row.parentId)!;
            this.addRowUnder(g2);
          }
        }
        break;
    }
  }

  onContextMenu(ev: MouseEvent, row: CategoryRow, mk: string) {
    ev.preventDefault();
    this.contextMenu.set({ x: ev.clientX, y: ev.clientY, cell: { rowId: row.id, monthKey: mk } });
  }
  applyToAll() {
    const ctx = this.contextMenu();
    if (!ctx) return;
    const { rowId, monthKey: mk } = ctx.cell;
    const rows = this.allRows();
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const val = row.values[mk] || 0;
    for (const m of this.months()) row.values[m.key] = val;
    const src = row.type === 'income' ? this.incomeGroups() : this.expenseGroups();
    const next = src.map(g => (g.id === row.parentId ? { ...g, rows: g.rows.map(r => (r.id === row.id ? { ...row } : r)) } : g));
    (row.type === 'income' ? this.incomeGroups : this.expenseGroups).set(next);
    this.contextMenu.set(null);
  }
  closeContextMenu() { this.contextMenu.set(null); }

  years = [2023, 2024, 2025, 2026];
  monthsOpts = [
    { v: 1,  n: 'January' },
    { v: 2,  n: 'February' },
    { v: 3,  n: 'March' },
    { v: 4,  n: 'April' },
    { v: 5,  n: 'May' },
    { v: 6,  n: 'June' },
    { v: 7,  n: 'July' },
    { v: 8,  n: 'August' },
    { v: 9,  n: 'September' },
    { v: 10, n: 'October' },
    { v: 11, n: 'November' },
    { v: 12, n: 'December' },
  ];
}
