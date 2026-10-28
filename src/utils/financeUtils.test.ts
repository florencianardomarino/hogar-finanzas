import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { calculateEncainedFinances, getAllocationAmount } from './financeUtils';
import type {
  Month, Income, Expense, Installment, UnplannedExpense, SavingsConfig, SavingsAllocation,
} from '../types';

// "Hoy" fijo: 15 de junio de 2026. Con ciclo desde el día 10 el período actual es Junio 2026
// y la proyección llega hasta Diciembre 2026 (hoy + 6 meses).
const TODAY = new Date(2026, 5, 15, 12, 0, 0);
const START_DAY = 10;

const monthId = (y: number, m: number) => `m-${y}-${m}`;

const month = (y: number, m: number, status: Month['status'] = 'open'): Month => ({
  id: monthId(y, m), household_id: 'h1', year: y, month: m, status, created_at: '',
});

const income = (o: Partial<Income> & Pick<Income, 'amount' | 'date' | 'month_id'>): Income => ({
  id: `inc-${Math.random()}`, description: 'Sueldo', account: 'A', category: 'Sueldo',
  is_estimated: false, created_by: null, created_at: '', ...o,
});

const expense = (o: Partial<Expense> & Pick<Expense, 'amount' | 'date' | 'month_id'>): Expense => ({
  id: `exp-${Math.random()}`, description: 'Gasto', account: 'A', holder: 'T1', category_id: 'c1',
  is_planned: false, notes: null, created_by: null, created_at: '', ...o,
});

const unplanned = (o: Partial<UnplannedExpense> & Pick<UnplannedExpense, 'amount' | 'month_id'>): UnplannedExpense => ({
  id: `unp-${Math.random()}`, household_id: 'h1', description: 'Imprevisto', date: '2026-06-20',
  account: 'A', holder: 'T1', category: null, created_by: null, created_at: '', ...o,
});

const installment = (o: Partial<Installment> = {}): Installment => ({
  id: 'i1', household_id: 'h1', description: 'Heladera', total_amount: 300, num_installments: 3,
  amount_per_installment: 100, payment_type: 'credit_card', account: 'A', first_debit_day: 15,
  first_debit_month: 6, first_debit_year: 2026, notes: null, created_by: null, created_at: '', ...o,
});

const config = (o: Partial<SavingsConfig> = {}): SavingsConfig => ({
  household_id: 'h1', initial_balance: 0, updated_at: '', ...o,
});

const allocation = (o: Partial<SavingsAllocation> & Pick<SavingsAllocation, 'year' | 'month' | 'kind' | 'value'>): SavingsAllocation => ({
  id: `al-${Math.random()}`, household_id: 'h1', savings_account_id: 'acc1', created_by: null, created_at: '', ...o,
});

const run = (args: {
  months?: Month[]; incomes?: Income[]; expenses?: Expense[]; unplanned?: UnplannedExpense[];
  installments?: Installment[]; config?: SavingsConfig | null; allocations?: SavingsAllocation[];
}) =>
  calculateEncainedFinances(
    args.months ?? [], args.incomes ?? [], args.expenses ?? [], args.unplanned ?? [],
    args.installments ?? [], args.config === undefined ? config() : args.config,
    START_DAY, args.allocations ?? []
  );

const find = (res: ReturnType<typeof run>, y: number, m: number) => {
  const r = res.find((x) => x.year === y && x.month === m);
  if (!r) throw new Error(`mes ${y}-${m} no generado`);
  return r;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => vi.useRealTimers());

describe('getAllocationAmount', () => {
  it('aplica el porcentaje sobre los ingresos', () => {
    expect(getAllocationAmount({ kind: 'percent', value: 10 }, 2000)).toBe(200);
  });

  it('devuelve el monto fijo tal cual', () => {
    expect(getAllocationAmount({ kind: 'amount', value: 150 }, 2000)).toBe(150);
  });

  it('redondea a 2 decimales', () => {
    expect(getAllocationAmount({ kind: 'percent', value: 33.333 }, 1000)).toBe(333.33);
  });

  it('con ingresos 0 un porcentaje da 0 y un monto fijo se mantiene', () => {
    expect(getAllocationAmount({ kind: 'percent', value: 20 }, 0)).toBe(0);
    expect(getAllocationAmount({ kind: 'amount', value: 50 }, 0)).toBe(50);
  });

  it('acepta valores numéricos llegados como string (Supabase numeric)', () => {
    expect(getAllocationAmount({ kind: 'percent', value: '10' as unknown as number }, 1000)).toBe(100);
  });
});

