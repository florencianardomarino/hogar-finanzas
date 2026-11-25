import React, { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Panel } from '../ui/Panel';
import { Spinner } from '../ui/Spinner';
import type { HouseholdResetScope } from '../../types';

type PartialScope = Exclude<HouseholdResetScope, 'months'>;

const OPTIONS: { scope: PartialScope; label: string; detail: string }[] = [
  { scope: 'incomes', label: 'Ingresos', detail: 'Recurrentes y ocasionales de todos los meses.' },
  { scope: 'expenses', label: 'Gastos corrientes', detail: 'Todos los gastos de todos los meses, incluidos los recurrentes.' },
  { scope: 'installments', label: 'Cuotas y préstamos', detail: 'Todos los planes de cuotas y sus gastos.' },
  { scope: 'unplanned', label: 'Gastos extras', detail: 'Los gastos inesperados que salieron del ahorro.' },
  {
    scope: 'savings',
    label: 'Ahorros',
    detail: 'Saldo inicial, ajuste manual del saldo, y asignaciones y gastos de las cuentas de ahorro. Las cuentas en sí se conservan.'
  },
];

const ALL_SCOPES: PartialScope[] = OPTIONS.map((o) => o.scope);

const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const ResetDataSection: React.FC = () => {
  const { activeHousehold, exportHouseholdData, resetHouseholdData, showToast } = useApp();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PartialScope[]>([]);
  const [everything, setEverything] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [working, setWorking] = useState(false);

  if (!activeHousehold) return null;

  const householdName = activeHousehold.name;
  const scopes: HouseholdResetScope[] = everything ? [...ALL_SCOPES, 'months'] : selected;
  const nameMatches = confirmText.trim().toLowerCase() === householdName.trim().toLowerCase();
  const canConfirm = scopes.length > 0 && nameMatches && !working;

  const close = () => {
    if (working) return;
    setOpen(false);
    setSelected([]);
    setEverything(false);
    setConfirmText('');
  };

  const toggle = (scope: PartialScope) =>
    setSelected((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setWorking(true);
    try {
      // Primero se descarga una copia; si falla, no se borra nada
      const backup = await exportHouseholdData();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(backup, `homeflow-copia-${stamp}.json`);
    } catch (e) {
      console.error('Error exporting household data:', e);
      showToast('No se pudo generar la copia de seguridad. No se borró nada.', 'error');
      setWorking(false);
      return;
    }

    try {
      await resetHouseholdData(scopes);
      setWorking(false);
      close();
    } catch {
      // resetHouseholdData ya muestra el aviso de error
      setWorking(false);
    }
  };

  // El panel va fuera de la tarjeta: .glass-panel usa backdrop-filter y eso hace que un elemento
  // fixed quede confinado a la tarjeta en vez de ocupar toda la pantalla.
  return (
    <>
    <div className="glass-panel p-5 rounded-3xl border border-brand-rose/30 flex flex-col gap-3 mx-4 mt-6 mb-4">
      <div className="flex items-center gap-2 text-brand-rose">
        <AlertTriangle size={16} />
        <h3 className="text-sm font-bold">Zona de peligro</h3>
      </div>
      <p className="text-xs text-lux-muted leading-relaxed">
        Restablecé ingresos, gastos, ahorros o toda la cuenta del hogar. Antes de borrar se descarga una copia
        de seguridad de todo lo que tenés cargado.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start px-4 py-2.5 rounded-2xl text-xs font-bold border border-brand-rose/40 text-brand-rose hover:bg-brand-rose/10 transition-colors cursor-pointer"
      >
        Restablecer datos…
      </button>
    </div>

      <Panel isOpen={open} onClose={close} title="Restablecer datos">
        <div className="flex flex-col gap-5">
          <p className="text-xs text-lux-muted leading-relaxed">
            Elegí qué querés borrar de <strong className="text-lux-text">{householdName}</strong>. Esta acción no se
            puede deshacer desde la app: la copia que se descarga es tu respaldo.
          </p>

          <div className="flex flex-col gap-2">
            {OPTIONS.map((o) => {
              const checked = everything || selected.includes(o.scope);
              return (
                <label
                  key={o.scope}
                  className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                    checked ? 'border-brand-rose/50 bg-brand-rose/5' : 'border-lux-border/40 bg-lux-panel/30'
                  } ${everything ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={everything || working}
                    onChange={() => toggle(o.scope)}
                    className="mt-0.5 accent-red-500"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-lux-text">{o.label}</span>
                    <span className="text-[11px] text-lux-muted leading-snug">{o.detail}</span>
                  </span>
                </label>
              );
            })}

            <label
              className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition-colors ${
                everything ? 'border-brand-rose bg-brand-rose/10' : 'border-lux-border/40 bg-lux-panel/30'
              }`}
            >
              <input
                type="checkbox"
                checked={everything}
                disabled={working}
                onChange={(e) => setEverything(e.target.checked)}
                className="mt-0.5 accent-red-500"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-bold text-brand-rose">Toda la cuenta</span>
                <span className="text-[11px] text-lux-muted leading-snug">
                  Todo lo anterior y además los meses, incluidos los cerrados y sus saldos congelados. Se conservan
                  los miembros, las categorías, los titulares, las cuentas y los ajustes del hogar.
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="reset-confirm" className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
              Para confirmar, escribí el nombre del hogar: <span className="text-lux-text normal-case">{householdName}</span>
            </label>
            <input
              id="reset-confirm"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={working}
              autoComplete="off"
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-brand-rose rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            aria-busy={working}
            className="w-full bg-gradient-to-r from-brand-rose to-red-600 text-white text-sm font-bold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {working ? (
              <>
                <Spinner />
                <span>Descargando copia y borrando...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Descargar copia y borrar</span>
              </>
            )}
          </button>
        </div>
      </Panel>
    </>
  );
};
