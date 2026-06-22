import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel, formatCompactDate, toISODateString } from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { Panel } from '../ui/Panel';
import { 
  Trash2, Edit3, ArrowDownRight, ShoppingBag, Landmark, 
  Calendar, User, AlertTriangle, Plus, CreditCard, Check
} from 'lucide-react';

export const ExpensesScreen: React.FC = () => {
  const {
    monthsData, incomes, allIncomes, expenses, allExpenses, unplannedExpenses, installments, savingsConfig,
    deleteExpense, updateExpense, addExpense, activeMonthRecord, selectedPeriod, categories, showToast,
    activeHousehold
  } = useApp();

  // Cargar titulares y cuentas dinámicas con fallbacks seguros
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

  // Estados para Registro Directo (Añadir)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [addDesc, setAddDesc] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDate, setAddDate] = useState(toISODateString(new Date()));
  const [addHolder, setAddHolder] = useState(currentHolders[0] || 'Compartido');
  const [addAccount, setAddAccount] = useState(currentAccounts[0]?.name || 'Cuenta conjunta');
  const [addCategory, setAddCategory] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addIsRecurring, setAddIsRecurring] = useState(false);

  // Sincronizar titular y cuenta por defecto al cambiar el hogar activo
  useEffect(() => {
    if (currentHolders.length > 0) {
      setAddHolder(currentHolders[0]);
    }
    if (currentAccounts.length > 0) {
      setAddAccount(currentAccounts[0].name);
    }
  }, [activeHousehold]);

  // Estados para edición
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [account, setAccount] = useState('Cuenta conjunta');
  const [holder, setHolder] = useState('Compartido');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');

  // Estado para confirmación de borrado de gasto recurrente
  const [recurringExpenseToDelete, setRecurringExpenseToDelete] = useState<any | null>(null);

  // Estado para visualización del detalle de gasto
  const [detailExpense, setDetailExpense] = useState<any | null>(null);

  // Estado para el filtro de debitados (todos, pendientes, debitados)
  const [debitFilter, setDebitFilter] = useState<'all' | 'pending' | 'debited'>('all');

  const CHAR_EXPLICIT_DEBITED = '\u200C';
  const CHAR_EXPLICIT_PENDING = '\u200D';

  const handleToggleReconciled = async (exp: any, e: React.MouseEvent) => {
    e.stopPropagation(); // Evitar abrir modal de detalle
    
    const cleanDesc = exp.description
      .replace(/\u200C/g, '')
      .replace(/\u200D/g, '');

    let newDesc = cleanDesc;

    if (exp.is_reconciled) {
      newDesc = cleanDesc + CHAR_EXPLICIT_PENDING;
    } else {
      newDesc = cleanDesc + CHAR_EXPLICIT_DEBITED;
    }

    try {
      await updateExpense(exp.id, {
        description: newDesc
      });
      showToast(exp.is_reconciled ? 'Gasto marcado como pendiente' : 'Gasto marcado como debitado', 'success');
    } catch (err) {
      console.error('Error toggling reconciled state:', err);
      showToast('Error al cambiar el estado del gasto', 'error');
    }
  };

  const handleDeleteClick = (exp: any) => {
    if (exp.is_recurring) {
      setRecurringExpenseToDelete(exp);
    } else {
      if (window.confirm(`¿Estás seguro de que deseas eliminar el gasto "${exp.description}"?`)) {
        deleteExpense(exp.id);
      }
    }
  };

  const confirmDeleteRecurring = async (deleteFuture: boolean) => {
    if (recurringExpenseToDelete) {
      await deleteExpense(recurringExpenseToDelete.id, deleteFuture);
      setRecurringExpenseToDelete(null);
    }
  };

  // -------------------------------------------------------------------
  // CÁLCULO DE DATOS FINANCIEROS INYECTADOS
  // -------------------------------------------------------------------
  const calculatedMonths = calculateEncainedFinances(
    monthsData, allIncomes, allExpenses, unplannedExpenses, installments, savingsConfig, activeHousehold?.billing_cycle_start_day || 10
  );

  const currentPeriodData = calculatedMonths.find(
    (c) => c.year === selectedPeriod.year && c.month === selectedPeriod.month
  ) || {
    totalExpenses: expenses.reduce((acc, e) => acc + Number(e.amount), 0),
    expensesList: expenses
  };

  const monthExpensesList = currentPeriodData.expensesList || expenses;
  const totalExpenses = currentPeriodData.totalExpenses;

  // Calcular el total que falta por debitar
  const pendingAmount = monthExpensesList
    .filter((e: any) => !e.is_reconciled)
    .reduce((acc: number, e: any) => acc + Number(e.amount), 0);

  // Filtrar la lista de gastos
  const filteredExpensesList = monthExpensesList.filter((e: any) => {
    if (debitFilter === 'pending') return !e.is_reconciled;
    if (debitFilter === 'debited') return e.is_reconciled;
    return true; // 'all'
  });

  // Manejar edición
  const handleEditClick = (exp: any) => {
    setEditingExpense(exp);
    setDesc(exp.description);
    setAmount(String(exp.amount));
    setDate(exp.date);
    setAccount(exp.account);
    setHolder(exp.holder || 'Compartido');
    
    // Si es un mock de cuotas, buscamos su categoría real
    if (exp.id.startsWith('inst-mock')) {
      const cuotasCat = categories.find(c => c.name.toLowerCase() === 'cuotas');
      setCategory(cuotasCat ? cuotasCat.id : 'installments-placeholder');
    } else {
      setCategory(exp.category_id);
    }
    
    setNotes(exp.notes || '');
    setAdjustmentNote(exp.adjustment_note || '');
  };

  // Mapear color y display de titular
  const getHolderDisplayName = (h: string) => {
    return h;
  };

  const getAccountDisplayName = (a: string) => {
    return a;
  };

  const getHolderBadgeColor = (h: string, index: number) => {
    const colors = [
      'bg-purple-500/10 text-purple-400 border-purple-500/30',
      'bg-orange-500/10 text-orange-400 border-orange-500/30',
      'bg-blue-500/10 text-blue-400 border-blue-500/30',
      'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      'bg-pink-500/10 text-pink-400 border-pink-500/30'
    ];
    // Encontrar índice del titular en la lista para dar color consistente
    const hIdx = currentHolders.indexOf(h);
    return colors[hIdx !== -1 ? hIdx % colors.length : index % colors.length];
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDesc || !addAmount || !addCategory) {
      showToast('Por favor, completa descripción, importe y categoría', 'error');
      return;
    }

    try {
      await addExpense({
        description: addDesc,
        amount: parseFloat(addAmount),
        date: addDate,
        account: addAccount,
        holder: addHolder,
        category_id: addCategory,
        is_planned: activeMonthRecord?.status === 'planning',
        notes: addNotes || null,
        is_recurring: addIsRecurring,
        adjustment_note: null
      });

      // Resetear Formulario
      setAddDesc('');
      setAddAmount('');
      setAddDate(toISODateString(new Date()));
      setAddNotes('');
      setAddIsRecurring(false);
      setIsAddPanelOpen(false);
    } catch (err) {}
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount || !category) {
      showToast('Por favor, completa los campos obligatorios', 'error');
      return;
    }
    
    const isClosed = activeMonthRecord?.status === 'closed';
    if (isClosed && !adjustmentNote) {
      showToast('Debes proveer una nota de ajuste para editar en un mes cerrado', 'error');
      return;
    }

    try {
      // Gasto normal, recurrente o cuota proyectada (se materializan transparentemente en updateExpense)
      await updateExpense(editingExpense.id, {
        description: desc,
        amount: parseFloat(amount),
        date,
        account,
        holder,
        category_id: category,
        notes: notes || null
      }, isClosed ? adjustmentNote : undefined);
      setEditingExpense(null);
    } catch (e) {}
  };

  return (
    <div className="px-4 py-5 safe-bottom-padding animate-fade-in">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-extrabold font-sans text-gradient-rose">Gastos del Período</h2>
          <p className="text-xs text-lux-muted mt-0.5">{getPeriodLabel(selectedPeriod.year, selectedPeriod.month)}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {activeMonthRecord?.status !== 'closed' && (
            <button
              onClick={() => {
                setIsAddPanelOpen(true);
                // Pre-seleccionar la primera categoría de gastos disponible si existe
                const firstCat = categories.filter((c) => c.name.toLowerCase() !== 'cuotas' && c.name.toLowerCase() !== 'gastos no planificados')[0];
                if (firstCat) setAddCategory(firstCat.id);
              }}
              className="bg-brand-rose text-white px-3.5 py-2.5 rounded-2xl text-xs font-bold shadow-lg hover:shadow-brand-rose/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Registrar Gasto</span>
            </button>
          )}

          {pendingAmount > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 rounded-2xl flex items-center gap-1.5" title="Falta por debitar">
              <span className="text-[10px] font-bold text-amber-500 uppercase hidden sm:inline">Falta debitar:</span>
              <span className="text-xs sm:text-sm font-extrabold text-amber-500">
                {pendingAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
            </div>
          )}

          <div className="bg-brand-rose/10 border border-brand-rose/20 px-4 py-2.5 rounded-2xl flex items-center gap-2">
            <ArrowDownRight size={18} className="text-brand-rose" />
            <span className="text-sm font-extrabold text-brand-rose">
              {totalExpenses.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
        </div>
      </div>

      {/* Filtros de Débito */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        <button
          onClick={() => setDebitFilter('all')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
            debitFilter === 'all'
              ? 'bg-lux-panel border border-lux-border/80 text-lux-text shadow-sm'
              : 'bg-lux-panel/30 border border-lux-border/20 text-lux-muted hover:border-lux-border/40 hover:text-lux-text'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setDebitFilter('pending')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            debitFilter === 'pending'
              ? 'bg-amber-500/15 border border-amber-500/40 text-amber-500 shadow-sm'
              : 'bg-lux-panel/30 border border-lux-border/20 text-lux-muted hover:border-lux-border/40 hover:text-lux-text'
          }`}
        >
          <span>Pendientes ⏳</span>
          {monthExpensesList.filter(e => !e.is_reconciled).length > 0 && (
            <span className="bg-amber-500/20 px-1.5 py-0.2 rounded-md text-[10px] font-bold">
              {monthExpensesList.filter(e => !e.is_reconciled).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setDebitFilter('debited')}
          className={`px-4 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
            debitFilter === 'debited'
              ? 'bg-brand-emerald/15 border border-brand-emerald/40 text-brand-emerald shadow-sm'
              : 'bg-lux-panel/30 border border-lux-border/20 text-lux-muted hover:border-lux-border/40 hover:text-lux-text'
          }`}
        >
          <span>Debitados ✅</span>
          {monthExpensesList.filter(e => e.is_reconciled).length > 0 && (
            <span className="bg-brand-emerald/20 px-1.5 py-0.2 rounded-md text-[10px] font-bold">
              {monthExpensesList.filter(e => e.is_reconciled).length}
            </span>
          )}
        </button>
      </div>

      {monthExpensesList.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl border-lux-border/40 text-center flex flex-col items-center justify-center">
          <ShoppingBag size={36} className="text-lux-muted mb-3" />
          <p className="text-sm font-bold text-lux-text">Sin gastos registrados</p>
          <p className="text-xs text-lux-muted mt-1 max-w-xs mb-4">
            {activeMonthRecord?.status === 'planning'
              ? 'Puedes registrar gastos estimados o planificados para este mes.'
              : 'Registra tus compras del supermercado, facturas de servicios y más para iniciar.'}
          </p>
          {activeMonthRecord?.status !== 'closed' && (
            <button
              onClick={() => {
                setIsAddPanelOpen(true);
                const firstCat = categories.filter((c) => c.name.toLowerCase() !== 'cuotas' && c.name.toLowerCase() !== 'gastos no planificados')[0];
                if (firstCat) setAddCategory(firstCat.id);
              }}
              className="bg-gradient-to-r from-brand-rose to-red-600 text-white font-bold px-5 py-2.5 rounded-2xl shadow-lg hover:shadow-brand-rose/20 transition-transform active:scale-95 text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>Agregar Primer Gasto</span>
            </button>
          )}
        </div>
      ) : filteredExpensesList.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl border-lux-border/40 text-center flex flex-col items-center justify-center">
          <ShoppingBag size={36} className="text-lux-muted mb-3" />
          <p className="text-sm font-bold text-lux-text">Sin gastos para este filtro</p>
          <p className="text-xs text-lux-muted mt-1 max-w-xs">
            Prueba a seleccionar otra opción de filtro para el control de débito.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Agrupar por Categorías */}
          {categories.map((cat) => {
            const catExps = filteredExpensesList.filter(
              (e) => e.category_id === cat.id || (cat.name === 'Cuotas' && e.category_id === 'installments-placeholder')
            );
            
            if (catExps.length === 0) return null;

            const catTotal = catExps.reduce((acc, e) => acc + Number(e.amount), 0);

            return (
              <div key={cat.id} className="flex flex-col gap-2.5">
                {/* Cabecera de Categoría con subtotal */}
                <div className="flex justify-between items-center border-b border-lux-border/10 pb-1.5 px-1">
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: cat.color }} 
                    />
                    <span className="text-xs font-bold text-lux-text uppercase tracking-wider">{cat.name}</span>
                  </div>
                  <span className="text-xs font-extrabold text-lux-muted">
                    Subtotal: {catTotal.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>

                {/* Lista de gastos dentro de la categoría */}
                <div className="flex flex-col gap-2">
                  {catExps.map((exp, idx) => {
                    const isMock = exp.id.startsWith('inst-mock');
                    const isProjected = exp.id.startsWith('proj-exp-');
                    return (
                      <div 
                        key={exp.id}
                        onClick={() => setDetailExpense(exp)}
                        className={`glass-panel p-4 rounded-2xl border-lux-border/20 hover:border-lux-border/40 transition-all flex justify-between items-center relative overflow-hidden cursor-pointer hover:bg-lux-panel/30 active:scale-[0.99] ${
                          exp.is_planned ? 'planning-pattern border-brand-indigo/20' : ''
                        } ${exp.is_reconciled ? 'opacity-55' : 'opacity-100'}`}
                      >
                        {exp.is_planned && (
                          <div className="absolute top-0 left-0 bg-brand-indigo text-white text-[7px] font-extrabold px-1.5 py-0.5 rounded-br-xl uppercase tracking-wider scale-90">
                            Proyectado
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3 pr-3 min-w-0">
                          {/* Checkbox circular interactivo */}
                          <button
                            onClick={(e) => handleToggleReconciled(exp, e)}
                            className={`w-5 h-5 rounded-full border shrink-0 flex items-center justify-center transition-all cursor-pointer ${
                              exp.is_reconciled
                                ? 'bg-brand-emerald/20 border-brand-emerald text-brand-emerald animate-pulse-slow'
                                : 'border-lux-border hover:border-lux-muted text-transparent'
                            }`}
                            title={exp.is_reconciled ? "Marcar como pendiente" : "Marcar como debitado"}
                          >
                            <Check size={12} className="stroke-[3]" />
                          </button>

                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className={`text-xs font-bold text-lux-text truncate ${exp.is_reconciled ? 'text-lux-muted/65 font-medium' : ''}`}>{exp.description}</span>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-lux-muted font-semibold mt-1">
                              <span className="flex items-center gap-0.5 text-lux-accent">
                                <Landmark size={10} />
                                {exp.account}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <User size={10} />
                                {getHolderDisplayName(exp.holder)}
                              </span>
                              {exp.installment_number && (
                                <span className="px-1.5 py-0.2 bg-lux-panel border border-lux-border/50 text-[9px] text-lux-text rounded">
                                  Cuota {exp.installment_number}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-xs font-extrabold text-lux-text">
                            {Number(exp.amount).toFixed(2)}€
                          </span>
                          {activeMonthRecord?.status !== 'closed' && (
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditClick(exp); }}
                                className="p-2 rounded-full hover:bg-lux-border/50 text-lux-muted hover:text-lux-text transition-colors cursor-pointer"
                                title="Editar"
                              >
                                <Edit3 size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(exp); }}
                                className="p-2 rounded-full hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 transition-colors cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PANEL DE REGISTRAR GASTO */}
      <Panel
        isOpen={isAddPanelOpen}
        onClose={() => setIsAddPanelOpen(false)}
        title={activeMonthRecord?.status === 'planning' ? 'Planificar Gasto Futuro' : 'Registrar Gasto'}
      >
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción</label>
            <input
              type="text"
              required
              placeholder="Ej: Luz, Supermercado, Alquiler"
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Importe (€)</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha de Débito</label>
            <input
              type="date"
              required
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Responsable (Titular)</label>
            <select
              value={addHolder}
              onChange={(e) => setAddHolder(e.target.value)}
              className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            >
              {currentHolders.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Cuenta de Débito</label>
            <select
              value={addAccount}
              onChange={(e) => setAddAccount(e.target.value)}
              className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            >
              {currentHolders.map((hName) => {
                const hAccs = currentAccounts.filter((acc) => acc.holder === hName);
                if (hAccs.length === 0) return null;
                return (
                  <optgroup key={hName} label={`Cuentas de ${hName}`}>
                    {hAccs.map((acc) => (
                      <option key={acc.id} value={acc.name}>{acc.name}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Categoría del Gasto</label>
            <select
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            >
              {categories
                .filter((c) => c.name.toLowerCase() !== 'cuotas' && c.name.toLowerCase() !== 'gastos no planificados')
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>

          <label className="flex items-center gap-3 bg-lux-bg/40 border border-lux-border/50 p-4 rounded-2xl cursor-pointer hover:border-lux-accent/60 transition-colors my-1">
            <input
              type="checkbox"
              checked={addIsRecurring}
              onChange={(e) => setAddIsRecurring(e.target.checked)}
              className="w-5 h-5 rounded-md border-lux-border bg-lux-bg text-lux-accent focus:ring-lux-accent cursor-pointer accent-lux-accent"
            />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-lux-text">Gasto Recurrente</span>
              <span className="text-[10px] text-lux-muted">Se copiará automáticamente en los meses sucesivos</span>
            </div>
          </label>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Notas Opcionales</label>
            <textarea
              placeholder="Detalles del gasto..."
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              rows={2}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-rose to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
          >
            Guardar Gasto
          </button>
        </form>
      </Panel>

      {/* PANEL DE EDICIÓN DE GASTO */}
      <Panel 
        isOpen={editingExpense !== null} 
        onClose={() => setEditingExpense(null)}
        title="Editar Gasto"
      >
        {editingExpense && (
          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción</label>
              <input
                type="text"
                required
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Importe (€)</label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Responsable</label>
              <select
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                {currentHolders.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Cuenta de Débito</label>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                {currentHolders.map((hName) => {
                  const hAccs = currentAccounts.filter((acc) => acc.holder === hName);
                  if (hAccs.length === 0) return null;
                  return (
                    <optgroup key={hName} label={`Cuentas de ${hName}`}>
                      {hAccs.map((acc) => (
                        <option key={acc.id} value={acc.name}>{acc.name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                {categories
                  .filter((c) => {
                    const isCuotas = c.name.toLowerCase() === 'cuotas';
                    const isUnplanned = c.name.toLowerCase() === 'gastos no planificados';
                    const isInstallment = editingExpense?.id?.startsWith('inst-mock') || !!editingExpense?.installment_id;
                    if (isInstallment && isCuotas) {
                      return true;
                    }
                    return !isCuotas && !isUnplanned;
                  })
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text resize-none"
              />
            </div>

            {activeMonthRecord?.status === 'closed' && (
              <div className="flex flex-col gap-1.5 border border-brand-rose/20 p-3 rounded-2xl bg-brand-rose/5 animate-fade-in">
                <label className="text-xs font-extrabold text-brand-rose uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle size={12} />
                  <span>Explicación del Ajuste Obligatorio</span>
                </label>
                <textarea
                  required
                  placeholder="Por qué estás modificando un gasto en un mes cerrado..."
                  value={adjustmentNote}
                  onChange={(e) => setAdjustmentNote(e.target.value)}
                  rows={2}
                  className="w-full bg-lux-bg/60 border border-brand-rose/40 focus:border-brand-rose rounded-xl px-3 py-2 text-xs text-lux-text resize-none"
                />
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-brand-rose to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
            >
              Guardar Cambios
            </button>
          </form>
        )}
      </Panel>

      {/* MODAL DE CONFIRMACIÓN DE BORRADO DE GASTO RECURRENTE */}
      {recurringExpenseToDelete && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          {/* Fondo desenfocado */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setRecurringExpenseToDelete(null)}
          />
          
          {/* Tarjeta del diálogo */}
          <div className="relative w-full max-w-sm glass-panel p-6 rounded-3xl border border-lux-border/40 shadow-2xl z-10 flex flex-col gap-5 text-center animate-fade-in">
            <div className="mx-auto w-12 h-12 bg-brand-rose/10 border border-brand-rose/20 rounded-2xl flex items-center justify-center text-brand-rose">
              <Trash2 size={20} />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <h4 className="text-base font-bold text-lux-text">Gasto Recurrente</h4>
              <p className="text-xs text-lux-muted leading-relaxed">
                El gasto <strong className="text-lux-text">"{recurringExpenseToDelete.description}"</strong> está marcado como recurrente. ¿Cómo deseas eliminarlo?
              </p>
            </div>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={() => confirmDeleteRecurring(true)}
                className="w-full bg-gradient-to-r from-brand-rose to-red-600 hover:from-red-600 hover:to-red-750 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg hover:shadow-brand-rose/25 transition-all active:scale-[0.98] cursor-pointer"
              >
                Eliminar de este mes y meses posteriores
              </button>
              
              <button
                onClick={() => confirmDeleteRecurring(false)}
                className="w-full bg-lux-panel border border-lux-border/60 hover:border-lux-border text-lux-text text-xs font-bold py-3.5 rounded-2xl transition-all hover:bg-lux-panel/60 cursor-pointer"
              >
                Eliminar solo de este mes
              </button>
              
              <button
                onClick={() => setRecurringExpenseToDelete(null)}
                className="w-full bg-transparent hover:bg-lux-border/20 text-lux-muted hover:text-lux-text text-xs font-bold py-2.5 rounded-2xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PANEL DE DETALLE DE GASTO */}
      <Panel
        isOpen={!!detailExpense}
        onClose={() => setDetailExpense(null)}
        title="Detalle del Gasto"
      >
        {detailExpense && (
          <div className="flex flex-col gap-5 text-sm font-semibold text-lux-text pb-6">
            {/* Cabecera / Importe */}
            <div className="bg-brand-rose/10 border border-brand-rose/20 rounded-3xl p-5 text-center flex flex-col items-center justify-center relative overflow-hidden">
              <span className="text-[10px] text-lux-muted uppercase font-extrabold tracking-widest mb-1">Importe del Gasto</span>
              <span className="text-3xl font-extrabold text-brand-rose">
                -{Number(detailExpense.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
              </span>
              {detailExpense.is_planned && (
                <span className="mt-2.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold bg-brand-indigo/15 border border-brand-indigo/40 text-brand-indigo uppercase tracking-wider">
                  Planificado
                </span>
              )}
            </div>

            {/* Fichas de Datos */}
            <div className="flex flex-col gap-3.5 bg-lux-panel/60 border border-lux-border/40 p-5 rounded-3xl">
              <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                <span className="text-xs text-lux-muted">Concepto</span>
                <span className="text-sm font-bold text-right pl-4">{detailExpense.description}</span>
              </div>

              <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                <span className="text-xs text-lux-muted">Categoría</span>
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-xl bg-lux-bg/60 border border-lux-border/40 text-gradient-sky">
                  {categories.find(c => c.id === detailExpense.category_id)?.name || 'General'}
                </span>
              </div>

              <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                <span className="text-xs text-lux-muted">Fecha</span>
                <span className="text-xs font-bold flex items-center gap-1">
                  <Calendar size={12} className="text-lux-muted" />
                  {new Date(detailExpense.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>

              <div className="flex justify-between items-center pb-2.5 border-b border-lux-border/20">
                <span className="text-xs text-lux-muted">Medio de Pago</span>
                <span className="text-xs font-bold flex items-center gap-1">
                  <Landmark size={12} className="text-lux-accent" />
                  {getAccountDisplayName(detailExpense.account)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs text-lux-muted">Responsable</span>
                {detailExpense.holder && (
                  <span className={`px-2 py-0.5 border rounded-full text-[10px] ${getHolderBadgeColor(detailExpense.holder, 0)}`}>
                    {getHolderDisplayName(detailExpense.holder)}
                  </span>
                )}
              </div>
            </div>

            {/* Bloque de Notas */}
            <div className="flex flex-col gap-2">
              <span className="text-xs text-lux-muted">Notas / Comentarios</span>
              <div className="bg-lux-panel/30 border border-lux-border/30 rounded-3xl p-4 min-h-20 text-xs font-medium text-lux-text/90 italic leading-relaxed">
                {detailExpense.notes ? (
                  detailExpense.notes
                ) : (
                  <span className="text-lux-muted font-normal italic">Sin notas registradas para este gasto.</span>
                )}
              </div>
            </div>

            {/* Ajustes de cierre (Si existen) */}
            {detailExpense.adjustment_note && (
              <div className="flex flex-col gap-2 border border-brand-rose/20 bg-brand-rose/5 rounded-3xl p-4">
                <span className="text-xs text-brand-rose flex items-center gap-1 font-extrabold uppercase tracking-wide">
                  <AlertTriangle size={12} />
                  Nota de Ajuste Post-Cierre
                </span>
                <p className="text-xs font-medium text-lux-text/90 leading-relaxed">
                  {detailExpense.adjustment_note}
                </p>
              </div>
            )}

            {/* Botón de Cerrar */}
            <button
              onClick={() => setDetailExpense(null)}
              className="mt-2 w-full py-3.5 bg-lux-panel border border-lux-border/50 text-lux-text font-bold rounded-2xl hover:bg-lux-panel/60 transition-colors cursor-pointer text-xs"
            >
              Cerrar Detalle
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
};