describe('rango de meses generado', () => {
  it('sin datos genera desde el mes actual hasta hoy + 6 meses', () => {
    const res = run({});
    expect(res[0]).toMatchObject({ year: 2026, month: 6 });
    expect(res[res.length - 1]).toMatchObject({ year: 2026, month: 12 });
    expect(res).toHaveLength(7);
  });

  it('empieza en el mes más antiguo con datos y rellena los meses intermedios', () => {
    const res = run({ incomes: [income({ amount: 100, date: '2026-03-15', month_id: monthId(2026, 3) })] });
    expect(res[0]).toMatchObject({ year: 2026, month: 3 });
    expect(res.map((r) => r.month).slice(0, 4)).toEqual([3, 4, 5, 6]);
  });

  it('un movimiento fechado antes del día de ciclo cuenta para el mes anterior', () => {
    const res = run({ expenses: [expense({ amount: 10, date: '2026-04-05', month_id: monthId(2026, 3) })] });
    expect(res[0]).toMatchObject({ year: 2026, month: 3 });
  });

  it('cruza el año correctamente al proyectar', () => {
    vi.setSystemTime(new Date(2026, 9, 15));
    const res = run({});
    expect(res[res.length - 1]).toMatchObject({ year: 2027, month: 4 });
  });

  it('la proyección se extiende hasta un mes posterior ya existente en base', () => {
    const res = run({ months: [month(2027, 3, 'planning')] });
    expect(res[res.length - 1]).toMatchObject({ year: 2027, month: 3 });
  });

  it('los meses ya guardados conservan su estado y los faltantes son "planning"', () => {
    const res = run({ months: [month(2026, 6, 'open')] });
    expect(find(res, 2026, 6).status).toBe('open');
    expect(find(res, 2026, 7).status).toBe('planning');
    expect(find(res, 2026, 7).monthId).toBe('mock-month-2026-7');
  });
});

describe('totales y saldo encadenado', () => {
  it('ahorro del mes = ingresos - gastos', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) })],
      expenses: [expense({ amount: 400, date: '2026-06-12', month_id: monthId(2026, 6) })],
    });
    const jun = find(res, 2026, 6);
    expect(jun.totalIncomes).toBe(1000);
    expect(jun.totalExpenses).toBe(400);
    expect(jun.saving).toBe(600);
    expect(jun.finalBalance).toBe(600);
  });

  it('parte del saldo inicial y encadena mes a mes', () => {
    const res = run({
      config: config({ initial_balance: 500 }),
      months: [month(2026, 6), month(2026, 7)],
      incomes: [
        income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) }),
        income({ amount: 1000, date: '2026-07-10', month_id: monthId(2026, 7), description: 'Otro' }),
      ],
      expenses: [expense({ amount: 300, date: '2026-07-12', month_id: monthId(2026, 7) })],
    });
    const jun = find(res, 2026, 6);
    const jul = find(res, 2026, 7);
    expect(jun.previousBalance).toBe(500);
    expect(jun.finalBalance).toBe(1500);
    expect(jul.previousBalance).toBe(1500);
    expect(jul.finalBalance).toBe(2200);
  });

  it('un mes con más gastos que ingresos deja el saldo en negativo', () => {
    const res = run({
      months: [month(2026, 6)],
      expenses: [expense({ amount: 250, date: '2026-06-12', month_id: monthId(2026, 6) })],
    });
    expect(find(res, 2026, 6).finalBalance).toBe(-250);
  });

  it('los gastos inesperados salen del saldo pero no del ahorro del mes', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) })],
      unplanned: [unplanned({ amount: 200, month_id: monthId(2026, 6) })],
    });
    const jun = find(res, 2026, 6);
    expect(jun.totalUnplanned).toBe(200);
    expect(jun.saving).toBe(1000);
    expect(jun.finalBalance).toBe(800);
  });

  it('sin configuración de ahorro el saldo inicial es 0', () => {
    const res = run({ config: null });
    expect(find(res, 2026, 6).previousBalance).toBe(0);
  });

  it('suma importes que llegan como string sin concatenar', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [
        income({ amount: '100.5' as unknown as number, date: '2026-06-10', month_id: monthId(2026, 6) }),
        income({ amount: '200' as unknown as number, date: '2026-06-11', month_id: monthId(2026, 6), description: 'B' }),
      ],
    });
    expect(find(res, 2026, 6).totalIncomes).toBeCloseTo(300.5, 2);
  });

  it('los decimales no acumulan error visible a nivel de centavos', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [
        income({ amount: 0.1, date: '2026-06-10', month_id: monthId(2026, 6) }),
        income({ amount: 0.2, date: '2026-06-11', month_id: monthId(2026, 6), description: 'B' }),
      ],
    });
    expect(find(res, 2026, 6).totalIncomes).toBeCloseTo(0.3, 2);
  });
});

