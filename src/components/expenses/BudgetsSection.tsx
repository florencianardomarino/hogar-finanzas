import React, { useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Panel } from '../ui/Panel';
import { BudgetBar } from '../ui/BudgetBar';
import { getPeriodLabel } from '../../utils/dateUtils';
import type { MonthPlan } from '../../utils/planUtils';
import type { ExpenseCategory } from '../../types';

interface BudgetsSectionProps {
  plan: MonthPlan;
  categories: ExpenseCategory[];
  year: number;
  month: number;
  monthClosed: boolean;
  /** Abre el registro de gasto con la categoría ya elegida (compra parcial) */
  onAddPurchase: (categoryId: string) => void;
}

const fmt = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const BudgetsSection: React.FC<BudgetsSectionProps> = ({
  plan, categories, year, month, monthClosed, onAddPurchase
}) => {
  const { categoryBudgets, categoryBudgetsReady, setCategoryBudget, showToast } = useApp();
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustValue, setAdjustValue] = useState('');
  const [saving, setSaving] = useState(false);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const lines = plan.budgets.filter((b) => categoryById.has(b.categoryId) && (b.budget > 0 || hasOverride(b.categoryId)));

  function hasOverride(categoryId: string) {
    return categoryBudgets.some((o) => o.category_id === categoryId && o.year === year && o.month === month);
  }

  if (lines.length === 0) return null;

  const adjustingCat = adjustingId ? categoryById.get(adjustingId) : null;
  const adjustingHasOverride = adjustingId ? hasOverride(adjustingId) : false;

  const openAdjust = (categoryId: string, currentBudget: number) => {
    setAdjustingId(categoryId);
    setAdjustValue(String(currentBudget));
  };

  const save = async (amount: number | null) => {
    if (!adjustingId) return;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
      showToast('Ingresá un importe válido (0 o más)', 'error');
      return;
    }
    setSaving(true);
    try {
      await setCategoryBudget(adjustingId, year, month, amount);
      setAdjustingId(null);
    } catch {
      // setCategoryBudget ya muestra el aviso de error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4 mb-5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-lux-muted">Presupuestos del mes</span>

      {lines.map((line) => (
        <BudgetBar
          key={line.categoryId}
          line={line}
          category={categoryById.get(line.categoryId)!}
          monthClosed={monthClosed}
          actions={
            !monthClosed && (
              <div className="flex items-center gap-1.5 shrink-0">
                {categoryBudgetsReady && (
                  <button
                    type="button"
                    onClick={() => openAdjust(line.categoryId, line.budget)}
                    className="p-1.5 text-lux-muted hover:text-lux-text hover:bg-lux-border/40 rounded-lg transition-colors cursor-pointer"
                    title="Ajustar el presupuesto de este mes"
                    aria-label={`Ajustar el presupuesto de ${categoryById.get(line.categoryId)!.name} para este mes`}
                  >
                    <SlidersHorizontal size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAddPurchase(line.categoryId)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-brand-rose/10 border border-brand-rose/20 text-brand-rose hover:bg-brand-rose/20 transition-colors cursor-pointer"
                >
                  <Plus size={12} />
                  Sumar compra
                </button>
              </div>
            )
          }
        />
      ))}

      <Panel
        isOpen={adjustingId !== null}
        onClose={() => setAdjustingId(null)}
        title="Presupuesto del mes"
      >
        {adjustingCat && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-lux-muted">
              Ajustá el presupuesto de <strong className="text-lux-text">{adjustingCat.name}</strong> solo para{' '}
              {getPeriodLabel(year, month)}. Los demás meses siguen con el presupuesto base
              {adjustingCat.budget_limit ? ` (${fmt(Number(adjustingCat.budget_limit))})` : ''}.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="budget-adjust" className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
                Importe para este mes (€)
              </label>
              <input
                id="budget-adjust"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={adjustValue}
                onChange={(e) => setAdjustValue(e.target.value)}
                className="bg-lux-panel/50 border border-lux-border/40 rounded-2xl px-4 py-3 text-sm text-lux-text focus:outline-none focus:border-lux-accent/60"
              />
            </div>

            <button
              type="button"
              disabled={saving || adjustValue.trim() === ''}
              onClick={() => save(parseFloat(adjustValue))}
              className="bg-brand-rose text-white px-4 py-3 rounded-2xl text-sm font-bold disabled:opacity-50 cursor-pointer"
            >
              Guardar para este mes
            </button>

            {adjustingHasOverride && (
              <button
                type="button"
                disabled={saving}
                onClick={() => save(null)}
                className="px-4 py-3 rounded-2xl text-sm font-bold border border-lux-border/40 text-lux-muted hover:text-lux-text disabled:opacity-50 cursor-pointer"
              >
                Volver al presupuesto base
              </button>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
};
