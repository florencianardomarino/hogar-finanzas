import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel } from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { Panel } from '../ui/Panel';
import { AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';

interface ResetBalancePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

/**
 * Panel para restablecer el saldo acumulado del Fondo de Ahorro a un mes ya cerrado.
 * Guarda un "ancla": el saldo real al cierre de ese mes. Los meses posteriores
 * (incluidos los ahorros corrientes del mes en curso) se encadenan desde ese valor.
 */
export const ResetBalancePanel: React.FC<ResetBalancePanelProps> = ({ isOpen, onClose }) => (
  <Panel isOpen={isOpen} onClose={onClose} title="Restablecer saldo de ahorros">
    {/* El formulario solo se monta mientras el panel está abierto, por lo que arranca limpio cada vez */}
    <ResetBalanceForm onClose={onClose} />
  </Panel>
);

const ResetBalanceForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const {
    monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments,
    savingsConfig, savingsAllocations, currentPeriod, activeHousehold, resetSavingsBalance
  } = useApp();

  const billingDay = activeHousehold?.billing_cycle_start_day || 10;

  const hasAnchor =
    savingsConfig?.anchor_year != null &&
    savingsConfig?.anchor_month != null &&
    savingsConfig?.anchor_balance != null;

  // Saldo calculado "de forma natural" (ignorando cualquier ajuste manual previo)
  const naturalMonths = useMemo(() => {
    const cfg = savingsConfig
      ? { ...savingsConfig, anchor_year: null, anchor_month: null, anchor_balance: null }
      : null;
    return calculateEncainedFinances(
      monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, cfg, billingDay, savingsAllocations
    );
  }, [monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig, billingDay, savingsAllocations]);

  // Meses ya terminados (anteriores al período en curso), del más reciente al más antiguo
  const pastMonths = useMemo(
    () =>
      naturalMonths
        .filter((c) => c.year < currentPeriod.year || (c.year === currentPeriod.year && c.month < currentPeriod.month))
        .reverse()
        .slice(0, 12),
    [naturalMonths, currentPeriod]
  );

  // Por defecto: el mes cerrado más reciente
  const [selectedKey, setSelectedKey] = useState(() =>
    pastMonths[0] ? `${pastMonths[0].year}-${pastMonths[0].month}` : ''
  );
  const [balanceInput, setBalanceInput] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveKey = selectedKey || (pastMonths[0] ? `${pastMonths[0].year}-${pastMonths[0].month}` : '');
  const selected = pastMonths.find((c) => `${c.year}-${c.month}` === effectiveKey) || null;
  const parsedBalance = balanceInput.trim() === '' ? NaN : parseFloat(balanceInput.replace(',', '.'));
  const isValid = selected !== null && !isNaN(parsedBalance);

  // Saldo del fondo actual (con el ajuste vigente, si lo hay)
  const currentMonthNow = useMemo(() => {
    const months = calculateEncainedFinances(
      monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig, billingDay, savingsAllocations
    );
    return months.find((c) => c.year === currentPeriod.year && c.month === currentPeriod.month) || null;
  }, [monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig, billingDay, savingsAllocations, currentPeriod]);

  // Vista previa: cómo quedaría el fondo con el nuevo saldo
  const preview = useMemo(() => {
    if (!isValid || !selected || !savingsConfig) return null;
    const draft = {
      ...savingsConfig,
      anchor_year: selected.year,
      anchor_month: selected.month,
      anchor_balance: parsedBalance
    };
    const months = calculateEncainedFinances(
      monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, draft, billingDay, savingsAllocations
    );
    return months.find((c) => c.year === currentPeriod.year && c.month === currentPeriod.month) || null;
  }, [isValid, selected, parsedBalance, savingsConfig, monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, billingDay, savingsAllocations, currentPeriod]);

  const difference = isValid && selected ? parsedBalance - selected.finalBalance : 0;
  const currentMonthLabel = getPeriodLabel(currentPeriod.year, currentPeriod.month);

  const handleConfirm = async () => {
    if (!isValid || !selected || !confirmed) return;
    setSaving(true);
    try {
      await resetSavingsBalance(selected.year, selected.month, Math.round(parsedBalance * 100) / 100, selected.finalBalance);
      onClose();
    } catch {
      // El contexto ya muestra el aviso de error
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-5">
        {/* ADVERTENCIA PRINCIPAL */}
        <div className="rounded-2xl border border-brand-amber/40 bg-brand-amber/10 p-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 text-brand-amber font-extrabold text-xs uppercase tracking-wider">
            <AlertTriangle size={14} />
            Atención: esta acción sobrescribe el saldo
          </div>
          <ul className="text-[11px] text-lux-text leading-relaxed list-disc pl-4 flex flex-col gap-1">
            <li>
              Vas a indicar el <strong>saldo real de ahorros al cierre de un mes ya terminado</strong>.
              Reemplaza el número que calculó la app para ese mes.
            </li>
            <li>
              Los <strong>meses anteriores no se modifican</strong>. Desde el mes siguiente, el saldo se calcula a partir de tu nuevo número.
            </li>
            <li>
              Los <strong>ahorros corrientes de {currentMonthLabel}</strong> (ingresos − gastos) se suman automáticamente encima.
            </li>
            <li>
              No borra ingresos, gastos ni cuotas. Podés deshacerlo en cualquier momento con «Quitar ajuste».
            </li>
          </ul>
        </div>

        {hasAnchor && (
          <div className="rounded-2xl border border-lux-border/40 bg-lux-bg/50 p-3 text-[11px] text-lux-muted leading-relaxed">
            Ya existe un ajuste manual:{' '}
            <strong className="text-lux-text">
              {fmt(Number(savingsConfig?.anchor_balance))} al cierre de{' '}
              {getPeriodLabel(Number(savingsConfig?.anchor_year), Number(savingsConfig?.anchor_month))}
            </strong>
            . Si continuás, este nuevo ajuste lo reemplaza.
          </div>
        )}

        {pastMonths.length === 0 ? (
          <p className="text-xs text-lux-muted text-center py-4">
            Todavía no hay meses anteriores al período en curso sobre los que ajustar el saldo.
          </p>
        ) : (
          <>
            {/* PASO 1: MES DE REFERENCIA */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
                1. Mes cerrado de referencia
              </label>
              <select
                value={effectiveKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text cursor-pointer"
              >
                {pastMonths.map((c) => (
                  <option key={`${c.year}-${c.month}`} value={`${c.year}-${c.month}`} className="bg-lux-panel text-lux-text">
                    {getPeriodLabel(c.year, c.month)}
                  </option>
                ))}
              </select>
              {selected && (
                <p className="text-[11px] text-lux-muted">
                  La app calcula actualmente al cierre de {getPeriodLabel(selected.year, selected.month)}:{' '}
                  <strong className="text-lux-text">{fmt(selected.finalBalance)}</strong>
                </p>
              )}
            </div>

            {/* PASO 2: SALDO REAL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
                2. Saldo real al cierre de ese mes (€)
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={balanceInput}
                onChange={(e) => setBalanceInput(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>

            {/* VISTA PREVIA */}
            {isValid && selected && (
              <div className="rounded-2xl border border-lux-border/40 bg-lux-bg/50 p-4 flex flex-col gap-2.5 text-xs">
                <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Vista previa</span>
                <div className="flex justify-between items-center">
                  <span className="text-lux-muted">Diferencia con el cálculo de la app</span>
                  <span className={`font-extrabold ${difference >= 0 ? 'text-brand-emerald' : 'text-brand-rose'}`}>
                    {difference >= 0 ? '+' : ''}{fmt(difference)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-lux-muted">
                    {selected.year * 12 + selected.month === currentPeriod.year * 12 + currentPeriod.month - 1
                      ? `Ahorro de ${currentMonthLabel} que se suma`
                      : `Ahorros posteriores que se suman (hasta ${currentMonthLabel})`}
                  </span>
                  <span className="font-bold text-lux-text">
                    {preview ? fmt(preview.finalBalance - parsedBalance) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-lux-border/30">
                  <div className="flex flex-col">
                    <span className="text-[10px] text-lux-muted uppercase font-bold">Fondo hoy</span>
                    <span className="font-extrabold text-lux-text">
                      {currentMonthNow ? fmt(currentMonthNow.finalBalance) : '—'}
                    </span>
                  </div>
                  <ArrowRight size={16} className="text-lux-muted shrink-0" />
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-lux-muted uppercase font-bold">Fondo nuevo</span>
                    <span className="font-extrabold text-brand-emerald">
                      {preview ? fmt(preview.finalBalance) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* CONFIRMACIÓN */}
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer"
              />
              <span className="text-[11px] text-lux-text leading-relaxed">
                Entiendo que esto reemplaza el saldo calculado por la app a partir del mes elegido.
              </span>
            </label>

            <button
              type="button"
              disabled={!isValid || !confirmed || saving}
              onClick={handleConfirm}
              className="w-full bg-gradient-to-r from-brand-amber to-orange-600 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              <RotateCcw size={14} />
              {saving ? 'Guardando...' : 'Restablecer saldo'}
            </button>
          </>
        )}
      </div>
    </>
  );
};