describe('cuentas de ahorro (asignaciones)', () => {
  it('un porcentaje se calcula sobre los ingresos totales del mes y se descuenta del saldo', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 2000, date: '2026-06-10', month_id: monthId(2026, 6) })],
      allocations: [allocation({ year: 2026, month: 6, kind: 'percent', value: 10 })],
    });
    const jun = find(res, 2026, 6);
    expect(jun.totalAllocated).toBe(200);
    expect(jun.allocationsByAccount).toEqual({ acc1: 200 });
    expect(jun.finalBalance).toBe(1800);
  });

  it('suma varias asignaciones de la misma cuenta y de cuentas distintas', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) })],
      allocations: [
        allocation({ year: 2026, month: 6, kind: 'amount', value: 50 }),
        allocation({ year: 2026, month: 6, kind: 'amount', value: 25 }),
        allocation({ year: 2026, month: 6, kind: 'percent', value: 10, savings_account_id: 'acc2' }),
      ],
    });
    const jun = find(res, 2026, 6);
    expect(jun.allocationsByAccount).toEqual({ acc1: 75, acc2: 100 });
    expect(jun.totalAllocated).toBe(175);
  });

  it('ignora asignaciones de otros meses', () => {
    const res = run({
      months: [month(2026, 6)],
      allocations: [allocation({ year: 2026, month: 7, kind: 'amount', value: 50 })],
    });
    expect(find(res, 2026, 6).totalAllocated).toBe(0);
    expect(find(res, 2026, 7).totalAllocated).toBe(50);
  });

  it('el porcentaje incluye ingresos recurrentes proyectados', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true })],
      allocations: [allocation({ year: 2026, month: 7, kind: 'percent', value: 10 })],
    });
    expect(find(res, 2026, 7).totalIncomes).toBe(1000);
    expect(find(res, 2026, 7).totalAllocated).toBe(100);
  });
});

describe('ancla de saldo (restablecer saldo)', () => {
  const anchored = (balance: number) =>
    config({ initial_balance: 0, anchor_year: 2026, anchor_month: 6, anchor_balance: balance });

  it('fija el saldo de cierre del mes ancla y registra el ajuste', () => {
    const res = run({
      config: anchored(5000),
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) })],
    });
    const jun = find(res, 2026, 6);
    expect(jun.isBalanceAnchor).toBe(true);
    expect(jun.finalBalance).toBe(5000);
    expect(jun.anchorAdjustment).toBe(4000);
  });

  it('los meses siguientes se encadenan desde el saldo ancla', () => {
    const res = run({
      config: anchored(5000),
      months: [month(2026, 6), month(2026, 7)],
      incomes: [income({ amount: 300, date: '2026-07-10', month_id: monthId(2026, 7) })],
    });
    expect(find(res, 2026, 7).previousBalance).toBe(5000);
    expect(find(res, 2026, 7).finalBalance).toBe(5300);
  });

  it('un ancla anterior a los datos extiende el rango hacia atrás', () => {
    const res = run({
      config: config({ anchor_year: 2026, anchor_month: 2, anchor_balance: 100 }),
    });
    expect(res[0]).toMatchObject({ year: 2026, month: 2, isBalanceAnchor: true });
  });

  it('sin anchor_balance no hay ancla', () => {
    const res = run({ config: config({ anchor_year: 2026, anchor_month: 6, anchor_balance: null }) });
    expect(res.some((r) => r.isBalanceAnchor)).toBe(false);
  });

  it('un ancla de saldo 0 sí cuenta como ancla', () => {
    const res = run({ config: anchored(0), months: [month(2026, 6)],
      incomes: [income({ amount: 100, date: '2026-06-10', month_id: monthId(2026, 6) })] });
    expect(find(res, 2026, 6).isBalanceAnchor).toBe(true);
    expect(find(res, 2026, 6).finalBalance).toBe(0);
  });
});

