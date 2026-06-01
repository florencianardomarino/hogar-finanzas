import React from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel } from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { PieChart, TrendingUp, TrendingDown, Users, Landmark, CreditCard, Sparkles } from 'lucide-react';

export const MonthlySummaryScreen: React.FC = () => {
  const { 
    monthsData, incomes, expenses, unplannedExpenses, installments, savingsConfig, selectedPeriod, categories, activeHousehold
  } = useApp();

  // Calcular finanzas encadenadas
  const calculatedMonths = calculateEncainedFinances(
    monthsData, incomes, expenses, unplannedExpenses, installments, savingsConfig
  );

  // Período seleccionado actual
  const currentMonthData = calculatedMonths.find(
    (c) => c.year === selectedPeriod.year && c.month === selectedPeriod.month
  ) || {
    totalIncomes: 0,
    totalExpenses: 0,
    totalUnplanned: 0,
    saving: 0,
    expensesList: [],
    incomesList: []
  };

  // Buscar mes anterior para comparativas
  let prevMonth = selectedPeriod.month - 1;
  let prevYear = selectedPeriod.year;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevMonthData = calculatedMonths.find(
    (c) => c.year === prevYear && c.month === prevMonth
  );

  // Cargar titulares y cuentas dinámicas con fallbacks seguros
  const currentHolders: string[] = activeHousehold?.holders || [
    activeHousehold?.holder_1_name || 'Titular 1',
    activeHousehold?.holder_2_name || 'Titular 2',
    'Compartido'
  ];

  const currentAccounts: any[] = activeHousehold?.accounts || [
    { id: '1', name: activeHousehold?.account_1_name || 'Cuenta Titular 1', type: 'bank_account', holder: activeHousehold?.holder_1_name || 'Titular 1' },
    { id: '2', name: activeHousehold?.account_2_name || 'Cuenta Titular 2', type: 'bank_account', holder: activeHousehold?.holder_2_name || 'Titular 2' },
    { id: '3', name: activeHousehold?.account_joint_name || 'Cuenta conjunta', type: 'bank_account', holder: 'Compartido' }
  ];

  // -------------------------------------------------------------------
  // 1. DESGLOSE POR TITULAR (RESPONSABLE) - DINÁMICO
  // -------------------------------------------------------------------
  const holderTotals: Record<string, number> = {};
  currentHolders.forEach((h) => {
    holderTotals[h] = 0;
  });
  if (holderTotals['Compartido'] === undefined) {
    holderTotals['Compartido'] = 0;
  }

  currentMonthData.expensesList.forEach((e) => {
    const amount = Number(e.amount);
    if (e.holder && holderTotals[e.holder] !== undefined) {
      holderTotals[e.holder] += amount;
    } else {
      holderTotals['Compartido'] += amount;
    }
  });

  // -------------------------------------------------------------------
  // 2. DESGLOSE POR CUENTA (FLUJO DE SALIDA) - DINÁMICO
  // -------------------------------------------------------------------
  const accountTotals: Record<string, number> = {};
  currentAccounts.forEach((acc) => {
    accountTotals[acc.name] = 0;
  });

  currentMonthData.expensesList.forEach((e) => {
    if (e.account) {
      if (accountTotals[e.account] === undefined) {
        accountTotals[e.account] = 0;
      }
      accountTotals[e.account] += Number(e.amount);
    }
  });

  // -------------------------------------------------------------------
  // 3. DATOS PARA LA DONA SVG PREMIUM
  // -------------------------------------------------------------------
  // Obtener egresos agrupados por categorías para construir arcos de círculo
  const categoryChartData = categories.map((cat) => {
    const total = currentMonthData.expensesList
      .filter((e) => e.category_id === cat.id || (cat.name === 'Cuotas' && e.category_id === 'installments-placeholder'))
      .reduce((acc, e) => acc + Number(e.amount), 0);
    return {
      name: cat.name,
      amount: total,
      color: cat.color || '#3B82F6'
    };
  }).filter((c) => c.amount > 0);

  const totalExp = currentMonthData.totalExpenses || 1;

  // Dibujar dona SVG interactiva
  let accumulatedAngle = 0;
  const donutSegments = categoryChartData.map((c) => {
    const percent = c.amount / totalExp;
    const angle = percent * 360;
    
    // Cálculo de arcos trigonométricos para SVG
    const x1 = 50 + 35 * Math.cos((accumulatedAngle - 90) * Math.PI / 180);
    const y1 = 50 + 35 * Math.sin((accumulatedAngle - 90) * Math.PI / 180);
    
    accumulatedAngle += angle;
    
    const x2 = 50 + 35 * Math.cos((accumulatedAngle - 90) * Math.PI / 180);
    const y2 = 50 + 35 * Math.sin((accumulatedAngle - 90) * Math.PI / 180);
    
    const largeArcFlag = angle > 180 ? 1 : 0;
    
    return {
      pathData: `M ${x1} ${y1} A 35 35 0 ${largeArcFlag} 1 ${x2} ${y2}`,
      color: c.color,
      name: c.name,
      percent: (percent * 100).toFixed(0),
      amount: c.amount
    };
  });

  return (
    <div className="px-4 py-5 pb-24 animate-fade-in">
      <div className="mb-6">
        <h2 className="text-xl font-extrabold font-sans text-gradient-sky">Resumen Mensual</h2>
        <p className="text-xs text-lux-muted mt-0.5">{getPeriodLabel(selectedPeriod.year, selectedPeriod.month)}</p>
      </div>

      {currentMonthData.expensesList.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl border-lux-border/40 text-center flex flex-col items-center justify-center">
          <PieChart size={36} className="text-lux-muted mb-3" />
          <p className="text-sm font-bold text-lux-text">Sin datos financieros para analizar</p>
          <p className="text-xs text-lux-muted mt-1 max-w-xs">
            Registra transacciones en este mes para generar gráficos de distribución de gastos, desgloses por cuentas y análisis de variación.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* 1. GRÁFICO DE DONA SVG PREMIUM */}
          <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col items-center justify-center">
            <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider mb-5">Distribución de Gastos</h3>
            
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full">
              {/* Círculo SVG de Dona */}
              <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="35" fill="transparent" stroke="rgba(35, 48, 69, 0.2)" strokeWidth="12" />
                  {donutSegments.map((seg, idx) => (
                    <path
                      key={idx}
                      d={seg.pathData}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeLinecap="round"
                      className="transition-all duration-300 hover:stroke-[14px] cursor-pointer"
                    />
                  ))}
                </svg>
                {/* Texto central */}
                <div className="absolute inset-0 flex flex-col justify-center items-center text-center">
                  <span className="text-[10px] uppercase font-bold text-lux-muted tracking-wider leading-none">Total Gastado</span>
                  <span className="text-base font-extrabold text-lux-text mt-1">
                    {Number(currentMonthData.totalExpenses).toFixed(0)}€
                  </span>
                </div>
              </div>

              {/* Leyendas explicativas */}
              <div className="flex-1 flex flex-col gap-2.5 w-full">
                {donutSegments.map((seg, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                      <span className="font-semibold text-lux-muted">{seg.name} ({seg.percent}%)</span>
                    </div>
                    <span className="font-bold text-lux-text">{seg.amount.toFixed(2)}€</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 2. COMPARATIVA CON MES ANTERIOR */}
          {prevMonthData && (
            <div className="glass-panel p-5 rounded-3xl border-lux-border/40">
              <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider mb-4">Comparativa vs Mes Anterior</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Gasto vs Mes Previo</span>
                  {(() => {
                    const diff = currentMonthData.totalExpenses - prevMonthData.totalExpenses;
                    const pct = prevMonthData.totalExpenses > 0 ? (diff / prevMonthData.totalExpenses) * 100 : 0;
                    const isMore = diff > 0;

                    return (
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-lg font-extrabold ${isMore ? 'text-brand-rose' : 'text-brand-emerald'}`}>
                          {pct === 0 ? 'Sin cambios' : `${isMore ? '+' : ''}${pct.toFixed(0)}%`}
                        </span>
                        {pct !== 0 && (
                          <div className={`p-1 rounded-full ${isMore ? 'bg-brand-rose/10 text-brand-rose' : 'bg-brand-emerald/10 text-brand-emerald'}`}>
                            {isMore ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Ahorro Neto vs Mes Previo</span>
                  {(() => {
                    const diff = currentMonthData.saving - prevMonthData.saving;
                    const isMore = diff > 0;

                    return (
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-lg font-extrabold ${isMore ? 'text-brand-emerald' : 'text-brand-rose'}`}>
                          {isMore ? '+' : ''}{diff.toFixed(0)}€
                        </span>
                        <div className={`p-1 rounded-full ${isMore ? 'bg-brand-emerald/10 text-brand-emerald' : 'bg-brand-rose/10 text-brand-rose'}`}>
                          {isMore ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 3. DESGLOSES DE FLUJO (TITULARES Y BANCO) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Desglose por Titular */}
            <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4">
              <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2">
                <Users size={14} className="text-lux-accent" />
                Desglose por Titular
              </h3>
              
              <div className="flex flex-col gap-3.5">
                {Object.entries(holderTotals).map(([holderName, amount]) => {
                  const percent = Math.min((amount / totalExp) * 100, 100);
                  let colorClass = 'bg-lux-accent';
                  if (holderName.includes('Titular 1')) colorClass = 'bg-brand-purple';
                  if (holderName.includes('Titular 2')) colorClass = 'bg-brand-amber';

                  return (
                    <div key={holderName} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-lux-muted">{holderName}</span>
                        <span className="font-bold text-lux-text">
                          {amount.toFixed(2)}€ ({percent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-lux-border/10 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desglose por Cuenta */}
            <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4">
              <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2">
                <Landmark size={14} className="text-lux-accent" />
                Flujo por Cuenta de Banco
              </h3>

              <div className="flex flex-col gap-3.5">
                {Object.entries(accountTotals).map(([accName, amount]) => {
                  const percent = Math.min((amount / totalExp) * 100, 100);
                  
                  return (
                    <div key={accName} className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-lux-muted">{accName}</span>
                        <span className="font-bold text-lux-text">
                          {amount.toFixed(2)}€ ({percent.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-lux-border/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-lux-accent/80 rounded-full transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
