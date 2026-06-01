import React from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel, arePeriodsEqual } from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { PiggyBank, ArrowRight, Sparkles, TrendingUp, HelpCircle, ShieldAlert } from 'lucide-react';

export const SavingsScreen: React.FC = () => {
  const { 
    monthsData, incomes, expenses, unplannedExpenses, installments, savingsConfig, currentPeriod
  } = useApp();

  // Calcular la cascada financiera
  const calculatedMonths = calculateEncainedFinances(
    monthsData, incomes, expenses, unplannedExpenses, installments, savingsConfig
  );

  // Encontrar el saldo actual real al mes de hoy
  const currentMonthData = calculatedMonths.find(
    (c) => c.year === currentPeriod.year && c.month === currentPeriod.month
  );
  const totalRealSavings = currentMonthData ? currentMonthData.finalBalance : (savingsConfig?.initial_balance || 0);

  // Separar reales de proyectados
  const realMonths = calculatedMonths.filter(
    (c) => c.year < currentPeriod.year || (c.year === currentPeriod.year && c.month <= currentPeriod.month)
  );

  const projectedMonths = calculatedMonths.filter(
    (c) => c.year > currentPeriod.year || (c.year === currentPeriod.year && c.month > currentPeriod.month)
  );

  // Renderizar un bloque mensual de 4 filas
  const renderMonthBlock = (mData: any, isProjected: boolean) => {
    return (
      <div 
        key={mData.monthId}
        className={`glass-panel p-5 rounded-3xl border flex flex-col gap-3.5 relative overflow-hidden transition-all duration-300 hover:border-lux-border ${
          isProjected 
            ? 'planning-pattern border-brand-indigo/30 shadow-indigo-950/5' 
            : 'border-lux-border/30 hover:shadow-lg shadow-black/10'
        }`}
      >
        {isProjected && (
          <div className="absolute top-0 right-0 bg-brand-indigo/20 border-b border-l border-brand-indigo/30 text-brand-indigo text-[8px] font-extrabold px-3 py-1 rounded-bl-2xl uppercase tracking-wider animate-pulse">
            Proyectado
          </div>
        )}

        {/* Encabezado del Mes */}
        <div className="flex justify-between items-center pb-2 border-b border-lux-border/10">
          <span className="text-sm font-extrabold text-lux-text">
            {getPeriodLabel(mData.year, mData.month)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
            mData.status === 'closed' 
              ? 'bg-brand-rose/10 text-brand-rose border border-brand-rose/20' 
              : isProjected 
                ? 'bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20' 
                : 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20'
          }`}>
            {mData.status === 'closed' ? 'Cerrado' : isProjected ? 'Planificación' : 'Abierto'}
          </span>
        </div>

        {/* Estructura de 4 filas de cálculo */}
        <div className="flex flex-col gap-2.5 text-xs">
          {/* Fila 1: Saldo del mes anterior */}
          <div className="flex justify-between items-center text-lux-muted font-semibold">
            <span>Saldo mes anterior</span>
            <span>{Number(mData.previousBalance).toFixed(2)}€</span>
          </div>

          {/* Fila 2: Ahorro del mes en curso */}
          <div className="flex justify-between items-center font-bold">
            <span className="text-lux-muted">Ahorro del mes</span>
            <span className={mData.saving >= 0 ? 'text-brand-emerald' : 'text-brand-rose'}>
              {mData.saving >= 0 ? '+' : ''}{Number(mData.saving).toFixed(2)}€
            </span>
          </div>

          {/* Fila 3: Gastos extraordinarios */}
          <div className="flex justify-between items-center font-bold">
            <span className="text-lux-muted">Gastos extras (Ahorros)</span>
            <span className="text-brand-rose">
              -{Number(mData.totalUnplanned).toFixed(2)}€
            </span>
          </div>

          {/* Fila 4: Total final */}
          <div className="flex justify-between items-center pt-2.5 border-t border-lux-border/20 text-sm font-extrabold text-lux-text">
            <span className="flex items-center gap-1">
              <PiggyBank size={14} className="text-lux-accent" />
              Total acumulado
            </span>
            <span className="text-gradient-sky">
              {Number(mData.finalBalance).toFixed(2)}€
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-5 pb-24 animate-fade-in">
      {/* 1. SECTOR DESTACADO INICIAL */}
      <div className="glass-panel p-6 rounded-3xl premium-card flex flex-col items-center justify-center text-center mb-8 relative overflow-hidden">
        <div className="w-14 h-14 bg-gradient-to-tr from-brand-emerald to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-emerald/20 mb-4 animate-bounce-slow">
          <PiggyBank size={28} className="text-white" />
        </div>
        <h2 className="text-xs font-bold text-lux-muted uppercase tracking-widest">Fondo de Ahorro Real</h2>
        <span className="text-3xl lg:text-4xl font-extrabold font-sans text-gradient-emerald mt-2">
          {Number(totalRealSavings).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
        </span>
        <p className="text-[10px] text-lux-muted mt-2 font-medium max-w-xs">
          Suma acumulada histórica desde el saldo inicial de partida ({Number(savingsConfig?.initial_balance || 0).toFixed(0)}€) hasta el mes de hoy.
        </p>
      </div>

      {/* 2. TABLA ENCADENADA MES A MES (DOS COLUMNAS EN DESKTOP) */}
      <div className="flex flex-col gap-6">
        {/* MESES REALES */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Progreso Real Cerrado / Abierto</h3>
          
          {realMonths.length === 0 ? (
            <p className="text-xs text-lux-muted text-center py-4">No hay datos históricos registrados.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {realMonths.map((m) => renderMonthBlock(m, false))}
            </div>
          )}
        </div>

        {/* LÍNEA DIVISORIA DE PROYECCIÓN */}
        {projectedMonths.length > 0 && (
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t-2 border-dashed border-brand-indigo/30"></div>
            </div>
            <span className="relative px-4 py-1 rounded-full text-[9px] font-extrabold bg-lux-bg border border-brand-indigo/40 text-brand-indigo uppercase tracking-wider flex items-center gap-1 shadow-md">
              <TrendingUp size={10} />
              Línea de Proyección (6 Meses Futuros)
            </span>
          </div>
        )}

        {/* MESES PROYECTADOS FUTUROS */}
        {projectedMonths.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Proyección de Ahorro Futuro</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectedMonths.map((m) => renderMonthBlock(m, true))}
            </div>
            <p className="text-[10px] text-lux-muted italic text-center mt-2 px-4">
              * Nota: Las proyecciones futuras no modifican tu balance de ahorro real acumulado hasta que esos meses transcurran y sus balances sean consolidados.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
