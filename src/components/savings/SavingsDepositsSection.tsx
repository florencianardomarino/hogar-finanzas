import React, { useState } from 'react';
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Panel } from '../ui/Panel';
import { Spinner } from '../ui/Spinner';
import { toISODateString, formatCompactDate } from '../../utils/dateUtils';

const fmtEur = (n: number) => Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const inputClass =
  'w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text';
const labelClass = 'text-xs font-semibold text-lux-muted uppercase tracking-wider';

// Acepta coma o punto como separador decimal
const parseNumber = (v: string) => parseFloat(v.replace(',', '.'));

/** Ingresos puntuales al fondo de ahorros hechos en otra moneda (hoy, dólares), convertidos a euros. */
export const SavingsDepositsSection: React.FC = () => {
  const { savingsDeposits, savingsDepositsReady, addSavingsDeposit, deleteSavingsDeposit } = useApp();

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [usd, setUsd] = useState('');
  const [rate, setRate] = useState('');
  const [date, setDate] = useState(toISODateString(new Date()));
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const usdValue = parseNumber(usd);
  const rateValue = parseNumber(rate);
  const valid = usdValue > 0 && rateValue > 0 && !!date;
  const eurPreview = valid ? Math.round(usdValue * rateValue * 100) / 100 : 0;

  const reset = () => {
    setDescription(''); setUsd(''); setRate(''); setDate(toISODateString(new Date()));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    try {
      await addSavingsDeposit({
        date,
        description: description || 'Dólares convertidos',
        original_amount: usdValue,
        original_currency: 'USD',
        exchange_rate: rateValue
      });
      reset();
      setOpen(false);
    } catch {
      // el contexto ya avisó del error; el panel queda abierto para reintentar
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteSavingsDeposit(id);
    } catch {
      // el contexto ya avisó del error
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="glass-panel p-5 rounded-3xl mb-8">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-lux-accent" />
            <h3 className="text-sm font-bold text-lux-text">Ingresos en dólares</h3>
          </div>
          <button
            onClick={() => setOpen(true)}
            disabled={!savingsDepositsReady}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-lux-accent/15 text-lux-accent text-[11px] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={13} /> Agregar
          </button>
        </div>

        {!savingsDepositsReady && (
          <p className="text-[11px] text-lux-muted">
            Para usar esta función hay que ejecutar <strong>migration_savings_deposits.sql</strong> en Supabase.
          </p>
        )}

        {savingsDepositsReady && savingsDeposits.length === 0 && (
          <p className="text-[11px] text-lux-muted">
            Sumá dólares al fondo: se convierten a euros con la cotización que indiques y quedan registrados.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {savingsDeposits.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-lux-bg/50 border border-lux-border/40">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-lux-text truncate">{d.description}</p>
                <p className="text-[10px] text-lux-muted">
                  {formatCompactDate(d.date)} · {Number(d.original_amount).toLocaleString('de-DE')} {d.original_currency} × {Number(d.exchange_rate).toLocaleString('de-DE', { maximumFractionDigits: 6 })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-extrabold text-brand-emerald">+{fmtEur(d.amount)}</span>
                <button
                  onClick={() => handleDelete(d.id)}
                  disabled={deletingId === d.id}
                  aria-label="Eliminar ingreso"
                  className="p-1.5 rounded-lg text-lux-muted hover:text-brand-rose cursor-pointer disabled:opacity-60"
                >
                  {deletingId === d.id ? <Spinner size={14} /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Panel isOpen={open} onClose={() => setOpen(false)} title="Ingreso en dólares">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Descripción (opcional)</label>
            <input type="text" placeholder="Ej: Dólares ahorrados" value={description}
              onChange={(e) => setDescription(e.target.value)} className={inputClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Importe (USD)</label>
            <input type="text" inputMode="decimal" required placeholder="0,00" value={usd}
              onChange={(e) => setUsd(e.target.value)} className={inputClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Cotización (€ por cada 1 USD)</label>
            <input type="text" inputMode="decimal" required placeholder="Ej: 0,92" value={rate}
              onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Fecha</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>

          <div className="p-4 rounded-2xl bg-lux-accent/10 border border-lux-accent/20 text-center">
            <p className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Entra al fondo</p>
            <p className="text-2xl font-extrabold text-lux-accent mt-1">{fmtEur(eurPreview)}</p>
          </div>

          <button
            type="submit"
            disabled={!valid || saving}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-lux-accent text-white text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Spinner size={14} />}
            {saving ? 'Guardando…' : 'Agregar al fondo'}
          </button>
        </form>
      </Panel>
    </>
  );
};