describe('proyección de recurrentes', () => {
  it('proyecta un ingreso recurrente al mes siguiente con fecha ajustada', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true })],
    });
    const jul = find(res, 2026, 7);
    expect(jul.incomesList).toHaveLength(1);
    expect(jul.incomesList[0]).toMatchObject({ amount: 1000, date: '2026-07-10', is_estimated: true });
    expect(jul.incomesList[0].id).toMatch(/^proj-inc-/);
  });

  it('encadena la proyección varios meses sin duplicar ni anidar ids', () => {
    const inc = income({ id: 'orig', amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true });
    const res = run({ months: [month(2026, 6)], incomes: [inc] });
    expect(find(res, 2026, 9).incomesList).toHaveLength(1);
    expect(find(res, 2026, 9).incomesList[0].id).toBe('proj-inc-orig-2026-9');
  });

  it('no proyecta si el mes siguiente ya tiene un ingreso con la misma descripción', () => {
    const res = run({
      months: [month(2026, 6), month(2026, 7)],
      incomes: [
        income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true }),
        income({ amount: 1200, date: '2026-07-10', month_id: monthId(2026, 7), is_recurring: true }),
      ],
    });
    const jul = find(res, 2026, 7);
    expect(jul.incomesList).toHaveLength(1);
    expect(jul.totalIncomes).toBe(1200);
  });

  it('compara descripciones ignorando mayúsculas y espacios', () => {
    const res = run({
      months: [month(2026, 6), month(2026, 7)],
      incomes: [
        income({ description: 'Sueldo', amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true }),
        income({ description: ' SUELDO ', amount: 900, date: '2026-07-10', month_id: monthId(2026, 7) }),
      ],
    });
    expect(find(res, 2026, 7).incomesList).toHaveLength(1);
  });

  it('no proyecta ingresos no recurrentes', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: false })],
    });
    expect(find(res, 2026, 7).totalIncomes).toBe(0);
  });

  it('no proyecta dentro de un mes cerrado', () => {
    const res = run({
      months: [month(2026, 6), month(2026, 7, 'closed')],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true })],
    });
    expect(find(res, 2026, 7).totalIncomes).toBe(0);
  });

  it('proyecta gastos recurrentes (no de cuotas)', () => {
    const res = run({
      months: [month(2026, 6)],
      expenses: [expense({ description: 'Alquiler', amount: 500, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true })],
    });
    const jul = find(res, 2026, 7);
    expect(jul.totalExpenses).toBe(500);
    expect(jul.expensesList[0]).toMatchObject({ date: '2026-07-10', is_reconciled: false });
  });

  it('un recurrente con día anterior al ciclo cae en el mes calendario siguiente', () => {
    // día 5 < 10 => pertenece al período de junio pero su fecha física es 5 de julio
    const res = run({
      months: [month(2026, 6)],
      expenses: [expense({ amount: 80, date: '2026-07-05', month_id: monthId(2026, 6), is_recurring: true })],
    });
    expect(find(res, 2026, 7).expensesList[0].date).toBe('2026-08-05');
  });

  it('ajusta el día 31 al último día del mes destino', () => {
    const res = run({
      months: [month(2026, 7)],
      expenses: [expense({ amount: 80, date: '2026-07-31', month_id: monthId(2026, 7), is_recurring: true })],
    });
    expect(find(res, 2026, 8).expensesList[0].date).toBe('2026-08-31');
    expect(find(res, 2026, 9).expensesList[0].date).toBe('2026-09-30');
  });

  it('conserva el día 31 después de pasar por un mes de 30 días', () => {
    const res = run({
      months: [month(2026, 7)],
      expenses: [expense({ amount: 80, date: '2026-07-31', month_id: monthId(2026, 7), is_recurring: true })],
    });
    expect(find(res, 2026, 9).expensesList[0].date).toBe('2026-09-30');
    expect(find(res, 2026, 10).expensesList[0].date).toBe('2026-10-31');
    expect(find(res, 2026, 12).expensesList[0].date).toBe('2026-12-31');
  });

  it('no proyecta si el mes siguiente ya tiene una fila de la misma serie con otra descripción', () => {
    const res = run({
      months: [month(2026, 6), month(2026, 7)],
      incomes: [
        income({ description: 'Sueldo', recurrence_group_id: 'g1', amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6), is_recurring: true }),
        income({ description: 'Sueldo julio', recurrence_group_id: 'g1', amount: 1100, date: '2026-07-10', month_id: monthId(2026, 7), is_recurring: true }),
      ],
    });
    expect(find(res, 2026, 7).incomesList).toHaveLength(1);
    expect(find(res, 2026, 7).totalIncomes).toBe(1100);
  });

  it('la proyección conserva el grupo de la serie', () => {
    const res = run({
      months: [month(2026, 6)],
      expenses: [expense({ recurrence_group_id: 'g9', amount: 50, date: '2026-06-12', month_id: monthId(2026, 6), is_recurring: true })],
    });
    expect(find(res, 2026, 8).expensesList[0].recurrence_group_id).toBe('g9');
  });
});

