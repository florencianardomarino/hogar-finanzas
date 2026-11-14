import type { Expense, ExpenseCategory, CategoryBudget } from '../types';
import type { CalculatedMonthData } from './financeUtils';
import { getPeriodRange, toISODateString } from './dateUtils';

/** Una categoría con presupuesto del mes: la "bolsa" contra la que se van sumando compras parciales. */
export interface BudgetLine {
  categoryId: string;
  budget: number;
  /** Suma de todos los gastos de la categoría en el mes, debitados o no */
  committed: number;
  /** Lo ya debitado */
  spent: number;
  /** Lo que queda del presupuesto y todavía se reserva como gasto pendiente (0 si el mes terminó o se cerró) */
  reserve: number;
  /** Cuánto se pasó del presupuesto (0 si no se pasó) */
  overspent: number;
  /** Lo que cuenta como planificado para la categoría: el mayor entre presupuesto y comprometido */
  planned: number;
}

export interface MonthPlan {
  /** Todo lo que se pensó gastar: gastos registrados y proyectados, cuotas y presupuestos de categoría */
  planned: number;
  /** Lo que ya salió de la cuenta */
  real: number;
  /** Lo que falta pagar: planned - real */
  pending: number;
  budgets: BudgetLine[];
  /** Saldo a hoy: solo ingresos cobrados y gastos debitados */
  balanceToday: number;
  /** Saldo esperado al terminar el mes si se cumple todo lo planificado */
  projectedBalance: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Un gasto está debitado si se marcó explícitamente, o si no se marcó y su fecha ya pasó.
 * Las filas proyectadas (recurrentes sin registrar, cuotas sin override) nunca están debitadas.
 */
export function isExpenseDebited(e: Expense, todayStr: string): boolean {
  if (e.id.startsWith('proj-exp-') || e.id.startsWith('inst-mock-')) return false;
  if (e.reconciled != null) return e.reconciled;
  return e.date <= todayStr;
}

/**
 * Compara lo planificado con lo real para un mes ya calculado por calculateEncainedFinances.
 *
 * @param budgets presupuesto del mes por categoría (categoryId -> importe). Solo las categorías
 *   incluidas funcionan como bolsa; el resto de los gastos suma su importe tal cual.
 * @param billingCycleStartDay se usa para saber si el período del mes ya terminó
 * @param today hoy, parametrizado para poder probarlo
 */
export function calculateMonthPlan(
  month: CalculatedMonthData,
  budgets: Record<string, number>,
  billingCycleStartDay: number = 10,
  today: Date = new Date()
): MonthPlan {
  const todayStr = toISODateString(today);
  const periodEnded = getPeriodRange(month.year, month.month, billingCycleStartDay).end < today;
  const reserveOpen = month.status !== 'closed' && !periodEnded;

  let planned = 0;
  let real = 0;
  const lines: Record<string, BudgetLine> = {};

  Object.entries(budgets).forEach(([categoryId, budget]) => {
    lines[categoryId] = {
      categoryId, budget: Number(budget), committed: 0, spent: 0, reserve: 0, overspent: 0, planned: 0,
    };
  });

  month.expensesList.forEach((e) => {
    const amount = Number(e.amount);
    const debited = isExpenseDebited(e, todayStr);
    if (debited) real += amount;

    const line = lines[e.category_id];
    if (line) {
      line.committed += amount;
      if (debited) line.spent += amount;
    } else {
      planned += amount;
    }
  });

  const budgetLines = Object.values(lines).map((line) => {
    const overspent = Math.max(line.committed - line.budget, 0);
    const reserve = reserveOpen ? Math.max(line.budget - line.committed, 0) : 0;
    const linePlanned = line.committed + reserve;
    planned += linePlanned;
    return {
      ...line,
      committed: round2(line.committed),
      spent: round2(line.spent),
      reserve: round2(reserve),
      overspent: round2(overspent),
      planned: round2(linePlanned),
    };
  });

  const receivedIncomes = month.incomesList
    .filter((i) => !i.is_estimated)
    .reduce((acc, i) => acc + Number(i.amount), 0);

  planned = round2(planned);
  real = round2(real);

  return {
    planned,
    real,
    pending: round2(planned - real),
    budgets: budgetLines,
    balanceToday: round2(month.previousBalance + receivedIncomes - real - month.totalUnplanned),
    projectedBalance: round2(
      month.previousBalance + month.totalIncomes - planned - month.totalUnplanned - month.totalAllocated
    ),
  };
}

/**
 * Presupuesto de cada categoría para un mes: el ajuste puntual del mes si existe,
 * y si no el presupuesto base de la categoría. Las categorías sin presupuesto no aparecen.
 */
export function resolveMonthBudgets(
  categories: Pick<ExpenseCategory, 'id' | 'budget_limit'>[],
  overrides: Pick<CategoryBudget, 'category_id' | 'year' | 'month' | 'amount'>[],
  year: number,
  month: number
): Record<string, number> {
  const result: Record<string, number> = {};
  categories.forEach((c) => {
    if (c.budget_limit != null && Number(c.budget_limit) > 0) result[c.id] = Number(c.budget_limit);
  });
  overrides
    .filter((o) => o.year === year && o.month === month)
    .forEach((o) => {
      result[o.category_id] = Number(o.amount);
    });
  return result;
}
