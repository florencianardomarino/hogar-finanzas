import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel, getFinancialPeriod } from '../../utils/dateUtils';
import { 
  CreditCard, CalendarDays, Percent, Trash2, CheckCircle2, 
  ChevronRight, Plus, Edit2, Info, AlertTriangle, Calendar, Landmark
} from 'lucide-react';
import { Panel } from '../ui/Panel';
import { ChipsSelector } from '../ui/ChipsSelector';

export const InstallmentsScreen: React.FC = () => {
  const { 
    installments, cancelInstallment, addInstallment, updateInstallment,
    activeHousehold, currentPeriod, selectedPeriod, showToast 
  } = useApp();

  // -------------------------------------------------------------------
  // TITULARES Y CUENTAS DINÁMICAS (LOCALES PARA EL FORMULARIO)
  // -------------------------------------------------------------------
  const currentHolders: string[] = activeHousehold?.holders || [
    activeHousehold?.holder_1_name || 'Titular 1',
    activeHousehold?.holder_2_name || 'Titular 2',
    'Compartido'
  ];

  const baseAccounts = activeHousehold?.accounts || [
    { id: '1', name: activeHousehold?.account_1_name || 'Cuenta Titular 1', type: 'bank_account', holder: activeHousehold?.holder_1_name || 'Titular 1' },
    { id: '2', name: activeHousehold?.account_2_name || 'Cuenta Titular 2', type: 'bank_account', holder: activeHousehold?.holder_2_name || 'Titular 2' },
    { id: '3', name: activeHousehold?.account_joint_name || 'Cuenta conjunta', type: 'bank_account', holder: 'Compartido' }
  ];

  const currentAccounts: any[] = [...baseAccounts];
  if (!currentAccounts.some(acc => acc.type === 'cash' || acc.name.toLowerCase() === 'efectivo')) {
    currentAccounts.push({ id: 'cash-fallback', name: 'Efectivo', type: 'cash', holder: 'Compartido' });
  }

  // -------------------------------------------------------------------
  // ESTADOS PARA CREACIÓN / EDICIÓN DIRECTA
  // -------------------------------------------------------------------
  const [isOpenPanel, setIsOpenPanel] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = añadir, string = editar
  const [desc, setDesc] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [numInstallments, setNumInstallments] = useState('12');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'credit_card' | 'debit'>('credit_card');
  const [account, setAccount] = useState(currentAccounts[0]?.name || 'Cuenta conjunta');
  const [firstMonth, setFirstMonth] = useState(String(currentPeriod.month));
  const [firstYear, setFirstYear] = useState(String(currentPeriod.year));
  const [firstDay, setFirstDay] = useState('10');
  const [notes, setNotes] = useState('');

  // Estado para visualización del detalle de cuota/préstamo
  const [detailInstallment, setDetailInstallment] = useState<any | null>(null);

  // Auxiliares locales para colores y visualización de titulares en el detalle
  const getHolderDisplayName = (h: string) => h;
  const getHolderBadgeColor = (h: string, index: number) => {
    const colors = [
      'bg-purple-500/10 text-purple-400 border-purple-500/30',
      'bg-orange-500/10 text-orange-400 border-orange-500/30',
      'bg-blue-500/10 text-blue-400 border-blue-500/30',
      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      'bg-pink-500/10 text-pink-400 border-pink-500/30'
    ];
    const hIdx = currentHolders.indexOf(h);
    return colors[hIdx !== -1 ? hIdx % colors.length : index % colors.length];
  };

  // Sincronizar cuenta por defecto al cambiar el hogar activo
  useEffect(() => {
    if (currentAccounts.length > 0) {
      setAccount(currentAccounts[0].name);
    }
  }, [activeHousehold]);

  // Autocalcular el importe total al cambiar el importe por cuota o número de cuotas (priorizando la cuota individual)
  const handleInstallmentAmountChange = (val: string) => {
    setInstallmentAmount(val);
    if (val && numInstallments) {
      const calculatedTotal = (parseFloat(val) * parseInt(numInstallments)).toFixed(2);
      setTotalAmount(calculatedTotal);
    }
  };

  const handleNumInstallmentsChange = (val: string) => {
    setNumInstallments(val);
    if (installmentAmount && val) {
      const calculatedTotal = (parseFloat(installmentAmount) * parseInt(val)).toFixed(2);
      setTotalAmount(calculatedTotal);
    }
  };

  const handleTotalAmountChange = (val: string) => {
    setTotalAmount(val);
  };

  const resetForm = () => {
    setDesc('');
    setTotalAmount('');
    setNumInstallments('12');
    setInstallmentAmount('');
    setPaymentType('credit_card');
    setAccount(currentAccounts[0]?.name || 'Cuenta conjunta');
    setFirstMonth(String(currentPeriod.month));
    setFirstYear(String(currentPeriod.year));
    setFirstDay('10');
    setNotes('');
    setEditingId(null);
    setIsOpenPanel(false);
  };

  const handleOpenEdit = (inst: any) => {
    setEditingId(inst.id);
    setDesc(inst.description);
    setTotalAmount(String(inst.total_amount));
    setNumInstallments(String(inst.num_installments));
    setInstallmentAmount(String(inst.amount_per_installment));
    setPaymentType(inst.payment_type);
    setAccount(inst.account);
    setFirstMonth(String(inst.first_debit_month));
    setFirstYear(String(inst.first_debit_year));
    setFirstDay(String(inst.first_debit_day || 10));
    setNotes(inst.notes || '');
    setIsOpenPanel(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !installmentAmount || !numInstallments) {
      showToast('Por favor, completa los campos obligatorios', 'error');
      return;
    }

    try {
      const finalTotal = parseFloat(installmentAmount) * parseInt(numInstallments);
      const payload = {
        description: desc,
        total_amount: finalTotal,
        num_installments: parseInt(numInstallments),
        amount_per_installment: parseFloat(installmentAmount),
        payment_type: paymentType,
        account,
        first_debit_day: parseInt(firstDay),
        first_debit_month: parseInt(firstMonth),
        first_debit_year: parseInt(firstYear),
        notes: notes || null
      };

      if (editingId) {
        await updateInstallment(editingId, payload);
      } else {
        await addInstallment(payload);
      }
      resetForm();
    } catch (e) {}
  };

  // Separar cuotas activas de archivadas
  const activeInstallments: any[] = [];
  const finishedInstallments: any[] = [];

  // Obtenemos el progreso e historial de cuotas pagadas según el período seleccionado
  installments.forEach((inst) => {
    const firstMonthVal = inst.first_debit_month;
    const firstYearVal = inst.first_debit_year;
    const firstDayVal = inst.first_debit_day || 10; // Fallback a 10 por retrocompatibilidad
    const total = inst.num_installments;

    // Calcular el período financiero del primer débito
    const startDay = activeHousehold?.billing_cycle_start_day || 10;
    const firstDebitPeriod = getFinancialPeriod(
      new Date(firstYearVal, firstMonthVal - 1, firstDayVal),
      startDay
    );

    // Calcular la diferencia en períodos financieros hasta el período seleccionado
    const elapsedPeriods = (selectedPeriod.year - firstDebitPeriod.year) * 12 + (selectedPeriod.month - firstDebitPeriod.month);

    let paidCount = 0;
    if (elapsedPeriods >= 0) {
      paidCount = Math.min(elapsedPeriods + 1, total);
    }

    const isFinished = paidCount >= total;

    const enriched = {
      ...inst,
      paidCount,
      isFinished,
      progressPercent: Math.min((paidCount / total) * 100, 100)
    };

    if (isFinished) {
      finishedInstallments.push(enriched);
    } else {
      activeInstallments.push(enriched);
    }
  });

  const handleCancel = async (id: string, desc: string) => {
    if (window.confirm(`¿Estás seguro de que deseas cancelar la cuota/préstamo "${desc}"? Se eliminará su proyección futura.`)) {
      await cancelInstallment(id);
    }
  };

  return (
    <div className="px-4 py-5 safe-bottom-padding animate-fade-in">
      
      {/* Cabecera con botón de Registrar */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div className="flex flex-col">
          <h2 className="text-xl font-extrabold font-sans text-gradient-sky">Cuotas y Préstamos</h2>
          <p className="text-xs text-lux-muted mt-0.5">Proyección y control de compras a plazos y préstamos</p>
        </div>
        
        <button
          onClick={() => { setEditingId(null); setIsOpenPanel(true); }}
          className="flex items-center gap-1.5 bg-gradient-to-r from-lux-accent to-blue-600 hover:from-blue-600 hover:to-indigo-600 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-lg hover:shadow-lux-accent/25 transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto shrink-0"
        >
          <Plus size={14} />
          <span>Registrar Cuota / Préstamo</span>
        </button>
      </div>

      {/* 1. SECCIÓN DE CUOTAS ACTIVAS */}
      <div className="flex flex-col gap-4">
        <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Cuotas Activas ({activeInstallments.length})</h3>

        {activeInstallments.length === 0 ? (
          <div className="glass-panel p-8 rounded-3xl border-lux-border/40 text-center flex flex-col items-center justify-center">
            <Percent size={32} className="text-lux-muted mb-2.5" />
            <p className="text-sm font-bold text-lux-text">No hay cuotas o préstamos activos</p>
            <p className="text-xs text-lux-muted mt-1 max-w-xs">
              Registra compras a plazos o préstamos para proyectar su débito en el tiempo y tener un control exacto de tus finanzas.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {activeInstallments.map((inst) => (
              <div 
                key={inst.id}
                onClick={() => setDetailInstallment(inst)}
                className="glass-panel p-5 rounded-3xl border-lux-border/30 flex flex-col gap-3 relative overflow-hidden cursor-pointer hover:bg-lux-panel/30 active:scale-[0.99] transition-all duration-300"
              >
                {/* Cabecera del ítem */}
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-lux-text">{inst.description}</span>
                    <span className="text-[10px] text-lux-muted font-semibold flex items-center gap-1">
                      <CalendarDays size={12} />
                      Primer débito: {inst.first_debit_day || 10} de {getPeriodLabel(inst.first_debit_year, inst.first_debit_month)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-extrabold text-lux-accent">
                      {Number(inst.amount_per_installment).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}/mes
                    </span>
                    <span className="text-[9px] text-lux-muted">Total: {Number(inst.total_amount).toFixed(2)}€</span>
                  </div>
                </div>

                {/* Barra de progreso visual */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-lux-muted">Progreso de Pago</span>
                    <span className="text-lux-text">{inst.paidCount} de {inst.num_installments} cuotas</span>
                  </div>
                  <div className="w-full h-2 bg-lux-border/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-lux-accent to-brand-indigo rounded-full transition-all duration-500"
                      style={{ width: `${inst.progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Pie con detalles y botones de acción */}
                <div className="flex justify-between items-center pt-2 border-t border-lux-border/10 text-[10px] text-lux-muted font-semibold">
                  <span className="flex items-center gap-1">
                    <CreditCard size={12} />
                    {inst.payment_type === 'credit_card' ? 'Tarjeta' : 'Cuenta'}: {inst.account}
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleOpenEdit(inst); }}
                      className="p-1 rounded-full hover:bg-lux-accent/15 text-lux-accent hover:text-blue-400 transition-colors flex items-center gap-0.5 cursor-pointer"
                      title="Editar parámetros"
                    >
                      <Edit2 size={12} />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleCancel(inst.id, inst.description); }}
                      className="p-1 rounded-full hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 transition-colors flex items-center gap-0.5 cursor-pointer"
                      title="Cancelar"
                    >
                      <Trash2 size={12} />
                      <span>Eliminar</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. SECCIÓN DE CUOTAS FINALIZADAS */}
      {finishedInstallments.length > 0 && (
        <div className="flex flex-col gap-3 mt-8">
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Historial Completadas ({finishedInstallments.length})</h3>
          
          <div className="flex flex-col gap-2.5 opacity-60 hover:opacity-90 transition-opacity">
            {finishedInstallments.map((inst) => (
              <div 
                key={inst.id}
                onClick={() => setDetailInstallment(inst)}
                className="glass-panel px-4 py-3 rounded-2xl border-lux-border/20 flex justify-between items-center text-xs cursor-pointer hover:bg-lux-panel/30 active:scale-[0.99] transition-all duration-300"
              >
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 size={16} className="text-brand-emerald shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-bold text-lux-text">{inst.description}</span>
                    <span className="text-[10px] text-lux-muted">Finalizó en {getPeriodLabel(inst.first_debit_year + Math.floor((inst.first_debit_month + inst.num_installments - 2) / 12), ((inst.first_debit_month + inst.num_installments - 2) % 12) + 1)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-bold text-lux-muted">{Number(inst.total_amount).toFixed(2)}€</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCancel(inst.id, inst.description); }}
                    className="text-brand-rose hover:text-red-400 transition-colors cursor-pointer"
                    title="Eliminar historial"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PANEL DE REGISTRO DIRECTO / EDICIÓN */}
      <Panel
        isOpen={isOpenPanel}
        onClose={resetForm}
        title={editingId ? 'Editar Parámetros' : 'Registrar Cuota / Préstamo'}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción (Concepto)</label>
            <input
              type="text"
              required
              placeholder="Ej: Cuota del Auto, Mutuo Hogar, Heladera"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Importe por Cuota (€)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={installmentAmount}
                onChange={(e) => handleInstallmentAmountChange(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Nro de Cuotas</label>
              <input
                type="number"
                min="1"
                required
                placeholder="Ej: 12, 60, 120"
                value={numInstallments}
                onChange={(e) => handleNumInstallmentsChange(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Importe Total Proyectado</span>
            <div className="px-4 py-3 rounded-2xl border border-lux-border/40 bg-lux-panel/30 text-lux-accent font-bold text-sm select-none">
              € {((installmentAmount && numInstallments) ? (parseFloat(installmentAmount) * parseInt(numInstallments)).toFixed(2) : '0.00')}
            </div>
            <p className="text-[10px] text-lux-muted">Calculado automáticamente (Cuota × Cantidad).</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <ChipsSelector
              label="Tipo de Pago"
              options={[
                { value: 'credit_card', label: 'Tarjeta de Crédito', icon: <CreditCard size={14} /> },
                { value: 'debit', label: 'Débito Automático (Cuenta)', icon: <Percent size={14} /> }
              ]}
              selectedValue={paymentType}
              onChange={(val: any) => setPaymentType(val)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Instrumento de Pago</label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text cursor-pointer focus:outline-none transition-all"
            >
              {currentHolders.map((hName) => {
                const hAccs = currentAccounts.filter((acc) => acc.holder === hName);
                if (hAccs.length === 0) return null;
                return (
                  <optgroup key={hName} label={`Cuentas de ${hName}`} className="bg-lux-panel text-lux-text">
                    {hAccs.map((acc) => {
                      const displayName = acc.name?.trim() || (acc.type === 'credit_card' ? 'Tarjeta de Crédito' : acc.type === 'cash' ? 'Efectivo' : 'Cuenta de Débito');
                      return (
                        <option key={acc.id} value={acc.name} className="bg-lux-panel text-lux-text">
                          {displayName} {acc.type === 'credit_card' ? '💳' : acc.type === 'cash' ? '💵' : '🏦'}
                        </option>
                      );
                    })}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Día de Inicio</label>
              <select
                value={firstDay}
                onChange={(e) => setFirstDay(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-3 py-3 text-sm text-lux-text"
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Mes de Inicio</label>
              <select
                value={firstMonth}
                onChange={(e) => setFirstMonth(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-3 py-3 text-sm text-lux-text"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{getPeriodLabel(2000, m).split(' ')[0]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Año de Inicio</label>
              <select
                value={firstYear}
                onChange={(e) => setFirstYear(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-3 py-3 text-sm text-lux-text"
              >
                {Array.from({ length: 15 }, (_, i) => currentPeriod.year - 4 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Notas Opcionales</label>
            <textarea
              placeholder="Detalles sobre el préstamo o cuotas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-lux-accent to-blue-600 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
          >
            {editingId ? 'Guardar Cambios' : 'Proyectar Cuotas / Préstamo'}
          </button>
        </form>
      </Panel>

      {/* PANEL DE DETALLE DE CUOTA */}
      <Panel
        isOpen={!!detailInstallment}
        onClose={() => setDetailInstallment(null)}
        title="Detalle de Cuota / Préstamo"
      >
        {detailInstallment && (() => {
          const instHolder = currentAccounts.find(acc => acc.name === detailInstallment.account)?.holder || 'Compartido';
          return (
            <div className="flex flex-col gap-5 text-sm font-semibold text-lux-text pb-6">
              {/* Cabecera / Importe por Mes */}
              <div className="bg-lux-accent/10 border border-lux-accent/20 rounded-3xl p-5 text-center flex flex-col items-center justify-center relative overflow-hidden">
                <span className="text-[10px] text-lux-muted uppercase font-extrabold tracking-widest mb-1">Valor de la Cuota</span>
                <span className="text-3xl font-extrabold text-lux-accent">
                  {Number(detailInstallment.amount_per_installment).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}/mes
                </span>
                <span className="mt-1 text-[10px] text-lux-muted font-bold">Total: {Number(detailInstallment.total_amount).toFixed(2)}€</span>
              </div>

              {/* Progreso del pago */}
              <div className="bg-lux-panel/60 border border-lux-border/40 p-5 rounded-3xl flex flex-col gap-3">
                <div className="flex justify-between items-center text-[10px] font-bold">
                  <span className="text-lux-muted">Progreso de Pago</span>
                  <span className="text-lux-text">{detailInstallment.paidCount} de {detailInstallment.num_installments} cuotas</span>
                </div>
                <div className="w-full h-2 bg-lux-border/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-lux-accent to-brand-indigo rounded-full transition-all duration-500"
                    style={{ width: `${detailInstallment.progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Fichas de Datos */}
              <div className="flex flex-col gap-3.5 bg-lux-panel/60 border border-lux-border/40 p-5 rounded-3xl">
                <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                  <span className="text-xs text-lux-muted">Concepto</span>
                  <span className="text-sm font-bold text-right pl-4">{detailInstallment.description}</span>
                </div>

                <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                  <span className="text-xs text-lux-muted">Inicio de Período</span>
                  <span className="text-xs font-bold flex items-center gap-1">
                    <CalendarDays size={12} className="text-lux-muted" />
                    {detailInstallment.first_debit_day || 10} de {getPeriodLabel(detailInstallment.first_debit_year, detailInstallment.first_debit_month)}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                  <span className="text-xs text-lux-muted">Medio de Pago</span>
                  <span className="text-xs font-bold flex items-center gap-1">
                    <Landmark size={12} className="text-lux-accent" />
                    {detailInstallment.account}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                  <span className="text-xs text-lux-muted">Tipo de Cuenta</span>
                  <span className="text-xs font-bold">
                    {detailInstallment.payment_type === 'credit_card' ? 'Tarjeta de Crédito 💳' : 'Cuenta de Débito 🏦'}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-xs text-lux-muted">Responsable</span>
                  <span className={`px-2 py-0.5 border rounded-full text-[10px] ${getHolderBadgeColor(instHolder, 0)}`}>
                    {getHolderDisplayName(instHolder)}
                  </span>
                </div>
              </div>

              {/* Bloque de Notas */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-lux-muted">Notas / Comentarios</span>
                <div className="bg-lux-panel/30 border border-lux-border/30 rounded-3xl p-4 min-h-20 text-xs font-medium text-lux-text/90 italic leading-relaxed">
                  {detailInstallment.notes ? (
                    detailInstallment.notes
                  ) : (
                    <span className="text-lux-muted font-normal italic">Sin notas registradas para esta cuota.</span>
                  )}
                </div>
              </div>

              {/* Botón de Cerrar */}
              <button
                onClick={() => setDetailInstallment(null)}
                className="mt-2 w-full py-3.5 bg-lux-panel border border-lux-border/50 text-lux-text font-bold rounded-2xl hover:bg-lux-panel/60 transition-colors cursor-pointer text-xs"
              >
                Cerrar Detalle
              </button>
            </div>
          );
        })()}
      </Panel>
    </div>
  );
};
