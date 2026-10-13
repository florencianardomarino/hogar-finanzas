import { Income, Expense, Installment, UnplannedExpense, Month, SavingsConfig, SavingsAllocation } from '../types';
import { getFinancialPeriod } from './dateUtils';

export interface CalculatedMonthData {
  monthId: string;
  year: number;
  month: number;
  status: 'open' | 'planning' | 'closed';
  
  totalIncomes: number;
  totalExpenses: number; // Incluye cuotas normales e inyectadas
  totalUnplanned: number;
  
  incomesList: Income[];
  expensesList: Expense[];
  unplannedList: UnplannedExpense[];
  
  saving: number; // totalIncomes - totalExpenses
  
  // Saldos acumulados encadenados
  previousBalance: number;
  finalBalance: number;

  // Asignaciones a cuentas de ahorro (se descuentan del fondo principal)
  totalAllocated: number;
  allocationsByAccount: Record<string, number>;

  // Restablecimiento manual del saldo (ancla): solo en el mes ancla
  isBalanceAnchor: boolean;
  anchorAdjustment: number; // saldo manual - saldo que calculaba la app
}

/**
 * Importe en euros de una asignación mensual a una cuenta de ahorro.
 * Si es un porcentaje, se aplica sobre los ingresos totales del mes.
 */
export function getAllocationAmount(
  allocation: Pick<SavingsAllocation, 'kind' | 'value'>,
  totalIncomes: number
): number {
  const raw = allocation.kind === 'percent'
    ? (totalIncomes * Number(allocation.value)) / 100
    : Number(allocation.value);
  return Math.round(raw * 100) / 100;
}

/**
 * Calcula secuencial y encadenadamente las finanzas de todos los meses de un hogar,
 * proyectando cuotas activas y respetando las ediciones de cuota individuales (overrides).
 */