describe('cuotas', () => {
  it('proyecta cada cuota en su mes y se detiene al terminar el plan', () => {
    const res = run({ installments: [installment()] });
    expect(find(res, 2026, 6).totalExpenses).toBe(100);
    expect(find(res, 2026, 7).totalExpenses).toBe(100);
    expect(find(res, 2026, 8).totalExpenses).toBe(100);
    expect(find(res, 2026, 9).totalExpenses).toBe(0);
  });

  it('numera las cuotas y las describe como "(Cuota n/total)"', () => {
    const res = run({ installments: [installment()] });
    const e = find(res, 2026, 7).expensesList[0];
    expect(e.description).toBe('Heladera (Cuota 2/3)');
    expect(e.installment_number).toBe(2);
    expect(e.id).toBe('inst-mock-i1-2');
  });

  it('no incluye cuotas antes del primer débito', () => {
    const res = run({ installments: [installment({ first_debit_month: 8 })] });
    expect(find(res, 2026, 7).totalExpenses).toBe(0);
    expect(find(res, 2026, 8).totalExpenses).toBe(100);
  });

  it('un plan que empezó en el pasado extiende el rango hacia atrás', () => {
    const res = run({ installments: [installment({ first_debit_month: 4, num_installments: 6 })] });
    expect(res[0]).toMatchObject({ year: 2026, month: 4 });
    expect(find(res, 2026, 4).totalExpenses).toBe(100);
  });

  it('un débito antes del día de ciclo pertenece al período anterior', () => {
    // primer débito el 5 de julio con ciclo desde el 10 => período de junio
    const res = run({ installments: [installment({ first_debit_day: 5, first_debit_month: 7, num_installments: 1 })] });
    expect(find(res, 2026, 6).totalExpenses).toBe(100);
    expect(find(res, 2026, 6).expensesList[0].date).toBe('2026-07-05');
    expect(find(res, 2026, 7).totalExpenses).toBe(0);
  });

  it('usa el gasto real (override) de la cuota en lugar de la proyección', () => {
    const override = expense({
      id: 'ov', amount: 150, date: '2026-07-15', month_id: monthId(2026, 7),
      installment_id: 'i1', installment_number: 2,
    });
    const res = run({ months: [month(2026, 7)], expenses: [override], installments: [installment()] });
    const jul = find(res, 2026, 7);
    expect(jul.totalExpenses).toBe(150);
    expect(jul.expensesList.map((e) => e.id)).toEqual(['ov']);
  });

  it('un gasto de cuota con otro número no reemplaza la cuota del mes', () => {
    const other = expense({
      amount: 999, date: '2026-07-15', month_id: monthId(2026, 7),
      installment_id: 'i1', installment_number: 1,
    });
    const res = run({ months: [month(2026, 7)], expenses: [other], installments: [installment()] });
    expect(find(res, 2026, 7).totalExpenses).toBe(100);
  });

  it('las cuotas cuentan en el ahorro del mes', () => {
    const res = run({
      months: [month(2026, 6)],
      incomes: [income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) })],
      installments: [installment()],
    });
    expect(find(res, 2026, 6).saving).toBe(900);
  });

  it('no proyecta cuotas de un gasto recurrente que ya es una cuota', () => {
    const recurringInst = expense({
      amount: 100, date: '2026-06-15', month_id: monthId(2026, 6),
      installment_id: 'i1', installment_number: 1, is_recurring: true,
    });
    const res = run({ months: [month(2026, 6)], expenses: [recurringInst], installments: [installment({ num_installments: 1 })] });
    expect(find(res, 2026, 7).totalExpenses).toBe(0);
  });
});

