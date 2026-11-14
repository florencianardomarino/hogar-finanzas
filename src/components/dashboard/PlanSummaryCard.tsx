import React from 'react';
import type { ExpenseCategory } from '../../types';
import type { MonthPlan } from '../../utils/planUtils';
import { BudgetBar } from '../ui/BudgetBar';

interface PlanSummaryCardProps {
  plan: MonthPlan;
  categories: ExpenseCategory[];
  monthClosed: boolean;
}

const fmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const PlanSummaryCard: React.FC<PlanSummaryCardProps> = ({ plan, categories, monthClosed }) => {
  const paidPercent = plan.planned > 0 ? Math.min((plan.real / plan.planned) * 100, 100) : 0;
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const budgetLines = plan.budgets.filter((b) => b.budget > 0 && categoryById.has(b.categoryId));

  return (
    <div className="mx-4 mt-5 glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4">
      <h3 className="text-sm font-bold text-lux-text">Planificado vs. real</h3>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-lux-muted">Planificado</span>
          <span className="text-sm font-extrabold text-lux-text">{fmt(plan.planned)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-lux-muted">Ya debitado</span>
          <span className="text-sm font-extrabold text-brand-emerald">{fmt(plan.real)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-lux-muted">Falta pagar</span>
          <span className={`text-sm font-extrabold ${plan.pending > 0 ? 'text-amber-500' : 'text-lux-muted'}`}>
            {fmt(plan.pending)}
          </span>
        </div>
      </div>

      <div className="w-full h-2 bg-lux-border/30 rounded-full overflow-hidden" role="progressbar"
        aria-label="Porcentaje de lo planificado que ya se debitó"
        aria-valuenow={Math.round(paidPercent)} aria-valuemin={0} aria-valuemax={100}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-brand-emerald transition-all duration-500 ease-out"
          style={{ width: `${paidPercent}%` }}
        />
      </div>

      {!monthClosed && (
        <div className="flex flex-col gap-1.5 text-xs border-t border-lux-border/30 pt-3">
          <div className="flex justify-between items-center">
            <span className="text-lux-muted">Saldo hoy (cobrado − debitado)</span>
            <span className="font-bold text-lux-text">{fmt(plan.balanceToday)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-lux-muted">Saldo a fin de mes (si se cumple todo)</span>
            <span className={`font-bold ${plan.projectedBalance >= 0 ? 'text-lux-text' : 'text-brand-rose'}`}>
              {fmt(plan.projectedBalance)}
            </span>
          </div>
        </div>
      )}

      {budgetLines.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-lux-border/30 pt-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-lux-muted">Presupuestos del mes</span>
          {budgetLines.map((line) => (
            <BudgetBar
              key={line.categoryId}
              line={line}
              category={categoryById.get(line.categoryId)!}
              monthClosed={monthClosed}
            />
          ))}
        </div>
      )}
    </div>
  );
};
