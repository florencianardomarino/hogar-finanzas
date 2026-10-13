import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { getFinancialPeriod, toISODateString, formatCompactDate } from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { Installment, Expense } from '../../types';
import { Panel } from '../ui/Panel';
import { 
  CreditCard, CheckCircle2, AlertTriangle, 
  HelpCircle, ShieldCheck, Sparkles,
  CalendarDays
} from 'lucide-react';

interface CancelDebtModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAccountId?: string;
}

interface EligibleInstallmentItem {
  id: string;
  type: 'installment';
  item: Installment;
  description: string;
  account: string;
  paymentType: string;
  paidCount: number;
  totalCount: number;
  remainingCount: number;
  amountPerInstallment: number;
  remainingTotal: number;
  isFinished: boolean;
}

interface EligibleExpenseItem {
  id: string;
  type: 'expense';
  item: Expense;
  description: string;
  account: string;
  date: string;
  amount: number;
  remainingTotal: number;
  isReconciled: boolean;
}

type EligibleDebtItem = EligibleInstallmentItem | EligibleExpenseItem;

const fmt = (n: number) =>
  Number(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export const CancelDebtModal: React.FC<CancelDebtModalProps> = ({
  isOpen,
  onClose,
  defaultAccountId
}) => (
  <Panel isOpen={isOpen} onClose={onClose} title="Cancelar Deudas con Ahorros">
    {isOpen && <CancelDebtForm onClose={onClose} defaultAccountId={defaultAccountId} />}
  </Panel>
);

const CancelDebtForm: React.FC<{
  onClose: () => void;
  defaultAccountId?: string;
}> = ({ onClose, defaultAccountId }) => {
  const {
    savingsAccounts,
    savingsAccountExpenses,
    savingsAllocations,
    installments,
    allExpenses,
    monthsData,
    allIncomes,
    unplannedExpenses,
    savingsConfig,
    currentPeriod,
    activeHousehold,
    updateInstallment,
    cancelInstallment,
    updateExpense,
    addSavingsAccountExpense,
    showToast
  } = useApp();

  const billingDay = activeHousehold?.billing_cycle_start_day || 10;

  // 1. Cuenta de ahorro seleccionada
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    defaultAccountId || (savingsAccounts[0]?.id || '')
  );

  // Calcular la cascada financiera para tener las asignaciones reales (fijas y %) por mes
  const calculatedMonths = useMemo(
    () =>
      calculateEncainedFinances(
        monthsData,
        allIncomes,
        allExpenses,
        unplannedExpenses,
        installments,
        savingsConfig,
        billingDay,
        savingsAllocations
      ),
    [monthsData, allIncomes, allExpenses, unplannedExpenses, installments, savingsConfig, billingDay, savingsAllocations]
  );

  const isUpToCurrent = (year: number, month: number) =>
    year < currentPeriod.year || (year === currentPeriod.year && month <= currentPeriod.month);

  // Calcular saldo disponible de cada cuenta de ahorro
  const getAccountAvailable = (accountId: string) => {
    let allocatedToDate = 0;
    calculatedMonths.forEach((m) => {
      const amount = m.allocationsByAccount[accountId] || 0;
      if (isUpToCurrent(m.year, m.month)) allocatedToDate += amount;
    });

    const spent = savingsAccountExpenses
      .filter((e) => e.savings_account_id === accountId)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    return Math.round((allocatedToDate - spent) * 100) / 100;
  };

  const currentAccount = savingsAccounts.find((a) => a.id === selectedAccountId);
  const availableBalance = currentAccount ? getAccountAvailable(currentAccount.id) : 0;

  // 2. Filtro de tipo de deuda
  const [debtTypeFilter, setDebtTypeFilter] = useState<'all' | 'installments' | 'card_expenses'>('all');

  // Identificar cuentas que sean tarjeta de crédito
  const creditCardAccountNames = useMemo(() => {
    const list: string[] = [];
    if (activeHousehold?.accounts) {
      activeHousehold.accounts.forEach((acc: { name?: string; type?: string }) => {
        if (acc.type === 'credit_card' || acc.name?.toLowerCase().includes('tarjeta')) {
          if (acc.name) list.push(acc.name);
        }
      });
    }
    return list;
  }, [activeHousehold]);

  // 3. Preparar lista de Cuotas / Préstamos pendientes
  const pendingInstallments = useMemo<EligibleInstallmentItem[]>(() => {
    return installments
      .map((inst) => {
        const firstMonthVal = inst.first_debit_month;
        const firstYearVal = inst.first_debit_year;
        const firstDayVal = inst.first_debit_day || 10;
        const total = inst.num_installments;

        const firstDebitPeriod = getFinancialPeriod(
          new Date(firstYearVal, firstMonthVal - 1, firstDayVal),
          billingDay
        );

        const elapsedPeriods =
          (currentPeriod.year - firstDebitPeriod.year) * 12 +
          (currentPeriod.month - firstDebitPeriod.month);

        let paidCount = 0;
        if (elapsedPeriods >= 0) {
          paidCount = Math.min(elapsedPeriods + 1, total);
        }

        const remainingCount = Math.max(total - paidCount, 0);
        const remainingTotal = remainingCount * Number(inst.amount_per_installment);

        return {
          id: inst.id,
          type: 'installment' as const,
          item: inst,
          description: inst.description,
          account: inst.account,
          paymentType: inst.payment_type,
          paidCount,
          totalCount: total,
          remainingCount,
          amountPerInstallment: Number(inst.amount_per_installment),
          remainingTotal: Math.round(remainingTotal * 100) / 100,
          isFinished: remainingCount === 0
        };
      })
      .filter((inst) => !inst.isFinished && inst.remainingTotal > 0);
  }, [installments, billingDay, currentPeriod]);

  // 4. Preparar lista de Gastos / Pagos de Tarjeta de Crédito pendientes
  const pendingCardExpenses = useMemo<EligibleExpenseItem[]>(() => {
    return allExpenses
      .filter((e) => {
        const isCard =
          creditCardAccountNames.includes(e.account) ||
          e.account?.toLowerCase().includes('tarjeta') ||
          e.expense_categories?.name === 'Tarjeta de Crédito';
        return isCard && !e.installment_id && Number(e.amount) > 0;
      })
      .map((e) => ({
        id: e.id,
        type: 'expense' as const,
        item: e,
        description: e.description,
        account: e.account,
        date: e.date,
        amount: Number(e.amount),
        remainingTotal: Number(e.amount),
        isReconciled: !!e.is_reconciled
      }));
  }, [allExpenses, creditCardAccountNames]);

  // Elementos combinados elegibles
  const eligibleItems = useMemo<EligibleDebtItem[]>(() => {
    let items: EligibleDebtItem[] = [];
    if (debtTypeFilter === 'all' || debtTypeFilter === 'installments') {
      items = [...items, ...pendingInstallments];
    }
    if (debtTypeFilter === 'all' || debtTypeFilter === 'card_expenses') {
      items = [...items, ...pendingCardExpenses];
    }
    return items;
  }, [debtTypeFilter, pendingInstallments, pendingCardExpenses]);

  // 5. Selección de ítems
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedItemIds.length === eligibleItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(eligibleItems.map((i) => i.id));
    }
  };

  // Calcular total capital de lo seleccionado
  const selectedItemsData = useMemo(() => {
    return eligibleItems.filter((i) => selectedItemIds.includes(i.id));
  }, [eligibleItems, selectedItemIds]);

  const selectedTotalCapital = useMemo(() => {
    return selectedItemsData.reduce((acc, i) => acc + i.remainingTotal, 0);
  }, [selectedItemsData]);

  // 6. Modalidad de Pago: Total o Parcial
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [partialAmountInput, setPartialAmountInput] = useState<string>('');

  // 7. Intereses o gastos de cancelación
  const [extraFeesInput, setExtraFeesInput] = useState<string>('');

  // 8. Fecha y notas
  const [paymentDate, setPaymentDate] = useState<string>(toISODateString(new Date()));
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Cálculos finales derivados directamente del estado
  const principalToPay = useMemo(() => {
    if (paymentMode === 'full') {
      return selectedTotalCapital;
    }
    const val = parseFloat(partialAmountInput.replace(',', '.'));
    return isNaN(val) ? 0 : Math.max(0, Math.min(val, selectedTotalCapital));
  }, [paymentMode, selectedTotalCapital, partialAmountInput]);

  const extraFees = useMemo(() => {
    const val = parseFloat(extraFeesInput.replace(',', '.'));
    return isNaN(val) ? 0 : Math.max(0, val);
  }, [extraFeesInput]);

  const totalToDebit = Math.round((principalToPay + extraFees) * 100) / 100;
  const balanceAfter = Math.round((availableBalance - totalToDebit) * 100) / 100;

  // Validaciones
  const isValid =
    selectedItemIds.length > 0 &&
    principalToPay > 0 &&
    principalToPay <= selectedTotalCapital &&
    selectedAccountId !== '';

  const handleConfirm = async () => {
    if (!isValid || !currentAccount || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const descriptions = selectedItemsData.map((i) => i.description).join(', ');
      const modeLabel = paymentMode === 'full' ? 'Cancelación Total' : 'Pago Parcial';

      let autoNotes = `${modeLabel} de deuda. Amortización: ${fmt(principalToPay)}`;
      if (extraFees > 0) {
        autoNotes += ` + Intereses/Gastos: ${fmt(extraFees)}`;
      }
      if (paymentNotes.trim()) {
        autoNotes += ` | ${paymentNotes.trim()}`;
      }

      // Registrar el gasto en la cuenta de ahorro
      await addSavingsAccountExpense({
        savings_account_id: currentAccount.id,
        amount: totalToDebit,
        description: `Cancelación deuda: ${descriptions}`,
        date: paymentDate,
        notes: autoNotes
      });

      // Actualizar o cancelar los consumos de tarjeta / cuotas
      for (const itemData of selectedItemsData) {
        if (itemData.type === 'installment') {
          const inst: Installment = itemData.item;
          const paid = itemData.paidCount;

          if (paymentMode === 'full') {
            if (paid > 0) {
              await updateInstallment(inst.id, {
                num_installments: paid,
                total_amount: paid * Number(inst.amount_per_installment),
                notes: (inst.notes ? `${inst.notes} · ` : '') +
                  `Cancelado totalmente con ahorro (${currentAccount.name}) el ${paymentDate}`
              });
            } else {
              await cancelInstallment(inst.id);
            }
          } else {
            const amountForThis =
              selectedItemsData.length === 1
                ? principalToPay
                : (itemData.remainingTotal / selectedTotalCapital) * principalToPay;

            const installmentsAmortized = Math.min(
              Math.floor(amountForThis / Number(inst.amount_per_installment)),
              itemData.remainingCount
            );

            if (installmentsAmortized > 0) {
              const newTotalInstallments = Math.max(inst.num_installments - installmentsAmortized, paid);
              await updateInstallment(inst.id, {
                num_installments: newTotalInstallments,
                total_amount: newTotalInstallments * Number(inst.amount_per_installment),
                notes: (inst.notes ? `${inst.notes} · ` : '') +
                  `Amortizadas ${installmentsAmortized} cuotas (${fmt(amountForThis)}) desde ahorro (${currentAccount.name}) el ${paymentDate}`
              });
            } else {
              await updateInstallment(inst.id, {
                notes: (inst.notes ? `${inst.notes} · ` : '') +
                  `Abono parcial de ${fmt(amountForThis)} desde ahorro (${currentAccount.name}) el ${paymentDate}`
              });
            }
          }
        } else if (itemData.type === 'expense') {
          const exp: Expense = itemData.item;
          if (paymentMode === 'full') {
            const CHAR_EXPLICIT_DEBITED = '\u200C';
            const cleanDesc = (exp.description || '')
              .replace(/\u200C/g, '')
              .replace(/\u200D/g, '');

            await updateExpense(exp.id, {
              amount: 0,
              description: cleanDesc + CHAR_EXPLICIT_DEBITED,
              notes: (exp.notes ? `${exp.notes} · ` : '') +
                `Cancelado totalmente con ahorro (${currentAccount.name}) el ${paymentDate} (Importe cubierto: ${fmt(exp.amount)})`
            });
          } else {
            const amountForThis =
              selectedItemsData.length === 1
                ? principalToPay
                : (itemData.remainingTotal / selectedTotalCapital) * principalToPay;

            const newAmount = Math.max(Number(exp.amount) - amountForThis, 0);
            await updateExpense(exp.id, {
              amount: newAmount,
              notes: (exp.notes ? `${exp.notes} · ` : '') +
                `Amortizado ${fmt(amountForThis)} desde ahorro (${currentAccount.name}). Saldo restante: ${fmt(newAmount)}`
            });
          }
        }
      }

      showToast('¡Deuda cancelada con éxito desde tu cuenta de ahorro!', 'success');
      onClose();
    } catch (err) {
      console.error('Error al cancelar deuda con ahorro:', err);
      showToast('Error al procesar la cancelación de deuda', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 text-lux-text pb-4">
      {/* BANNER INFORMATIVO */}
      <div className="rounded-2xl border border-brand-indigo/30 bg-brand-indigo/10 p-4 flex items-start gap-3">
        <Sparkles size={20} className="text-brand-indigo shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1 text-xs">
          <span className="font-extrabold text-lux-text">
            Amortización inteligente de deudas
          </span>
          <p className="text-lux-muted text-[11px] leading-relaxed">
            Usá el saldo de tu cuenta de ahorro para cancelar cuotas o pagos de tarjeta. El pago
            se debitará de la cuenta y liberará tus pasivos y presupuestos futuros.
          </p>
        </div>
      </div>

      {/* 1. SELECCIÓN DE CUENTA DE AHORRO ORIGEN */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider flex items-center justify-between">
          <span>1. Cuenta de Ahorro Origen</span>
          <span className="text-lux-accent font-bold">
            Disponible: {fmt(availableBalance)}
          </span>
        </label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text cursor-pointer"
        >
          {savingsAccounts.map((acc) => {
            const avail = getAccountAvailable(acc.id);
            return (
              <option key={acc.id} value={acc.id} className="bg-lux-panel text-lux-text">
                {acc.name} · Disponible: {fmt(avail)}
              </option>
            );
          })}
        </select>
      </div>

      {/* 2. FILTRO DE TIPO DE CONSUMO */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
            2. Seleccionar Deudas a Cancelar
          </label>
          {eligibleItems.length > 0 && (
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] font-bold text-lux-accent hover:underline cursor-pointer"
            >
              {selectedItemIds.length === eligibleItems.length
                ? 'Deseleccionar todo'
                : 'Seleccionar todo'}
            </button>
          )}
        </div>

        <div className="flex gap-1.5 p-1 rounded-2xl bg-lux-bg/60 border border-lux-border/40">
          <button
            type="button"
            onClick={() => setDebtTypeFilter('all')}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
              debtTypeFilter === 'all'
                ? 'bg-lux-accent/15 text-lux-accent shadow'
                : 'text-lux-muted hover:text-lux-text'
            }`}
          >
            Todas ({pendingInstallments.length + pendingCardExpenses.length})
          </button>
          <button
            type="button"
            onClick={() => setDebtTypeFilter('installments')}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
              debtTypeFilter === 'installments'
                ? 'bg-lux-accent/15 text-lux-accent shadow'
                : 'text-lux-muted hover:text-lux-text'
            }`}
          >
            Cuotas ({pendingInstallments.length})
          </button>
          <button
            type="button"
            onClick={() => setDebtTypeFilter('card_expenses')}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
              debtTypeFilter === 'card_expenses'
                ? 'bg-lux-accent/15 text-lux-accent shadow'
                : 'text-lux-muted hover:text-lux-text'
            }`}
          >
            Tarjeta ({pendingCardExpenses.length})
          </button>
        </div>
      </div>

      {/* LISTADO DE ITEMS ELEGIBLES */}
      {eligibleItems.length === 0 ? (
        <div className="glass-panel p-6 rounded-2xl border border-lux-border/30 text-center flex flex-col items-center justify-center">
          <CheckCircle2 size={28} className="text-brand-emerald mb-2" />
          <span className="text-xs font-bold text-lux-text">
            No hay consumos o cuotas pendientes en esta categoría
          </span>
          <p className="text-[10px] text-lux-muted mt-1">
            Todas tus cuotas y pagos de tarjeta están al día.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
          {eligibleItems.map((item) => {
            const isSelected = selectedItemIds.includes(item.id);
            const isInstallment = item.type === 'installment';

            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'border-lux-accent bg-lux-accent/10 shadow-sm'
                    : 'border-lux-border/40 bg-lux-panel/40 hover:bg-lux-panel/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded accent-blue-600 cursor-pointer shrink-0"
                  />
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="text-xs font-extrabold text-lux-text truncate">
                      {item.description}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-lux-muted">
                      <span className="flex items-center gap-1">
                        {isInstallment ? <CalendarDays size={10} /> : <CreditCard size={10} />}
                        {item.account}
                      </span>
                      {isInstallment && (
                        <span className="text-brand-indigo font-semibold">
                          {item.remainingCount} cuotas rest. ({fmt(item.amountPerInstallment)}/mes)
                        </span>
                      )}
                      {!isInstallment && item.date && (
                        <span>{formatCompactDate(item.date)}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-xs font-extrabold text-brand-rose">
                    {fmt(item.remainingTotal)}
                  </span>
                  <span className="text-[9px] text-lux-muted uppercase font-bold">
                    Pendiente
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. MODALIDAD DE PAGO (TOTAL O PARCIAL) */}
      {selectedItemsData.length > 0 && (
        <div className="flex flex-col gap-3 p-4 rounded-2xl border border-lux-border/40 bg-lux-bg/40 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
              3. Modalidad de Cancelación
            </span>
            <span className="text-xs font-extrabold text-lux-text">
              Deuda seleccionada: {fmt(selectedTotalCapital)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMode('full')}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                paymentMode === 'full'
                  ? 'border-brand-emerald bg-brand-emerald/15 text-brand-emerald'
                  : 'border-lux-border/40 text-lux-muted hover:text-lux-text'
              }`}
            >
              <span>Pago Total (100%)</span>
              <span className="text-[10px] font-semibold opacity-80">
                {fmt(selectedTotalCapital)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaymentMode('partial');
                if (!partialAmountInput) {
                  setPartialAmountInput(selectedTotalCapital.toFixed(2));
                }
              }}
              className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer flex flex-col items-center gap-0.5 ${
                paymentMode === 'partial'
                  ? 'border-lux-accent bg-lux-accent/15 text-lux-accent'
                  : 'border-lux-border/40 text-lux-muted hover:text-lux-text'
              }`}
            >
              <span>Pago Parcial</span>
              <span className="text-[10px] font-semibold opacity-80">Elegir importe</span>
            </button>
          </div>

          {paymentMode === 'partial' && (
            <div className="flex flex-col gap-1.5 mt-1 animate-fade-in">
              <label className="text-[11px] font-semibold text-lux-muted">
                Importe a amortizar (€) · Máx: {fmt(selectedTotalCapital)}
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={selectedTotalCapital}
                placeholder="0.00"
                value={partialAmountInput}
                onChange={(e) => setPartialAmountInput(e.target.value)}
                className="w-full bg-lux-bg/80 border border-lux-border/60 focus:border-lux-accent rounded-xl px-3 py-2 text-sm text-lux-text"
              />
            </div>
          )}
        </div>
      )}

      {/* 4. INTERESES O GASTOS DE CANCELACIÓN ADICIONALES */}
      {selectedItemsData.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider flex items-center justify-between">
            <span>4. Intereses o Gastos de Cancelación (€)</span>
            <span className="text-[10px] font-normal text-lux-muted italic">Opcional</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00 (comisiones bancarias, penalizaciones, etc.)"
            value={extraFeesInput}
            onChange={(e) => setExtraFeesInput(e.target.value)}
            className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
          />
          <p className="text-[10px] text-lux-muted flex items-center gap-1">
            <HelpCircle size={11} />
            Si la entidad te cobra comisión por cancelación anticipada, sumala acá para que salga del ahorro.
          </p>
        </div>
      )}

      {/* 5. FECHA Y NOTAS */}
      {selectedItemsData.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
              Fecha del Pago
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-3 py-2.5 text-xs text-lux-text"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">
              Notas adicionales (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ej: Cancelado por adelanto aguinaldo"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-3 py-2.5 text-xs text-lux-text"
            />
          </div>
        </div>
      )}

      {/* 6. RESUMEN DEL DÉBITO Y VISTA PREVIA */}
      {selectedItemsData.length > 0 && (
        <div className="rounded-2xl border border-lux-border/40 bg-lux-bg/60 p-4 flex flex-col gap-2.5 text-xs animate-fade-in">
          <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">
            Resumen de la Cancelación
          </span>
          
          <div className="flex justify-between items-center text-lux-muted">
            <span>Amortización de deuda:</span>
            <span className="font-bold text-lux-text">{fmt(principalToPay)}</span>
          </div>

          {extraFees > 0 && (
            <div className="flex justify-between items-center text-lux-muted">
              <span>Intereses / Gastos de cancelación:</span>
              <span className="font-bold text-brand-amber">+{fmt(extraFees)}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-lux-border/30 font-extrabold text-sm">
            <span>Total a debitar de {currentAccount?.name}:</span>
            <span className="text-brand-rose">{fmt(totalToDebit)}</span>
          </div>

          <div className="flex justify-between items-center pt-1 text-[11px] text-lux-muted font-medium">
            <span>Saldo disponible restante en la cuenta:</span>
            <span className={`font-bold ${balanceAfter >= 0 ? 'text-brand-emerald' : 'text-brand-rose'}`}>
              {fmt(balanceAfter)}
            </span>
          </div>

          {balanceAfter < 0 && (
            <div className="flex items-center gap-2 text-[10px] font-bold text-brand-amber bg-brand-amber/10 border border-brand-amber/30 rounded-xl p-2.5 mt-1">
              <AlertTriangle size={14} className="shrink-0" />
              <span>
                Atención: El importe a debitar supera el saldo disponible actual en esta cuenta de ahorro.
              </span>
            </div>
          )}
        </div>
      )}

      {/* BOTÓN DE ACCIÓN FINAL */}
      <button
        type="button"
        disabled={!isValid || isSubmitting}
        onClick={handleConfirm}
        className="w-full bg-gradient-to-r from-brand-emerald to-teal-600 hover:from-teal-600 hover:to-teal-700 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
      >
        <ShieldCheck size={16} />
        <span>
          {isSubmitting
            ? 'Procesando cancelación...'
            : `Confirmar Pago (${fmt(totalToDebit)})`}
        </span>
      </button>

    </div>
  );
};
