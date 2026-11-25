import { describe, it, expect } from 'vitest';
import { calculateMonthPlan, isExpenseDebited, resolveMonthBudgets } from './planUtils';
import type { CalculatedMonthData } from './financeUtils';
import type { Expense, Income } from '../types';

// "Hoy": 15 de junio de 2026. Con ciclo desde el día 10 el período actual es Junio 2026 (10/6 al 9/7).
const TODAY = new Date(2026, 5, 15, 12, 0, 0);
const SUPER = 'cat-super';
const VARIOS = 'cat-varios';

const expense = (o: Partial<Expense> & Pick<Expense, 'amount' | 'date'>): Expense => ({
  id: `exp-${Math.random()}`, month_id: 'm', description: 'Gasto', account: 'A', holder: 'T1',
  category_id: 'cat-otro', is_planned: false, notes: null, created_by: null, created_at: '', ...o,
});

const income = (o: Partial<Income> & Pick<Income, 'amount'>): Income => ({
  id: `inc-${Math.random()}`, month_id: 'm', description: 'Sueldo', date: '2026-06-10', account: 'A',
  category: 'Sueldo', is_estimated: false, created_by: null, created_at: '', ...o,
});

const month = (o: Partial<CalculatedMonthData> = {}): CalculatedMonthData => {
  const expensesList = o.expensesList ?? [];
  const incomesList = o.incomesList ?? [];
  return {
    monthId: 'm', year: 2026, month: 6, status: 'open',
    totalIncomes: incomesList.reduce((a, i) => a + i.amount, 0),
    totalExpenses: expensesList.reduce((a, e) => a + e.amount, 0),
    totalUnplanned: 0, incomesList, expensesList, unplannedList: [], saving: 0,
    previousBalance: 0, finalBalance: 0, totalAllocated: 0, allocationsByAccount: {},
    isFrozen: false, closingDrift: 0, isBalanceAnchor: false, anchorAdjustment: 0,
    ...o,
  };
};

describe('isExpenseDebited', () => {
  it('sin marca explícita, depende de la fecha', () => {
    expect(isExpenseDebited(expense({ amount: 1, date: '2026-06-15' }), '2026-06-15')).toBe(true);
    expect(isExpenseDebited(expense({ amount: 1, date: '2026-06-16' }), '2026-06-15')).toBe(false);
  });

  it('la marca explícita gana sobre la fecha', () => {
    expect(isExpenseDebited(expense({ amount: 1, date: '2026-06-01', reconciled: false }), '2026-06-15')).toBe(false);
    expect(isExpenseDebited(expense({ amount: 1, date: '2026-06-30', reconciled: true }), '2026-06-15')).toBe(true);
  });

  it('las proyecciones nunca están debitadas, aunque su fecha ya haya pasado', () => {
    expect(isExpenseDebited(expense({ id: 'proj-exp-x-2026-6', amount: 1, date: '2026-06-11' }), '2026-06-15')).toBe(false);
    expect(isExpenseDebited(expense({ id: 'inst-mock-i1-1', amount: 1, date: '2026-06-11' }), '2026-06-15')).toBe(false);
  });
});

describe('calculateMonthPlan sin presupuestos', () => {
  it('separa planificado, real y pendiente según lo debitado', () => {
    const m = month({
      expensesList: [
        expense({ amount: 100, date: '2026-06-11' }), // ya pasó -> debitado
        expense({ amount: 50, date: '2026-06-25' }),  // futuro -> pendiente
      ],
    });
    const p = calculateMonthPlan(m, {}, 10, TODAY);
    expect(p.planned).toBe(150);
    expect(p.real).toBe(100);
    expect(p.pending).toBe(50);
    expect(p.budgets).toEqual([]);
  });

  it('el saldo a hoy usa ingresos cobrados y el proyectado todos los ingresos', () => {
    const m = month({
      previousBalance: 1000,
      incomesList: [income({ amount: 500 }), income({ amount: 300, is_estimated: true })],
      expensesList: [expense({ amount: 100, date: '2026-06-11' }), expense({ amount: 50, date: '2026-06-25' })],
    });
    const p = calculateMonthPlan(m, {}, 10, TODAY);
    expect(p.balanceToday).toBe(1000 + 500 - 100);
    expect(p.projectedBalance).toBe(1000 + 800 - 150);
  });

  it('descuenta gastos inesperados y asignaciones a cuentas de ahorro del saldo proyectado', () => {
    const m = month({
      previousBalance: 1000, totalIncomes: 500, totalUnplanned: 40, totalAllocated: 60,
      incomesList: [income({ amount: 500 })],
    });
    const p = calculateMonthPlan(m, {}, 10, TODAY);
    expect(p.projectedBalance).toBe(1000 + 500 - 40 - 60);
    expect(p.balanceToday).toBe(1000 + 500 - 40);
  });

  it('las proyecciones recurrentes cuentan como planificado y pendiente', () => {
    const m = month({
      expensesList: [expense({ id: 'proj-exp-a-2026-6', amount: 80, date: '2026-06-11', is_recurring: true })],
    });
    const p = calculateMonthPlan(m, {}, 10, TODAY);
    expect(p.planned).toBe(80);
    expect(p.real).toBe(0);
    expect(p.pending).toBe(80);
  });
});

