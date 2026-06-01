import { Income, Expense, Installment, UnplannedExpense, Month, SavingsConfig } from '../types';

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
  savingsConfig: SavingsConfig | null
): CalculatedMonthData[] {
  
  // 1. Saldo inicial base
  const initialBalance = savingsConfig?.initial_balance ? Number(savingsConfig.initial_balance) : 0;

  // 2. Ordenar meses cronológicamente
  const sortedMonths = [...months].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const results: CalculatedMonthData[] = [];
  let currentAccumulatedBalance = initialBalance;

  // 3. Procesar mes a mes en secuencia
  sortedMonths.forEach((m) => {
    // Filtrar transacciones pertenecientes físicamente a este mes específico
    const monthIncomes = allIncomes.filter((i) => i.month_id === m.id);
    const monthExpenses = allExpenses.filter((e) => e.month_id === m.id);
    const monthUnplanned = allUnplanned.filter((u) => u.month_id === m.id);

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
      const numInstallments = inst.num_installments;
      
      // Calcular la diferencia en meses
      const diffMonths = (m.year - firstYear) * 12 + (m.month - firstMonth);

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
          
          // Crear un gasto ficticio de proyección
          const mockExpense: Expense = {
            id: mockExpenseId,
            month_id: m.id,
            description: `${inst.description} (Cuota ${installmentNum}/${numInstallments})`,
            amount: Number(inst.amount_per_installment),
            date: `${m.year}-${String(m.month).padStart(2, '0')}-${String(inst.first_debit_month === m.month ? 10 : 10)}`, // fecha simbólica
            account: inst.account,
            holder: inst.payment_type === 'credit_card' ? 'Tarjeta' : 'Cuenta',
            category_id: 'installments-placeholder', // Categoría Cuotas
            is_planned: m.status === 'planning',
            notes: inst.notes,
            created_by: inst.created_by,
            installment_id: inst.id,
            installment_number: installmentNum,
            adjustment_note: null,
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

    // Ahorro acumulado encadenado
    const previousBalance = currentAccumulatedBalance;
    const finalBalance = previousBalance + saving - totalUnplanned;

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
      finalBalance
    });
  });

  return results;
}
