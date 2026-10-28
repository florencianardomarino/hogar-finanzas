import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel, getPeriodList, toISODateString, formatCompactDate } from '../../utils/dateUtils';
import { calculateEncainedFinances, getAllocationAmount } from '../../utils/financeUtils';
import { AllocationKind, SavingsAccount, SavingsAccountExpense } from '../../types';
import { Panel } from '../ui/Panel';
import { ChipsSelector } from '../ui/ChipsSelector';
import {
  Wallet, Plus, Edit3, Trash2, ChevronDown, Calendar, Percent, Euro, Database, ArrowDownToLine, Receipt, Info, CreditCard
} from 'lucide-react';
import { CancelDebtModal } from './CancelDebtModal';

const ACCOUNT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899'];

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const inputClass =
  'w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text';
const labelClass = 'text-xs font-semibold text-lux-muted uppercase tracking-wider';

export const SavingsAccountsSection: React.FC = () => {
  const {
    savingsAccounts, savingsAllocations, savingsAccountExpenses, savingsAccountsReady,
    monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig,
    currentPeriod, activeHousehold,
    addSavingsAccount, updateSavingsAccount, deleteSavingsAccount,
    setSavingsAllocation, deleteSavingsAllocation,
    addSavingsAccountExpense, updateSavingsAccountExpense, deleteSavingsAccountExpense
  } = useApp();

  const billingDay = activeHousehold?.billing_cycle_start_day || 10;

  // -------------------------------------------------------------------
  // CÁLCULOS: asignaciones mensuales (incluye % sobre ingresos) y saldos
  // -------------------------------------------------------------------
  const calculatedMonths = useMemo(
    () =>
      calculateEncainedFinances(
        monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig, billingDay, savingsAllocations
      ),
    [monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig, billingDay, savingsAllocations]
  );

  const isUpToCurrent = (year: number, month: number) =>
    year < currentPeriod.year || (year === currentPeriod.year && month <= currentPeriod.month);

  const getStats = (accountId: string) => {
    let allocatedToDate = 0;
    let scheduled = 0;
    calculatedMonths.forEach((m) => {
      const amount = m.allocationsByAccount[accountId] || 0;
      if (isUpToCurrent(m.year, m.month)) allocatedToDate += amount;
      else scheduled += amount;
    });
    const spent = savingsAccountExpenses
      .filter((e) => e.savings_account_id === accountId)
      .reduce((acc, e) => acc + Number(e.amount), 0);
    const currentMonthCalc = calculatedMonths.find(
      (m) => m.year === currentPeriod.year && m.month === currentPeriod.month
    );
    return {
      allocatedToDate,
      scheduled,
      spent,
      available: allocatedToDate - spent,
      allocatedThisMonth: currentMonthCalc?.allocationsByAccount[accountId] || 0
    };
  };

  const totalAvailable = savingsAccounts.reduce((acc, a) => acc + getStats(a.id).available, 0);

  // -------------------------------------------------------------------
  // ESTADO DE PANELES
  // -------------------------------------------------------------------
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Cuenta (crear / editar)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SavingsAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accColor, setAccColor] = useState(ACCOUNT_COLORS[0]);

  // Asignación mensual
  const [allocPanelOpen, setAllocPanelOpen] = useState(false);
  const [allocAccountId, setAllocAccountId] = useState('');
  const [allocPeriodKey, setAllocPeriodKey] = useState('');
  const [allocKind, setAllocKind] = useState<AllocationKind>('percent');
  const [allocValue, setAllocValue] = useState('');

  // Gasto de la cuenta (crear / editar)
  const [expPanelOpen, setExpPanelOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<SavingsAccountExpense | null>(null);
  const [expAccountId, setExpAccountId] = useState('');
  const [expDesc, setExpDesc] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expDate, setExpDate] = useState(toISODateString(new Date()));
  const [expNotes, setExpNotes] = useState('');

  // Cancelar deudas con saldo de ahorro
  const [cancelDebtModalOpen, setCancelDebtModalOpen] = useState(false);
  const [cancelDebtAccountId, setCancelDebtAccountId] = useState<string>('');

  const openCancelDebt = (accountId?: string) => {
    setCancelDebtAccountId(accountId || (savingsAccounts[0]?.id || ''));
    setCancelDebtModalOpen(true);
  };

  const periodOptions = getPeriodList(currentPeriod, 6, 6);

  // ---------------------------- Cuenta ----------------------------
  const openCreateAccount = () => {
    setEditingAccount(null);
    setAccName('');
    setAccColor(ACCOUNT_COLORS[savingsAccounts.length % ACCOUNT_COLORS.length]);
    setAccountPanelOpen(true);
  };

  const openEditAccount = (acc: SavingsAccount) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccColor(acc.color);
    setAccountPanelOpen(true);
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    try {
      if (editingAccount) {
        await updateSavingsAccount(editingAccount.id, { name: accName.trim(), color: accColor });
      } else {
        await addSavingsAccount(accName, accColor);
      }
      setAccountPanelOpen(false);
    } catch {
      // El contexto ya muestra el aviso de error
    }
  };

  const handleDeleteAccount = async (acc: SavingsAccount) => {
    const stats = getStats(acc.id);
    const movements = savingsAccountExpenses.filter((x) => x.savings_account_id === acc.id).length;
    const allocations = savingsAllocations.filter((x) => x.savings_account_id === acc.id).length;
    const ok = window.confirm(
      `¿Eliminar la cuenta "${acc.name}"?\n\n` +
      `Se borrarán también sus ${allocations} asignaciones mensuales y sus ${movements} gastos.\n` +
      `Los ${fmt(stats.allocatedToDate)} asignados volverán a sumarse al Fondo de Ahorro principal.\n\n` +
      `Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    try {
      await deleteSavingsAccount(acc.id);
    } catch {
      // El contexto ya muestra el aviso de error
    }
  };

  // ---------------------------- Asignación ----------------------------
  const openAllocation = (accountId: string) => {
    setAllocAccountId(accountId);
    setAllocPeriodKey(`${currentPeriod.year}-${currentPeriod.month}`);
    const existing = savingsAllocations.find(
      (a) => a.savings_account_id === accountId && a.year === currentPeriod.year && a.month === currentPeriod.month
    );
    setAllocKind(existing?.kind || 'percent');
    setAllocValue(existing ? String(existing.value) : '');
    setAllocPanelOpen(true);
  };

  const allocPeriod = (() => {
    const [y, m] = allocPeriodKey.split('-').map(Number);
    return { year: y, month: m };
  })();

  const existingAllocation = savingsAllocations.find(
    (a) => a.savings_account_id === allocAccountId && a.year === allocPeriod.year && a.month === allocPeriod.month
  );

  const handleAllocPeriodChange = (key: string) => {
    setAllocPeriodKey(key);
    const [y, m] = key.split('-').map(Number);
    const existing = savingsAllocations.find(
      (a) => a.savings_account_id === allocAccountId && a.year === y && a.month === m
    );
    if (existing) {
      setAllocKind(existing.kind);
      setAllocValue(String(existing.value));
    } else {
      setAllocValue('');
    }
  };

  const allocMonthCalc = calculatedMonths.find((m) => m.year === allocPeriod.year && m.month === allocPeriod.month);
  const allocMonthIncomes = allocMonthCalc?.totalIncomes || 0;
  const allocParsed = allocValue.trim() === '' ? NaN : parseFloat(allocValue.replace(',', '.'));
  const allocValid = !isNaN(allocParsed) && allocParsed >= 0 && !(allocKind === 'percent' && allocParsed > 100);
  const allocPreviewAmount = allocValid ? getAllocationAmount({ kind: allocKind, value: allocParsed }, allocMonthIncomes) : 0;

  const handleAllocSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocAccountId || !allocValid) return;
    try {
      await setSavingsAllocation(allocAccountId, allocPeriod.year, allocPeriod.month, allocKind, allocParsed);
      setAllocPanelOpen(false);
    } catch {
      // El contexto ya muestra el aviso de error
    }
  };

  // ---------------------------- Gastos ----------------------------
  const openCreateExpense = (accountId: string) => {
    setEditingExpense(null);
    setExpAccountId(accountId);
    setExpDesc('');
    setExpAmount('');
    setExpDate(toISODateString(new Date()));
    setExpNotes('');
    setExpPanelOpen(true);
  };

  const openEditExpense = (exp: SavingsAccountExpense) => {
    setEditingExpense(exp);
    setExpAccountId(exp.savings_account_id);
    setExpDesc(exp.description);
    setExpAmount(String(exp.amount));
    setExpDate(exp.date);
    setExpNotes(exp.notes || '');
    setExpPanelOpen(true);
  };

  const expParsed = expAmount.trim() === '' ? NaN : parseFloat(expAmount.replace(',', '.'));
  const expAccountStats = expAccountId ? getStats(expAccountId) : null;
  // Disponible tras este gasto (si se edita, se devuelve primero el importe anterior)
  const expAvailableAfter =
    expAccountStats && !isNaN(expParsed)
      ? expAccountStats.available + (editingExpense ? Number(editingExpense.amount) : 0) - expParsed
      : null;

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expAccountId || !expDesc.trim() || isNaN(expParsed) || expParsed <= 0) return;
    try {
      if (editingExpense) {
        await updateSavingsAccountExpense(editingExpense.id, {
          description: expDesc.trim(),
          amount: expParsed,
          date: expDate,
          notes: expNotes.trim() || null
        });
      } else {
        await addSavingsAccountExpense({
          savings_account_id: expAccountId,
          description: expDesc.trim(),
          amount: expParsed,
          date: expDate,
          notes: expNotes.trim() || null
        });
      }
      setExpPanelOpen(false);
    } catch {
      // El contexto ya muestra el aviso de error
    }
  };

  const handleDeleteExpense = async (exp: SavingsAccountExpense) => {
    if (!window.confirm(`¿Eliminar el gasto "${exp.description}" (${fmt(exp.amount)})? El importe vuelve a estar disponible en la cuenta.`)) return;
    try {
      await deleteSavingsAccountExpense(exp.id);
    } catch {
      // El contexto ya muestra el aviso de error
    }
  };

  const handleDeleteAllocation = async (id: string, label: string) => {
    if (!window.confirm(`¿Quitar la asignación de ${label}? Ese importe vuelve al Fondo de Ahorro principal.`)) return;
    try {
      await deleteSavingsAllocation(id);
    } catch {
      // El contexto ya muestra el aviso de error
    }
  };

  // -------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------
  if (!savingsAccountsReady) {
    return (
      <div className="glass-panel p-6 rounded-3xl border border-brand-amber/40 flex flex-col gap-3 animate-fade-in">
        <div className="flex items-center gap-2 text-brand-amber font-extrabold text-xs uppercase tracking-wider">
          <Database size={14} />
          Falta activar las cuentas de ahorro
        </div>
        <p className="text-xs text-lux-text leading-relaxed">
          Para usar esta sección hay que crear las tablas nuevas en Supabase. Abrí el editor SQL de tu
          proyecto, pegá el contenido del archivo <strong>migration_savings_accounts.sql</strong> (está en la
          raíz del proyecto) y ejecutalo una sola vez. Después recargá la app.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      {/* Cabecera */}
      <div className="glass-panel p-6 rounded-3xl premium-card flex flex-col gap-4 relative overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-tr from-brand-indigo to-brand-purple rounded-2xl flex items-center justify-center shadow-lg shrink-0">
              <Wallet size={24} className="text-white" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xs font-bold text-lux-muted uppercase tracking-widest">Cuentas de ahorro</h2>
              <span className="text-2xl font-extrabold text-lux-text">{fmt(totalAvailable)}</span>
              <span className="text-[10px] text-lux-muted">Disponible en todas las cuentas</span>
            </div>
          </div>
            <div className="flex items-center gap-2 shrink-0">
              {savingsAccounts.length > 0 && (
                <button
                  onClick={() => openCancelDebt()}
                  className="bg-brand-emerald/15 border border-brand-emerald/40 hover:border-brand-emerald text-brand-emerald font-bold px-3 py-2 rounded-2xl transition-all hover:bg-brand-emerald/20 text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <CreditCard size={12} />
                  <span>Cancelar deuda</span>
                </button>
              )}
              <button
                onClick={openCreateAccount}
                className="bg-lux-panel border border-lux-border/60 hover:border-lux-border text-lux-text font-bold px-3 py-2 rounded-2xl transition-all hover:bg-lux-panel/60 text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus size={12} />
                <span>Nueva cuenta</span>
              </button>
            </div>
        </div>
        <div className="flex items-start gap-2 text-[11px] text-lux-muted leading-relaxed">
          <Info size={13} className="shrink-0 mt-0.5" />
          <p>
            Cada mes asignás a cada cuenta un porcentaje de tus ingresos o un importe fijo. Ese dinero
            <strong className="text-lux-text"> se descuenta del Fondo de Ahorro principal</strong> y queda
            disponible en la cuenta para registrar gastos.
          </p>
        </div>
      </div>

      {/* Lista de cuentas */}
      {savingsAccounts.length === 0 ? (
        <div className="glass-panel p-8 rounded-3xl border border-lux-border/20 text-center flex flex-col items-center justify-center">
          <Wallet size={28} className="text-lux-muted mb-2 opacity-60" />
          <p className="text-xs font-bold text-lux-text">Todavía no tenés cuentas de ahorro</p>
          <p className="text-[10px] text-lux-muted mt-1 max-w-xs">
            Creá, por ejemplo, «Inversión» y «Cancelar deudas» para separar una parte de tus ingresos cada mes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {savingsAccounts.map((acc) => {
            const stats = getStats(acc.id);
            const isExpanded = expandedId === acc.id;
            const accExpenses = savingsAccountExpenses
              .filter((x) => x.savings_account_id === acc.id)
              .sort((a, b) => (a.date < b.date ? 1 : -1));
            const accAllocations = savingsAllocations
              .filter((x) => x.savings_account_id === acc.id)
              .sort((a, b) => (b.year - a.year) || (b.month - a.month));

            return (
              <div
                key={acc.id}
                className="glass-panel rounded-3xl border border-lux-border/30 overflow-hidden relative"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: acc.color }} />
                <div className="p-5 pl-6 flex flex-col gap-4">
                  {/* Título + acciones */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                      <span className="text-sm font-extrabold text-lux-text truncate">{acc.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={() => openEditAccount(acc)}
                        className="p-2 rounded-full hover:bg-lux-border/50 text-lux-muted hover:text-lux-text transition-colors cursor-pointer"
                        title="Editar cuenta"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc)}
                        className="p-2 rounded-full hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 transition-colors cursor-pointer"
                        title="Eliminar cuenta"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Saldo */}
                  <div className="flex items-end justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Disponible</span>
                      <span className={`text-2xl font-extrabold ${stats.available >= 0 ? 'text-lux-text' : 'text-brand-rose'}`}>
                        {fmt(stats.available)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end text-[10px] text-lux-muted font-semibold gap-0.5">
                      <span>Asignado total: <strong className="text-brand-emerald">{fmt(stats.allocatedToDate)}</strong></span>
                      <span>Gastado: <strong className="text-brand-rose">{fmt(stats.spent)}</strong></span>
                      <span>Este mes: <strong className="text-lux-text">{fmt(stats.allocatedThisMonth)}</strong></span>
                      {stats.scheduled > 0 && (
                        <span>Programado a futuro: <strong className="text-brand-indigo">{fmt(stats.scheduled)}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Botones principales */}
                  <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openAllocation(acc.id)}
                        className="flex items-center justify-center gap-1.5 bg-lux-bg/60 border border-lux-border/60 hover:border-lux-accent text-lux-text text-[11px] font-bold py-2.5 rounded-2xl transition-all cursor-pointer active:scale-[0.98]"
                      >
                        <ArrowDownToLine size={12} />
                        Asignar del mes
                      </button>
                      <button
                        onClick={() => openCreateExpense(acc.id)}
                        className="flex items-center justify-center gap-1.5 bg-lux-bg/60 border border-lux-border/60 hover:border-brand-rose text-lux-text text-[11px] font-bold py-2.5 rounded-2xl transition-all cursor-pointer active:scale-[0.98]"
                      >
                        <Receipt size={12} />
                        Registrar gasto
                      </button>
                    </div>

                    <button
                      onClick={() => openCancelDebt(acc.id)}
                      className="w-full flex items-center justify-center gap-1.5 bg-brand-emerald/10 border border-brand-emerald/30 hover:border-brand-emerald text-brand-emerald text-[11px] font-bold py-2 rounded-2xl transition-all cursor-pointer active:scale-[0.98]"
                    >
                      <CreditCard size={13} />
                      <span>Cancelar cuotas / tarjeta con este saldo</span>
                    </button>
                  </div>

                  {/* Movimientos */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : acc.id)}
                    className="flex items-center justify-between text-[11px] font-bold text-lux-muted hover:text-lux-text transition-colors cursor-pointer pt-1 border-t border-lux-border/20"
                  >
                    <span>Movimientos ({accExpenses.length} gastos · {accAllocations.length} asignaciones)</span>
                    <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="flex flex-col gap-4 animate-fade-in">
                      {/* Gastos */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Gastos</span>
                        {accExpenses.length === 0 ? (
                          <p className="text-[11px] text-lux-muted">Sin gastos registrados.</p>
                        ) : (
                          accExpenses.map((exp) => (
                            <div
                              key={exp.id}
                              className="flex items-center justify-between gap-2 bg-lux-bg/40 border border-lux-border/20 rounded-2xl px-3 py-2.5"
                            >
                              <div className="flex flex-col min-w-0">
                                <span className="text-xs font-bold text-lux-text truncate">{exp.description}</span>
                                <span className="flex items-center gap-1 text-[10px] text-lux-muted font-semibold">
                                  <Calendar size={10} />
                                  {formatCompactDate(exp.date)}
                                  {exp.notes ? ` · ${exp.notes}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs font-extrabold text-brand-rose">-{fmt(exp.amount)}</span>
                                <button
                                  onClick={() => openEditExpense(exp)}
                                  className="p-1.5 rounded-full hover:bg-lux-border/50 text-lux-muted hover:text-lux-text cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit3 size={11} />
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(exp)}
                                  className="p-1.5 rounded-full hover:bg-brand-rose/10 text-brand-rose cursor-pointer"
                                  title="Eliminar"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Asignaciones */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Asignaciones mensuales</span>
                        {accAllocations.length === 0 ? (
                          <p className="text-[11px] text-lux-muted">Sin asignaciones. Usá «Asignar del mes».</p>
                        ) : (
                          accAllocations.map((al) => {
                            const monthCalc = calculatedMonths.find((m) => m.year === al.year && m.month === al.month);
                            const amount = getAllocationAmount(al, monthCalc?.totalIncomes || 0);
                            const periodLabel = getPeriodLabel(al.year, al.month);
                            return (
                              <div
                                key={al.id}
                                className="flex items-center justify-between gap-2 bg-lux-bg/40 border border-lux-border/20 rounded-2xl px-3 py-2.5"
                              >
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-bold text-lux-text">{periodLabel}</span>
                                  <span className="text-[10px] text-lux-muted font-semibold">
                                    {al.kind === 'percent' ? `${Number(al.value)}% de los ingresos` : 'Importe fijo'}
                                    {!isUpToCurrent(al.year, al.month) ? ' · programado' : ''}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-xs font-extrabold text-brand-emerald">+{fmt(amount)}</span>
                                  <button
                                    onClick={() => handleDeleteAllocation(al.id, periodLabel)}
                                    className="p-1.5 rounded-full hover:bg-brand-rose/10 text-brand-rose cursor-pointer"
                                    title="Quitar asignación"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PANEL: CREAR / EDITAR CUENTA */}
      <Panel
        isOpen={accountPanelOpen}
        onClose={() => setAccountPanelOpen(false)}
        title={editingAccount ? 'Editar cuenta de ahorro' : 'Nueva cuenta de ahorro'}
      >
        <form onSubmit={handleAccountSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Nombre</label>
            <input
              type="text"
              required
              placeholder="Ej: Inversión, Cancelar deudas"
              value={accName}
              onChange={(e) => setAccName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className={labelClass}>Color</label>
            <div className="flex flex-wrap gap-2.5">
              {ACCOUNT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccColor(c)}
                  className={`w-9 h-9 rounded-full border-2 transition-transform active:scale-90 cursor-pointer ${
                    accColor === c ? 'border-lux-text scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-indigo to-brand-purple text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg transition-transform active:scale-[0.98] mt-2 cursor-pointer"
          >
            {editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </form>
      </Panel>

      {/* PANEL: ASIGNACIÓN MENSUAL */}
      <Panel isOpen={allocPanelOpen} onClose={() => setAllocPanelOpen(false)} title="Asignar a la cuenta">
        <form onSubmit={handleAllocSubmit} className="flex flex-col gap-4">
          <p className="text-[11px] text-lux-muted leading-relaxed">
            Cuenta: <strong className="text-lux-text">{savingsAccounts.find((a) => a.id === allocAccountId)?.name}</strong>
          </p>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Mes</label>
            <select
              value={allocPeriodKey}
              onChange={(e) => handleAllocPeriodChange(e.target.value)}
              className={`${inputClass} cursor-pointer`}
            >
              {periodOptions.map((p) => (
                <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`} className="bg-lux-panel text-lux-text">
                  {getPeriodLabel(p.year, p.month)}
                </option>
              ))}
            </select>
          </div>

          <ChipsSelector<AllocationKind>
            label="Tipo de asignación"
            options={[
              { value: 'percent', label: '% de ingresos', icon: <Percent size={14} /> },
              { value: 'amount', label: 'Importe fijo', icon: <Euro size={14} /> }
            ]}
            selectedValue={allocKind}
            onChange={setAllocKind}
          />

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>{allocKind === 'percent' ? 'Porcentaje (%)' : 'Importe (€)'}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={allocKind === 'percent' ? 100 : undefined}
              required
              placeholder={allocKind === 'percent' ? '10' : '0.00'}
              value={allocValue}
              onChange={(e) => setAllocValue(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Vista previa del importe */}
          <div className="rounded-2xl border border-lux-border/40 bg-lux-bg/50 p-4 flex flex-col gap-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-lux-muted">Ingresos totales del mes</span>
              <span className="font-bold text-lux-text">{fmt(allocMonthIncomes)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-lux-border/30">
              <span className="text-lux-muted">Se asignarán a la cuenta</span>
              <span className="font-extrabold text-brand-emerald">{allocValid ? fmt(allocPreviewAmount) : '—'}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-amber/40 bg-brand-amber/10 p-3 text-[11px] text-lux-text leading-relaxed">
            Este importe <strong>se descuenta del Fondo de Ahorro principal</strong> de ese mes.
            {existingAllocation && (
              <> Ya hay una asignación para este mes ({existingAllocation.kind === 'percent' ? `${Number(existingAllocation.value)}%` : fmt(existingAllocation.value)}): se <strong>reemplaza</strong>.</>
            )}
            {allocKind === 'percent' && ' Si los ingresos del mes cambian, el importe se recalcula.'}
          </div>

          <button
            type="submit"
            disabled={!allocValid}
            className="w-full bg-gradient-to-r from-brand-emerald to-emerald-600 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg transition-transform active:scale-[0.98] mt-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar asignación
          </button>
        </form>
      </Panel>

      {/* PANEL: GASTO DE LA CUENTA */}
      <Panel
        isOpen={expPanelOpen}
        onClose={() => setExpPanelOpen(false)}
        title={editingExpense ? 'Editar gasto' : 'Gasto de la cuenta'}
      >
        <form onSubmit={handleExpenseSubmit} className="flex flex-col gap-4">
          <p className="text-[11px] text-lux-muted leading-relaxed">
            Cuenta: <strong className="text-lux-text">{savingsAccounts.find((a) => a.id === expAccountId)?.name}</strong>
            {expAccountStats && (
              <> · Disponible: <strong className="text-lux-text">{fmt(expAccountStats.available)}</strong></>
            )}
          </p>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Descripción</label>
            <input
              type="text"
              required
              placeholder="Ej: Compra de fondo indexado, Cuota préstamo"
              value={expDesc}
              onChange={(e) => setExpDesc(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Importe (€)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Fecha</label>
            <input
              type="date"
              required
              value={expDate}
              onChange={(e) => setExpDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Notas (opcional)</label>
            <input
              type="text"
              placeholder="Detalle adicional"
              value={expNotes}
              onChange={(e) => setExpNotes(e.target.value)}
              className={inputClass}
            />
          </div>

          {expAvailableAfter !== null && (
            <div
              className={`rounded-2xl border p-3 text-[11px] leading-relaxed ${
                expAvailableAfter < 0
                  ? 'border-brand-rose/40 bg-brand-rose/10 text-lux-text'
                  : 'border-lux-border/40 bg-lux-bg/50 text-lux-muted'
              }`}
            >
              {expAvailableAfter < 0 ? (
                <>
                  <strong>Atención:</strong> este gasto supera lo disponible. La cuenta quedaría en{' '}
                  <strong className="text-brand-rose">{fmt(expAvailableAfter)}</strong>. Podés guardarlo igualmente
                  y asignar más dinero a la cuenta después.
                </>
              ) : (
                <>Disponible tras este gasto: <strong className="text-lux-text">{fmt(expAvailableAfter)}</strong></>
              )}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-rose to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg transition-transform active:scale-[0.98] mt-2 cursor-pointer"
          >
            {editingExpense ? 'Guardar cambios' : 'Registrar gasto'}
          </button>
        </form>
      </Panel>

      {/* MODAL CANCELAR DEUDAS / CUOTAS CON SALDO DE AHORRO */}
      <CancelDebtModal
        isOpen={cancelDebtModalOpen}
        onClose={() => setCancelDebtModalOpen(false)}
        defaultAccountId={cancelDebtAccountId}
      />
    </div>
  );
};