describe('calculateMonthPlan con presupuesto de categoría', () => {
  it('compras parciales: lo que queda del presupuesto se reserva como pendiente', () => {
    const m = month({
      expensesList: [
        expense({ amount: 42, date: '2026-06-12', category_id: SUPER }),
        expense({ amount: 58, date: '2026-06-14', category_id: SUPER }),
      ],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 300 }, 10, TODAY);
    const line = p.budgets[0];
    expect(line.committed).toBe(100);
    expect(line.spent).toBe(100);
    expect(line.reserve).toBe(200);
    expect(line.overspent).toBe(0);
    expect(p.planned).toBe(300);
    expect(p.real).toBe(100);
    expect(p.pending).toBe(200);
  });

  it('una categoría con presupuesto y sin compras reserva todo el presupuesto', () => {
    const p = calculateMonthPlan(month(), { [SUPER]: 300 }, 10, TODAY);
    expect(p.planned).toBe(300);
    expect(p.pending).toBe(300);
    expect(p.projectedBalance).toBe(-300);
  });

  it('si se pasa del presupuesto, el excedente cuenta como real y no se reserva nada', () => {
    const m = month({
      expensesList: [expense({ amount: 350, date: '2026-06-12', category_id: SUPER })],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 300 }, 10, TODAY);
    const line = p.budgets[0];
    expect(line.overspent).toBe(50);
    expect(line.reserve).toBe(0);
    expect(p.planned).toBe(350);
    expect(p.pending).toBe(0);
  });

  it('una compra futura dentro del presupuesto está comprometida pero no debitada', () => {
    const m = month({
      expensesList: [
        expense({ amount: 100, date: '2026-06-12', category_id: SUPER }),
        expense({ amount: 80, date: '2026-06-28', category_id: SUPER }),
      ],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 300 }, 10, TODAY);
    const line = p.budgets[0];
    expect(line.committed).toBe(180);
    expect(line.spent).toBe(100);
    expect(line.reserve).toBe(120);
    expect(p.real).toBe(100);
    expect(p.planned).toBe(300);
    expect(p.pending).toBe(200);
  });

  it('maneja varias categorías con presupuesto junto a gastos sin presupuesto', () => {
    const m = month({
      expensesList: [
        expense({ amount: 120, date: '2026-06-12', category_id: SUPER }),
        expense({ amount: 30, date: '2026-06-13', category_id: VARIOS }),
        expense({ amount: 500, date: '2026-06-11', category_id: 'cat-alquiler' }),
      ],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 300, [VARIOS]: 100 }, 10, TODAY);
    expect(p.planned).toBe(300 + 100 + 500);
    expect(p.real).toBe(120 + 30 + 500);
    expect(p.pending).toBe(180 + 70);
  });

  it('un mes cerrado no reserva el resto del presupuesto', () => {
    const m = month({
      status: 'closed',
      expensesList: [expense({ amount: 100, date: '2026-06-12', category_id: SUPER })],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 300 }, 10, TODAY);
    expect(p.budgets[0].reserve).toBe(0);
    expect(p.planned).toBe(100);
    expect(p.pending).toBe(0);
  });

  it('un mes cuyo período ya terminó no reserva el resto del presupuesto', () => {
    const m = month({
      month: 5, // Mayo 2026: 10/5 al 9/6, ya terminó
      expensesList: [expense({ amount: 100, date: '2026-05-12', category_id: SUPER })],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 300 }, 10, TODAY);
    expect(p.budgets[0].reserve).toBe(0);
    expect(p.planned).toBe(100);
  });

  it('un mes futuro reserva todo el presupuesto', () => {
    const m = month({ month: 8 });
    const p = calculateMonthPlan(m, { [SUPER]: 300 }, 10, TODAY);
    expect(p.planned).toBe(300);
    expect(p.pending).toBe(300);
  });

  it('no acumula errores de coma flotante', () => {
    const m = month({
      expensesList: [
        expense({ amount: 0.1, date: '2026-06-12', category_id: SUPER }),
        expense({ amount: 0.2, date: '2026-06-13', category_id: SUPER }),
      ],
    });
    const p = calculateMonthPlan(m, { [SUPER]: 1 }, 10, TODAY);
    expect(p.budgets[0].committed).toBe(0.3);
    expect(p.budgets[0].reserve).toBe(0.7);
  });
});

describe('resolveMonthBudgets', () => {
  const cats = [
    { id: SUPER, budget_limit: 300 },
    { id: VARIOS, budget_limit: null },
    { id: 'cat-cero', budget_limit: 0 },
  ];

  it('usa el presupuesto base y omite categorías sin presupuesto', () => {
    expect(resolveMonthBudgets(cats, [], 2026, 6)).toEqual({ [SUPER]: 300 });
  });

  it('el ajuste del mes reemplaza al base solo en ese mes', () => {
    const overrides = [{ category_id: SUPER, year: 2026, month: 6, amount: 450 }];
    expect(resolveMonthBudgets(cats, overrides, 2026, 6)).toEqual({ [SUPER]: 450 });
    expect(resolveMonthBudgets(cats, overrides, 2026, 7)).toEqual({ [SUPER]: 300 });
  });

  it('un ajuste puede dar presupuesto a una categoría que no tenía base', () => {
    const overrides = [{ category_id: VARIOS, year: 2026, month: 6, amount: 80 }];
    expect(resolveMonthBudgets(cats, overrides, 2026, 6)).toEqual({ [SUPER]: 300, [VARIOS]: 80 });
  });

  it('un ajuste en 0 sirve para apagar el presupuesto de ese mes sin borrar el base', () => {
    const overrides = [{ category_id: SUPER, year: 2026, month: 6, amount: 0 }];
    expect(resolveMonthBudgets(cats, overrides, 2026, 6)).toEqual({ [SUPER]: 0 });
  });
});
