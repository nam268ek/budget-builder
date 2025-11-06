import { CommonModule } from '@angular/common';
import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BudgetBuilderStore } from './budget-builder.store';
import { CategoryGroup, CategoryRow, CategoryType } from './types';
import { clamp } from './util';

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
  readonly store = inject(BudgetBuilderStore);

  active = signal<CellCoord | null>(null);

  constructor() {
    queueMicrotask(() => this.focusFirstCell());
  }

  onStartMonthChange(month: number) {
    this.store.setStartMonth(month);
    this.ensureActiveCellInRange();
  }

  onStartYearChange(year: number) {
    this.store.setStartYear(year);
    this.ensureActiveCellInRange();
  }

  onEndMonthChange(month: number) {
    this.store.setEndMonth(month);
    this.ensureActiveCellInRange();
  }

  onEndYearChange(year: number) {
    this.store.setEndYear(year);
    this.ensureActiveCellInRange();
  }

  subtotal(group: CategoryGroup, mk: string): number {
    return group.rows.reduce((acc, row) => acc + (row.values[mk] || 0), 0);
  }

  trackGroup(_index: number, group: CategoryGroup) {
    return group.id;
  }

  trackRow(_index: number, row: CategoryRow) {
    return row.id;
  }

  addRowUnder(group: CategoryGroup) {
    const newRowId = this.store.addRowUnder(group.id, group.type);
    if (!newRowId) return;
    const firstMonth = this.store.months()[0]?.key;
    queueMicrotask(() => this.focusCell(newRowId, firstMonth));
  }

  addParent(type: CategoryType) {
    this.store.addParent(type);
  }

  deleteRow(row: CategoryRow) {
    this.store.deleteRow(row.id, row.parentId, row.type);
    this.active.set(null);
  }

  onInput(row: CategoryRow, mk: string, ev: Event) {
    const raw = Number((ev.target as HTMLInputElement).value ?? 0);
    const value = Number.isFinite(raw) ? raw : 0;
    this.store.updateCellValue(row.id, row.parentId, row.type, mk, value);
  }

  renameGroup(group: CategoryGroup, name: string) {
    this.store.renameGroup(group.id, group.type, name);
  }

  renameRow(row: CategoryRow, name: string) {
    this.store.renameRow(row.id, row.parentId, row.type, name);
  }

  applyToAll(row: CategoryRow, mk: string) {
    this.store.applyValueToAllMonths(row.id, row.parentId, row.type, mk);
  }

  focusFirstCell() {
    const allRows = this.store.allRows();
    const months = this.store.months();
    const firstRow = allRows[0];
    const firstMonth = months[0];
    if (firstRow && firstMonth) this.focusCell(firstRow.id, firstMonth.key);
  }

  focusCell(rowId: string | undefined, mk: string | undefined) {
    if (!rowId || !mk) return;
    this.active.set({ rowId, monthKey: mk });
    const el = this.host.nativeElement.querySelector(`input[data-cell-id="${rowId}:${mk}"]`) as HTMLInputElement;
    if (el) el.focus({ preventScroll: false });
  }

  onKeydown(ev: KeyboardEvent, row: CategoryRow, monthIndex: number) {
    const months = this.store.months();
    const rows = this.store.allRows();
    const rIndex = rows.findIndex(r => r.id === row.id);

    const isLastMonth = monthIndex === months.length - 1;

    switch (ev.key) {
      case 'ArrowRight':
        ev.preventDefault();
        this.focusCell(row.id, months[clamp(monthIndex + 1, 0, months.length - 1)]?.key);
        break;
      case 'ArrowLeft':
        ev.preventDefault();
        this.focusCell(row.id, months[clamp(monthIndex - 1, 0, months.length - 1)]?.key);
        break;
      case 'ArrowDown':
        ev.preventDefault();
        this.focusCell(
          rows[Math.max(0, Math.min(rIndex + 1, rows.length - 1))]?.id,
          months[monthIndex]?.key,
        );
        break;
      case 'ArrowUp':
        ev.preventDefault();
        this.focusCell(
          rows[Math.max(0, Math.min(rIndex - 1, rows.length - 1))]?.id,
          months[monthIndex]?.key,
        );
        break;
      case 'Enter':
        ev.preventDefault();
        const groupForEnter = this.store.findGroupById(row.parentId);
        if (groupForEnter) this.addRowUnder(groupForEnter);
        break;
      case 'Tab':
        if (isLastMonth) {
          ev.preventDefault();
          const nextRow = rows[rIndex + 1];
          if (nextRow) this.focusCell(nextRow.id, months[0]?.key);
          else {
            const groupForTab = this.store.findGroupById(row.parentId);
            if (groupForTab) this.addRowUnder(groupForTab);
          }
        }
        break;
    }
  }

  private ensureActiveCellInRange() {
    const active = this.active();
    if (!active) return;
    const months = this.store.months();
    if (!months.some(month => month.key === active.monthKey)) this.focusFirstCell();
  }

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
