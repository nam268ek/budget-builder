import { BudgetBuilderStore } from './budget-builder.store';

describe('BudgetBuilderStore', () => {
  let store: BudgetBuilderStore;

  beforeEach(() => {
    store = new BudgetBuilderStore();
  });

  it('calculates income, expense, and cashflow totals for the active months', () => {
    const incomeTotals = store.incomeTotalsByMonth();
    const expenseTotals = store.expenseTotalsByMonth();
    const profitLoss = store.profitLossByMonth();
    const opening = store.openingByMonth();
    const closing = store.closingByMonth();

    expect(incomeTotals['2024-01']).toBe(1300);
    expect(incomeTotals['2024-02']).toBe(1870);

    expect(expenseTotals['2024-01']).toBe(500);
    expect(expenseTotals['2024-02']).toBe(800);

    expect(profitLoss['2024-01']).toBe(800);
    expect(profitLoss['2024-02']).toBe(1070);

    expect(opening['2024-01']).toBe(0);
    expect(opening['2024-02']).toBe(800);

    expect(closing['2024-01']).toBe(800);
    expect(closing['2024-02']).toBe(1870);
  });

  it('normalizes the selected range when the end precedes the start', () => {
    store.setStartYear(2024);
    store.setStartMonth(5);
    store.setEndYear(2024);
    store.setEndMonth(4);

    expect(store.startYear()).toBe(2024);
    expect(store.startMonth()).toBe(4);
    expect(store.endYear()).toBe(2024);
    expect(store.endMonth()).toBe(5);

    const months = store.months();
    expect(months[0].key).toBe('2024-04');
    expect(months[months.length - 1].key).toBe('2024-05');
  });
});