export function calculateEncainedFinances(
  months: Month[],
  allIncomes: Income[],
  allExpenses: Expense[],
  allUnplanned: UnplannedExpense[],
  installments: Installment[],
  savingsConfig: SavingsConfig | null,
  billingCycleStartDay: number = 10,
  savingsAllocations: SavingsAllocation[] = []
): CalculatedMonthData[] {
  
  // 1. Saldo inicial base
  const initialBalance = savingsConfig?.initial_balance ? Number(savingsConfig.initial_balance) : 0;

  // 2. Obtener el rango temporal para asegurar que siempre haya proyección secuencial mes a mes
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  let startYear = currentYear;
  let startMonth = currentMonth;

  // Encontrar el mes más antiguo registrado en base de datos o en installments
  if (months.length > 0) {
    months.forEach((m) => {
      if (m.year < startYear || (m.year === startYear && m.month < startMonth)) {
        startYear = m.year;
        startMonth = m.month;
      }
    });
  }

  allIncomes.forEach((inc) => {
    if (inc.date) {
      const p = getFinancialPeriod(inc.date, billingCycleStartDay);
      if (p.year < startYear || (p.year === startYear && p.month < startMonth)) {
        startYear = p.year;
        startMonth = p.month;
      }
    }
  });

  allExpenses.forEach((exp) => {
    if (exp.date) {
      const p = getFinancialPeriod(exp.date, billingCycleStartDay);
      if (p.year < startYear || (p.year === startYear && p.month < startMonth)) {
        startYear = p.year;
        startMonth = p.month;
      }
    }
  });

  installments.forEach((inst) => {
    const instYear = inst.first_debit_year;
    const instMonth = inst.first_debit_month;
    if (instYear < startYear || (instYear === startYear && instMonth < startMonth)) {
      startYear = instYear;
      startMonth = instMonth;
    }
  });

  if (savingsConfig?.anchor_year != null && savingsConfig?.anchor_month != null) {
    const aYear = Number(savingsConfig.anchor_year);
    const aMonth = Number(savingsConfig.anchor_month);
    if (aYear < startYear || (aYear === startYear && aMonth < startMonth)) {
      startYear = aYear;
      startMonth = aMonth;
    }
  }

  savingsAllocations.forEach((a) => {
    if (a.year < startYear || (a.year === startYear && a.month < startMonth)) {
      startYear = a.year;
      startMonth = a.month;
    }
  });

  // El mes final de proyección será hoy + 6 meses (alineado con la vista del Fondo de Ahorros)
  let endYear = currentYear;
  let endMonth = currentMonth + 6;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }

  // Si hay algún mes en la base de datos posterior a hoy + 6 meses, proyectamos hasta ese mes
  months.forEach((m) => {
    if (m.year > endYear || (m.year === endYear && m.month > endMonth)) {
      endYear = m.year;
      endMonth = m.month;
    }
  });

  // Generar la lista completa de meses consecutivos rellenos (padded)
  const paddedMonths: Month[] = [];
  let y = startYear;
  let m = startMonth;

  while (y < endYear || (y === endYear && m <= endMonth)) {
    const existing = months.find((x) => x.year === y && x.month === m);
    if (existing) {
      paddedMonths.push(existing);
    } else {
      const mockId = `mock-month-${y}-${m}`;
      paddedMonths.push({
        id: mockId,
        household_id: savingsConfig?.household_id || '',
        year: y,
        month: m,
        status: 'planning',
        created_at: new Date().toISOString()
      });
    }

    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }

  // 3. Ordenar meses cronológicamente (ya vienen ordenados pero por seguridad lo hacemos)
  const sortedMonths = paddedMonths.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const results: CalculatedMonthData[] = [];
  let currentAccumulatedBalance = initialBalance;

  // 3. Procesar mes a mes en secuencia
  sortedMonths.forEach((m) => {
    // Filtrar transacciones pertenecientes físicamente a este mes específico
    let monthIncomes = allIncomes.filter((i) => i.month_id === m.id);
    let monthExpenses = allExpenses.filter((e) => e.month_id === m.id);
    const monthUnplanned = allUnplanned.filter((u) => u.month_id === m.id);

    // Proyectar gastos e ingresos recurrentes del mes anterior si el mes actual no está cerrado
    if (results.length > 0 && m.status !== 'closed') {
      const prevResult = results[results.length - 1];
      const cleanDesc = (d: string) => (d || '').replace(/\u200B/g, '').trim().toLowerCase();

      // Proyectar ingresos recurrentes del mes anterior si no existen ya en el mes actual
      const projectedIncomes = prevResult.incomesList
        .filter((i) => i.is_recurring)
        .filter((i) => {
          const cleanedI = cleanDesc(i.description);
          return !monthIncomes.some((mi) => cleanDesc(mi.description) === cleanedI);
        })
        .map((i) => {
          const prevDate = new Date(i.date);
          const day = prevDate.getUTCDate() || 10;
          
          let targetYear = m.year;
          let targetMonth = m.month;
          if (day < billingCycleStartDay) {
            targetMonth += 1;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear += 1;
            }
          }
          const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
          const targetDay = Math.min(day, lastDayOfTargetMonth);
          const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

          const baseIncomeId = (i as { original_income_id?: string }).original_income_id || (i.id.startsWith('proj-inc-') ? i.id.replace(/^proj-inc-/, '').replace(/-\d+-\d+$/, '') : i.id);

          return {
            ...i,
            id: `proj-inc-${baseIncomeId}-${m.year}-${m.month}`,
            original_income_id: baseIncomeId,
            month_id: m.id,
            date: targetDateStr,
            is_estimated: true,
            is_recurring: true
          };
        });

      monthIncomes = [...monthIncomes, ...projectedIncomes];

      // Proyectar gastos recurrentes del mes anterior (excluyendo cuotas que se proyectan abajo)
      const projectedExpenses = prevResult.expensesList
        .filter((e) => e.is_recurring && !e.installment_id)
        .filter((e) => {
          const cleanedE = cleanDesc(e.description);
          return !monthExpenses.some((me) => cleanDesc(me.description) === cleanedE);
        })
        .map((e) => {
          const prevDate = new Date(e.date);
          const day = prevDate.getUTCDate() || 10;
          
          let targetYear = m.year;
          let targetMonth = m.month;
          if (day < billingCycleStartDay) {
            targetMonth += 1;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear += 1;
            }
          }
          const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
          const targetDay = Math.min(day, lastDayOfTargetMonth);
          const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

          const baseExpenseId = (e as { original_expense_id?: string }).original_expense_id || (e.id.startsWith('proj-exp-') ? e.id.replace(/^proj-exp-/, '').replace(/-\d+-\d+$/, '') : e.id);

          return {
            ...e,
            id: `proj-exp-${baseExpenseId}-${m.year}-${m.month}`,
            original_expense_id: baseExpenseId,
            month_id: m.id,
            date: targetDateStr,
            is_reconciled: false,
            is_recurring: true
          };
        });

      monthExpenses = [...monthExpenses, ...projectedExpenses];
    }

    // Ingresos totales del mes
    const totalIncomes = monthIncomes.reduce((acc, i) => acc + Number(i.amount), 0);

    // Gastos corrientes registrados físicamente (excepto las cuotas consolidadas,
    // que se calcularán con las proyecciones más abajo para evitar duplicaciones).
    // Filtramos los gastos para quedarnos con los corrientes (no vinculados a installments)
    // y los que son de cuotas específicas ya modificadas (overrides).
    const directExpenses = monthExpenses.filter((e) => !e.installment_id);
    let totalExpenses = directExpenses.reduce((acc, e) => acc + Number(e.amount), 0);

    const consolidatedExpensesList: Expense[] = [...directExpenses];

    // 4. Inyectar compras en cuotas (Proyección de Cuotas)
    installments.forEach((inst) => {
      const firstMonth = inst.first_debit_month;
      const firstYear = inst.first_debit_year;
      const firstDay = inst.first_debit_day || 10;
      const numInstallments = inst.num_installments;
      
      // Calcular el período financiero del primer débito
      const firstDebitPeriod = getFinancialPeriod(
        new Date(firstYear, firstMonth - 1, firstDay),
        billingCycleStartDay
      );
      
      // Calcular la diferencia en meses de períodos financieros
      const diffMonths = (m.year - firstDebitPeriod.year) * 12 + (m.month - firstDebitPeriod.month);

      // Si la cuota cae en este período mensual
      if (diffMonths >= 0 && diffMonths < numInstallments) {
        const installmentNum = diffMonths + 1;

        // Comprobar si hay un registro de gasto físico (override) para esta cuota específica
        const overrideExpense = monthExpenses.find(
          (e) => e.installment_id === inst.id && e.installment_number === installmentNum
        );

        if (overrideExpense) {
          // Si el usuario modificó la cuota de este mes, usamos el registro físico
          totalExpenses += Number(overrideExpense.amount);
          consolidatedExpensesList.push(overrideExpense);
        } else {
          // Si no hay override, usamos la proyección por defecto de la cuota
          const mockExpenseId = `inst-mock-${inst.id}-${installmentNum}`;
          
          const day = inst.first_debit_day || 10;
          let targetYear = m.year;
          let targetMonth = m.month;
          if (day < billingCycleStartDay) {
            targetMonth += 1;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear += 1;
            }
          }
          const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
          const targetDay = Math.min(day, lastDayOfTargetMonth);
          const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
          
          // Crear un gasto ficticio de proyección
          const mockExpense: Expense = {
            id: mockExpenseId,
            month_id: m.id,
            description: `${inst.description} (Cuota ${installmentNum}/${numInstallments})`,
            amount: Number(inst.amount_per_installment),
            date: targetDateStr, // fecha real del cobro
            account: inst.account,
            holder: inst.payment_type === 'credit_card' ? 'Tarjeta' : 'Cuenta',
            category_id: 'installments-placeholder', // Categoría Cuotas
            is_planned: m.status === 'planning',
            notes: inst.notes,
            created_by: inst.created_by,
            installment_id: inst.id,
            installment_number: installmentNum,
            adjustment_note: null,
            is_reconciled: false,
            created_at: new Date().toISOString()
          };

          totalExpenses += Number(inst.amount_per_installment);
          consolidatedExpensesList.push(mockExpense);
        }
      }
    });

    // Gastos extraordinarios (no planificados) pagados del ahorro
    const totalUnplanned = monthUnplanned.reduce((acc, u) => acc + Number(u.amount), 0);

    // Ahorro neto del mes corriente
    const saving = totalIncomes - totalExpenses;

    // Asignaciones del mes a las cuentas de ahorro (salen del fondo principal)
    const allocationsByAccount: Record<string, number> = {};
    let totalAllocated = 0;
    savingsAllocations
      .filter((a) => a.year === m.year && a.month === m.month)
      .forEach((a) => {
        const amount = getAllocationAmount(a, totalIncomes);
        allocationsByAccount[a.savings_account_id] = (allocationsByAccount[a.savings_account_id] || 0) + amount;
        totalAllocated += amount;
      });

    // Ahorro acumulado encadenado
    const previousBalance = currentAccumulatedBalance;
    let finalBalance = previousBalance + saving - totalUnplanned - totalAllocated;

    // Si este mes es el "ancla" (saldo restablecido manualmente), el saldo de cierre
    // es el indicado por el usuario y los meses siguientes se encadenan desde él.
    const isBalanceAnchor =
      savingsConfig?.anchor_year != null &&
      savingsConfig?.anchor_month != null &&
      savingsConfig?.anchor_balance != null &&
      Number(savingsConfig.anchor_year) === m.year &&
      Number(savingsConfig.anchor_month) === m.month;
    let anchorAdjustment = 0;
    if (isBalanceAnchor) {
      anchorAdjustment = Number(savingsConfig!.anchor_balance) - finalBalance;
      finalBalance = Number(savingsConfig!.anchor_balance);
    }

    // Propagar el saldo para el mes siguiente
    currentAccumulatedBalance = finalBalance;

    results.push({
      monthId: m.id,
      year: m.year,
      month: m.month,
      status: m.status,
      totalIncomes,
      totalExpenses,
      totalUnplanned,
      incomesList: monthIncomes,
      expensesList: consolidatedExpensesList,
      unplannedList: monthUnplanned,
      saving,
      previousBalance,
      finalBalance,
      totalAllocated,
      allocationsByAccount,
      isBalanceAnchor,
      anchorAdjustment
    });
  });

  return results;
}