describe('saldo de cierre congelado', () => {
  const closedJune = (closing: number | null): Month => ({ ...month(2026, 6, 'closed'), closing_balance: closing });
  const juneIncome = income({ amount: 1000, date: '2026-06-10', month_id: monthId(2026, 6) });

  it('un mes cerrado con saldo guardado usa ese saldo y no el recalculado', () => {
    const res = run({ months: [closedJune(700)], incomes: [juneIncome] });
    const jun = find(res, 2026, 6);
    expect(jun.isFrozen).toBe(true);
    expect(jun.finalBalance).toBe(700);
    expect(jun.closingDrift).toBe(300);
  });

  it('los meses siguientes se encadenan desde el saldo congelado', () => {
    const res = run({
      months: [closedJune(700), month(2026, 7)],
      incomes: [juneIncome, income({ amount: 100, date: '2026-07-10', month_id: monthId(2026, 7), description: 'X' })],
    });
    expect(find(res, 2026, 7).previousBalance).toBe(700);
    expect(find(res, 2026, 7).finalBalance).toBe(800);
  });

  it('un ajuste posterior al cierre no cambia saldos futuros y se refleja en closingDrift', () => {
    const adjustment = expense({ amount: 50, date: '2026-06-20', month_id: monthId(2026, 6), adjustment_note: 'olvidado' });
    const sinAjuste = run({ months: [closedJune(1000), month(2026, 7)], incomes: [juneIncome] });
    const conAjuste = run({ months: [closedJune(1000), month(2026, 7)], incomes: [juneIncome], expenses: [adjustment] });
    expect(find(conAjuste, 2026, 7).finalBalance).toBe(find(sinAjuste, 2026, 7).finalBalance);
    expect(find(conAjuste, 2026, 6).closingDrift).toBe(-50);
    expect(find(conAjuste, 2026, 6).finalBalance).toBe(1000);
  });

  it('sin saldo guardado (cerrado antes de la migración) se calcula en vivo', () => {
    const res = run({ months: [closedJune(null)], incomes: [juneIncome] });
    expect(find(res, 2026, 6).isFrozen).toBe(false);
    expect(find(res, 2026, 6).finalBalance).toBe(1000);
  });

  it('un mes reabierto ignora el saldo que hubiera guardado', () => {
    const reopened: Month = { ...month(2026, 6, 'open'), closing_balance: 700 };
    const res = run({ months: [reopened], incomes: [juneIncome] });
    expect(find(res, 2026, 6).isFrozen).toBe(false);
    expect(find(res, 2026, 6).finalBalance).toBe(1000);
  });

  it('acepta el saldo guardado como string (numeric de Supabase)', () => {
    const res = run({ months: [closedJune('700.50' as unknown as number)], incomes: [juneIncome] });
    expect(find(res, 2026, 6).finalBalance).toBe(700.5);
  });

  it('el ancla de saldo prevalece sobre el saldo congelado', () => {
    const res = run({
      config: config({ anchor_year: 2026, anchor_month: 6, anchor_balance: 5000 }),
      months: [closedJune(700)],
      incomes: [juneIncome],
    });
    expect(find(res, 2026, 6).finalBalance).toBe(5000);
    expect(find(res, 2026, 6).anchorAdjustment).toBe(4300);
  });

  it('los gastos inesperados de meses anteriores siguen en la cadena', () => {
    const res = run({
      months: [month(2026, 6), month(2026, 7)],
      incomes: [juneIncome],
      unplanned: [unplanned({ amount: 200, month_id: monthId(2026, 6) })],
    });
    expect(find(res, 2026, 7).previousBalance).toBe(800);
  });
});
