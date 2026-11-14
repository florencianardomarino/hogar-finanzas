import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ExpenseCategory } from '../../types';
import type { BudgetLine } from '../../utils/planUtils';

interface BudgetBarProps {
  line: BudgetLine;
  category: Pick<ExpenseCategory, 'name' | 'color'>;
  monthClosed: boolean;
  /** Botones opcionales a la derecha del nombre (sumar compra, ajustar mes) */
  actions?: React.ReactNode;
}

const fmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const BudgetBar: React.FC<BudgetBarProps> = ({ line, category, monthClosed, actions }) => {
  const over = line.overspent > 0;
  const spentPercent = Math.min((line.spent / line.budget) * 100, 100);
  const committedPercent = Math.min((line.committed / line.budget) * 100, 100);
  const remaining = Math.max(line.budget - line.committed, 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-lux-text min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
          <span className="truncate">{category.name}</span>
        </span>
        <span className={`font-bold shrink-0 ${over ? 'text-brand-rose' : 'text-lux-muted'}`}>
          {fmt(line.spent)} / {fmt(line.budget)}
        </span>
      </div>

      {/* Barra clara = comprometido (incluye compras con fecha futura); barra sólida = ya debitado */}
      <div
        className="relative w-full h-2 bg-lux-border/30 rounded-full overflow-hidden"
        role="progressbar"
        aria-label={`Presupuesto de ${category.name}`}
        aria-valuenow={Math.round(spentPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${over ? 'bg-brand-rose/30' : 'bg-brand-amber/30'}`}
          style={{ width: `${committedPercent}%` }}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
            over ? 'bg-brand-rose' : 'bg-brand-emerald'
          }`}
          style={{ width: `${spentPercent}%` }}
        />
      </div>

      <div className="flex justify-between items-center gap-2">
        {over ? (
          <span className="flex items-center gap-1.5 text-[10px] text-brand-rose font-semibold">
            <AlertTriangle size={12} />
            Superaste el presupuesto por {fmt(line.overspent)}
          </span>
        ) : (
          <span className="text-[10px] text-lux-muted">
            {monthClosed ? 'Mes cerrado' : `Te quedan ${fmt(remaining)} para este mes`}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
};
