import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  getPeriodLabel, getPeriodList, arePeriodsEqual, 
  FinancialPeriod, toISODateString 
} from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { Panel } from '../ui/Panel';
import { ChipsSelector, ChipOption } from '../ui/ChipsSelector';
import { 
  Plus, ArrowUpRight, ArrowDownRight, PiggyBank, Calendar, 
  FileText, CreditCard, Landmark, Coins, TrendingUp, AlertTriangle, Sparkles
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const {
    activeHousehold, userRole, currentPeriod, selectedPeriod, setSelectedPeriod,
    monthsData, activeMonthRecord, incomes, expenses, unplannedExpenses, installments,
    savingsConfig, addIncome, addExpense, addInstallment, addUnplannedExpense,
    categories, closeMonth, reopenMonth, showToast
  } = useApp();

  // Estados para controlar los paneles flotantes (formularios)
  const [panelOpen, setPanelOpen] = useState<'income' | 'expense' | 'installment' | 'unplanned' | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Ref para centrar el período seleccionado de forma automática en el scroll horizontal
  const activePeriodRef = React.useRef<HTMLButtonElement>(null);

  // Auto-scrollear para centrar el mes seleccionado al cargar o cambiar de mes
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (activePeriodRef.current) {
        activePeriodRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [selectedPeriod]);

  // Cargar titulares y cuentas dinámicas con fallbacks seguros
  const currentHolders: string[] = activeHousehold?.holders || [
    activeHousehold?.holder_1_name || 'Titular 1',
    activeHousehold?.holder_2_name || 'Titular 2',
    'Compartido'
  ];

  const currentAccounts: any[] = activeHousehold?.accounts || [
    { id: '1', name: activeHousehold?.account_1_name || 'Cuenta Titular 1', type: 'bank_account', holder: activeHousehold?.holder_1_name || 'Titular 1' },
    { id: '2', name: activeHousehold?.account_2_name || 'Cuenta Titular 2', type: 'bank_account', holder: activeHousehold?.holder_2_name || 'Titular 2' },
    { id: '3', name: activeHousehold?.account_joint_name || 'Cuenta conjunta', type: 'bank_account', holder: 'Compartido' }
  ];

  // Sincronizar valores iniciales de formularios dinámicamente al cambiar de hogar o de titulares
  React.useEffect(() => {
    if (currentHolders.length > 0) {
      setHolder(currentHolders[0]);
    }
    if (currentAccounts.length > 0) {
      setAccount(currentAccounts[0].name);
    }
  }, [activeHousehold]);

  // Estados de formularios
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toISODateString(new Date()));
  const [account, setAccount] = useState('Cuenta conjunta');
  const [holder, setHolder] = useState('Compartido');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);

  // Estados de formulario de Cuotas
  const [totalAmount, setTotalAmount] = useState('');
  const [numInstallments, setNumInstallments] = useState('12');
  const [installmentAmount, setInstallmentAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'credit_card' | 'debit'>('credit_card');
  const [firstMonth, setFirstMonth] = useState(String(currentPeriod.month));
  const [firstYear, setFirstYear] = useState(String(currentPeriod.year));

  // -------------------------------------------------------------------
  // CÁLCULO DE DATOS FINANCIEROS ENCADENADOS
  // -------------------------------------------------------------------
  const calculatedMonths = calculateEncainedFinances(
    monthsData,
    // El motor de finanzas necesita todos los datos de todos los meses para encadenar
    // pero para optimizar, usamos los locales si solo tenemos cargado el actual
    // o el contexto se encarga de proveerlos. Inyectamos los del estado local
    incomes, expenses, unplannedExpenses, installments, savingsConfig
  );

  // Obtener los datos del período seleccionado actual
  const currentPeriodData: any = calculatedMonths.find(
    (c) => c.year === selectedPeriod.year && c.month === selectedPeriod.month
  ) || {
    totalIncomes: incomes.reduce((acc: number, i: any) => acc + Number(i.amount), 0),
    totalExpenses: expenses.reduce((acc: number, e: any) => acc + Number(e.amount), 0),
    totalUnplanned: unplannedExpenses.reduce((acc: number, u: any) => acc + Number(u.amount), 0),
    saving: 0,
    previousBalance: savingsConfig?.initial_balance || 0,
    finalBalance: savingsConfig?.initial_balance || 0,
    expensesList: expenses,
    incomesList: incomes,
    unplannedList: unplannedExpenses
  };

  // Calcular el saldo real acumulado actual
  // Es el saldo final del mes en curso real (ignorando proyecciones futuras)
  const currentRealMonthData = calculatedMonths.find(
    (c) => c.year === currentPeriod.year && c.month === currentPeriod.month
  );
  const totalRealSavings = currentRealMonthData 
    ? currentRealMonthData.finalBalance 
    : (savingsConfig?.initial_balance || 0);

  // Lista de meses para el selector superior (6 pasados, 6 futuros)
  const navMonths = getPeriodList(currentPeriod, 6, 6);

  // Convertir titulares dinámicos a opciones de ChipOption
  const holderOptions: ChipOption<string>[] = currentHolders.map((h, index) => {
    const colors = [
      'border-purple-500 bg-purple-500/10 text-purple-400',
      'border-orange-500 bg-orange-500/10 text-orange-400',
      'border-lux-accent bg-lux-accent/10 text-lux-accent',
      'border-emerald-500 bg-emerald-500/10 text-emerald-400',
      'border-pink-500 bg-pink-500/10 text-pink-400'
    ];
    return {
      value: h,
      label: h,
      color: colors[index % colors.length]
    };
  });

  // Convertir cuentas dinámicas a opciones de ChipOption, filtradas según el titular seleccionado
  const accountOptions: ChipOption<string>[] = currentAccounts
    .filter((acc) => acc.holder === holder || holder === 'Compartido' || acc.holder === 'Compartido')
    .map((acc) => {
      let icon = <Landmark size={14} />;
      if (acc.type === 'credit_card') icon = <CreditCard size={14} />;
      if (acc.type === 'cash') icon = <Coins size={14} />;
      
      return {
        value: acc.name,
        label: acc.name.length > 12 ? acc.name.substring(0, 10) + '..' : acc.name,
        icon
      };
    });

  // -------------------------------------------------------------------
  // ENVÍO DE FORMULARIOS
  // -------------------------------------------------------------------
  const resetForm = () => {
    setDesc('');
    setAmount('');
    setDate(toISODateString(new Date()));
    setAccount(currentAccounts[0]?.name || 'Cuenta conjunta');
    setHolder(currentHolders[0] || 'Compartido');
    setCategory('');
    setNotes('');
    setAdjustmentNote('');
    setIsRecurring(false);
    setTotalAmount('');
    setNumInstallments('12');
    setInstallmentAmount('');
    setPaymentType('credit_card');
    setFirstMonth(String(currentPeriod.month));
    setFirstYear(String(currentPeriod.year));
    setPanelOpen(null);
  };

  const handleAddIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount) {
      showToast('Por favor, ingresa descripción e importe', 'error');
      return;
    }
    try {
      await addIncome({
        description: desc,
        amount: parseFloat(amount),
        date,
        account,
        category: (category as any) || null,
        is_estimated: activeMonthRecord?.status === 'planning'
      });
      resetForm();
    } catch (e) {}
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount || !category) {
      showToast('Por favor, completa descripción, importe y categoría', 'error');
      return;
    }
    
    const isClosed = activeMonthRecord?.status === 'closed';
    if (isClosed && !adjustmentNote) {
      showToast('Para un mes cerrado, debes indicar una nota de ajuste obligatoria', 'error');
      return;
    }

    try {
      await addExpense({
        description: desc,
        amount: parseFloat(amount),
        date,
        account,
        holder,
        category_id: category,
        is_planned: activeMonthRecord?.status === 'planning',
        notes: notes || null,
        is_recurring: isRecurring,
        adjustment_note: isClosed ? adjustmentNote : null
      });
      resetForm();
    } catch (e) {}
  };

  const handleAddInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !totalAmount || !installmentAmount) {
      showToast('Por favor, completa los importes', 'error');
      return;
    }
    try {
      await addInstallment({
        description: desc,
        total_amount: parseFloat(totalAmount),
        num_installments: parseInt(numInstallments),
        amount_per_installment: parseFloat(installmentAmount),
        payment_type: paymentType,
        account,
        first_debit_month: parseInt(firstMonth),
        first_debit_year: parseInt(firstYear),
        notes: notes || null
      });
      resetForm();
    } catch (e) {}
  };

  const handleAddUnplanned = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount) {
      showToast('Ingresa descripción e importe', 'error');
      return;
    }
    try {
      await addUnplannedExpense({
        description: desc,
        amount: parseFloat(amount),
        date,
        account,
        holder,
        category: category || null
      });
      resetForm();
    } catch (e) {}
  };

  // Autocalcular cuota mensual al cambiar monto total o número de cuotas
  const handleTotalAmountChange = (val: string) => {
    setTotalAmount(val);
    if (val && numInstallments) {
      const calculated = (parseFloat(val) / parseInt(numInstallments)).toFixed(2);
      setInstallmentAmount(calculated);
    }
  };

  const handleNumInstallmentsChange = (val: string) => {
    setNumInstallments(val);
    if (totalAmount && val) {
      const calculated = (parseFloat(totalAmount) / parseInt(val)).toFixed(2);
      setInstallmentAmount(calculated);
    }
  };

  return (
    <div className="pb-24">
      {/* -----------------------------------------------------------------
          1. CABECERA Y SELECCIÓN DE HOGAR ACTIVO
          ----------------------------------------------------------------- */}
      <div className="flex justify-between items-center px-4 pt-4 pb-2 border-b border-lux-border/20 bg-lux-bg/60 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-lux-accent to-brand-indigo flex items-center justify-center shadow-lg shadow-lux-accent/15">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold font-sans leading-none text-gradient-sky">
              {activeHousehold?.name}
            </h1>
            <span className="text-[10px] text-lux-muted uppercase font-bold tracking-wider">
              {userRole === 'admin' ? 'Administrador' : 'Colaborador'}
            </span>
          </div>
        </div>

        {/* Indicador de Estado del Mes seleccionado */}
        {activeMonthRecord && (
          <div className="flex items-center gap-1.5">
            {activeMonthRecord.status === 'planning' && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-indigo/15 border border-brand-indigo/40 text-brand-indigo uppercase tracking-wider animate-pulse">
                Planificado
              </span>
            )}
            {activeMonthRecord.status === 'closed' && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-rose/15 border border-brand-rose/40 text-brand-rose uppercase tracking-wider">
                Cerrado
              </span>
            )}
            {activeMonthRecord.status === 'open' && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-emerald/15 border border-brand-emerald/40 text-brand-emerald uppercase tracking-wider">
                Abierto
              </span>
            )}
          </div>
        )}
      </div>

      {/* -----------------------------------------------------------------
          2. NAVEGACIÓN TEMPORAL (SCROLL HORIZONTAL)
          ----------------------------------------------------------------- */}
      <div className="flex gap-2 overflow-x-auto py-3 px-4 scrollbar-none border-b border-lux-border/10 select-none bg-lux-bg/40 scroll-smooth">
        {navMonths.map((p, idx) => {
          const isSelected = arePeriodsEqual(p, selectedPeriod);
          const isCurrent = arePeriodsEqual(p, currentPeriod);
          const isFuture = p.year > currentPeriod.year || (p.year === currentPeriod.year && p.month > currentPeriod.month);

          return (
            <button
              key={idx}
              ref={isSelected ? activePeriodRef : null}
              onClick={() => setSelectedPeriod(p)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-2xl border text-xs font-bold transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-lux-accent bg-lux-accent/15 text-lux-accent shadow-md shadow-lux-accent/5'
                  : 'border-lux-border/40 bg-lux-panel/30 text-lux-muted hover:border-lux-border/60 hover:bg-lux-panel/50 hover:text-lux-text'
              }`}
            >
              <Calendar size={12} className={isSelected ? 'text-lux-accent' : 'text-lux-muted'} />
              <span>{getPeriodLabel(p.year, p.month)}</span>
              {isCurrent && (
                <span className="w-1.5 h-1.5 bg-brand-emerald rounded-full" title="Mes en curso" />
              )}
              {isFuture && (
                <span className="text-[9px] font-bold text-brand-indigo bg-brand-indigo/15 border border-brand-indigo/30 px-1 rounded">
                  P
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* -----------------------------------------------------------------
          3. TARJETAS FINANCIERAS PRINCIPALES
          ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 px-4 pt-5">
        {/* Tarjeta 1: Ahorro Acumulado Real (Principal) */}
        <div className="col-span-2 glass-panel p-5 rounded-3xl premium-card flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:scale-110 transition-transform duration-300">
            <PiggyBank size={96} className="text-brand-emerald" />
          </div>
          <div className="flex items-center gap-2 text-lux-muted">
            <PiggyBank size={18} className="text-brand-emerald" />
            <span className="text-xs font-bold uppercase tracking-wider">Ahorro Acumulado Real</span>
          </div>
          <div className="mt-4">
            <span className="text-3xl lg:text-4xl font-extrabold font-sans text-gradient-emerald">
              {Number(totalRealSavings).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
            <p className="text-[10px] text-lux-muted mt-1.5 font-medium">
              Saldo consolidado en fondo al día de hoy ({getPeriodLabel(currentPeriod.year, currentPeriod.month)})
            </p>
          </div>
        </div>

        {/* Tarjeta 2: Ahorro del Mes */}
        <div className="glass-panel p-4 rounded-3xl flex flex-col justify-between border-lux-border/40">
          <div className="flex items-center gap-2 text-lux-muted">
            <Coins size={14} className={currentPeriodData.saving >= 0 ? 'text-brand-emerald' : 'text-brand-rose'} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Ahorro del Mes</span>
          </div>
          <div className="mt-3">
            <span className={`text-xl lg:text-2xl font-extrabold font-sans ${
              currentPeriodData.saving >= 0 ? 'text-brand-emerald' : 'text-brand-rose'
            }`}>
              {currentPeriodData.saving >= 0 ? '+' : ''}
              {Number(currentPeriodData.saving).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
            <p className="text-[9px] text-lux-muted mt-1">Ingresos − Gastos</p>
          </div>
        </div>

        {/* Tarjeta 3: Ingresos Totales */}
        <div className="glass-panel p-4 rounded-3xl flex flex-col justify-between border-lux-border/40">
          <div className="flex items-center gap-2 text-lux-muted">
            <ArrowUpRight size={14} className="text-brand-emerald" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Ingresos del Mes</span>
          </div>
          <div className="mt-3">
            <span className="text-xl lg:text-2xl font-extrabold font-sans text-brand-emerald">
              {Number(currentPeriodData.totalIncomes).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
            <p className="text-[9px] text-lux-muted mt-1">
              {activeMonthRecord?.status === 'planning' ? 'Estimado' : 'Acreditado'}
            </p>
          </div>
        </div>

        {/* Tarjeta 4: Gastos del Mes */}
        <div className="glass-panel p-4 rounded-3xl flex flex-col justify-between border-lux-border/40">
          <div className="flex items-center gap-2 text-lux-muted">
            <ArrowDownRight size={14} className="text-brand-rose" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Gastos Corrientes</span>
          </div>
          <div className="mt-3">
            <span className="text-xl lg:text-2xl font-extrabold font-sans text-brand-rose">
              {Number(currentPeriodData.totalExpenses).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
            <p className="text-[9px] text-lux-muted mt-1">Corriente + Cuotas</p>
          </div>
        </div>
      </div>

      {/* -----------------------------------------------------------------
          4. ADVERTENCIA SI SUPERA EL PRESUPUESTO DE SUPERMERCADO
          ----------------------------------------------------------------- */}
      {(() => {
        // Encontrar categoría supermercado
        const superCat = categories.find((c) => c.name.toLowerCase().includes('supermercado'));
        if (!superCat || !superCat.budget_limit) return null;
        
        // Sumar gastos de esta categoría en este mes
        const monthExps = currentPeriodData.expensesList || expenses;
        const totalSuper = monthExps
          .filter((e: any) => e.category_id === superCat.id)
          .reduce((acc: number, e: any) => acc + Number(e.amount), 0);

        const limit = Number(superCat.budget_limit);
        const percent = Math.min((totalSuper / limit) * 100, 100);
        const isOver = totalSuper > limit;

        return (
          <div className="mx-4 mt-5 glass-panel p-4.5 rounded-3xl border-lux-border/40 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${isOver ? 'bg-brand-rose animate-ping' : 'bg-brand-emerald'}`} />
                <span className="text-xs font-bold text-lux-text">Presupuesto: Supermercado y Varios</span>
              </div>
              <span className={`text-xs font-extrabold ${isOver ? 'text-brand-rose' : 'text-lux-muted'}`}>
                {totalSuper.toFixed(2)}€ / {limit}€
              </span>
            </div>
            
            {/* Barra de progreso animada */}
            <div className="w-full h-2 bg-lux-border/30 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isOver 
                    ? 'bg-gradient-to-r from-red-500 to-brand-rose' 
                    : percent > 80 
                      ? 'bg-brand-amber' 
                      : 'bg-gradient-to-r from-emerald-500 to-brand-emerald'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>

            {isOver && (
              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-brand-rose font-semibold bg-brand-rose/10 px-2.5 py-1 rounded-xl border border-brand-rose/10">
                <AlertTriangle size={12} />
                <span>¡Se ha superado el presupuesto configurado de este mes! (+{(totalSuper - limit).toFixed(2)}€)</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* -----------------------------------------------------------------
          5. DESGLOSE DE GASTOS POR CATEGORÍAS EN MINI-BARRAS
          ----------------------------------------------------------------- */}
      <div className="mx-4 mt-5 glass-panel p-5 rounded-3xl border-lux-border/40">
        <h3 className="text-sm font-bold text-lux-text mb-4">Distribución de Gastos del Período</h3>
        
        {categories.length === 0 ? (
          <p className="text-xs text-lux-muted text-center py-4">No hay categorías configuradas para este hogar.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {categories.map((cat) => {
              const monthExps = currentPeriodData.expensesList || expenses;
              const catExpenses = monthExps.filter(
                (e: any) => e.category_id === cat.id || (cat.name === 'Cuotas' && e.category_id === 'installments-placeholder')
              );
              const catTotal = catExpenses.reduce((acc: number, e: any) => acc + Number(e.amount), 0);
              
              const totalExpenses = currentPeriodData.totalExpenses || 1;
              const percent = Math.min((catTotal / totalExpenses) * 100, 100);

              if (catTotal === 0) return null;

              return (
                <div key={cat.id} className="flex flex-col gap-1 animate-fade-in">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-lux-muted">{cat.name}</span>
                    <span className="font-bold text-lux-text">{catTotal.toFixed(2)}€</span>
                  </div>
                  <div className="w-full h-1.5 bg-lux-border/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${percent}%`,
                        backgroundColor: cat.color || '#3B82F6'
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {currentPeriodData.totalExpenses === 0 && (
              <p className="text-xs text-lux-muted text-center py-4">No has registrado gastos en este período.</p>
            )}
          </div>
        )}
      </div>

      {/* -----------------------------------------------------------------
          6. CONTROLES DE ADMINISTRADOR (CERRAR / ABRIR MES)
          ----------------------------------------------------------------- */}
      {activeMonthRecord && (
        <div className="mx-4 mt-5 flex justify-end">
          {activeMonthRecord.status !== 'closed' ? (
            <button
              onClick={() => closeMonth(activeMonthRecord.id)}
              className="text-xs font-semibold px-4 py-2 border border-brand-rose/30 bg-brand-rose/10 hover:bg-brand-rose/15 text-brand-rose rounded-2xl transition-colors"
            >
              Cerrar Período Financiero
            </button>
          ) : (
            userRole === 'admin' && (
              <button
                onClick={() => reopenMonth(activeMonthRecord.id)}
                className="text-xs font-semibold px-4 py-2 border border-brand-emerald/30 bg-brand-emerald/10 hover:bg-brand-emerald/15 text-brand-emerald rounded-2xl transition-colors"
              >
                Reabrir Período Financiero
              </button>
            )
          )}
        </div>
      )}

      {/* -----------------------------------------------------------------
          7. BOTÓN FLOTANTE RÁPIDO "+" DE ACCIÓN MULTI-PANELES (TÁCTIL Y DESKTOP)
          ----------------------------------------------------------------- */}
      {activeMonthRecord?.status !== 'closed' && (
        <div className="fixed bottom-24 right-4 z-30 flex flex-col items-end gap-2">
          {/* Menú de accesos desplegables */}
          {menuOpen && (
            <div className="flex flex-col gap-2 origin-bottom transition-all duration-200 mb-2 animate-fade-in">
              <button 
                onClick={() => { setPanelOpen('income'); setMenuOpen(false); }}
                className="flex items-center gap-2 bg-slate-900 border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <ArrowUpRight size={14} />
                <span>Nuevo Ingreso</span>
              </button>
              
              <button 
                onClick={() => { setPanelOpen('expense'); setMenuOpen(false); }}
                className="flex items-center gap-2 bg-slate-900 border border-red-500/30 hover:border-red-500 text-red-400 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <ArrowDownRight size={14} />
                <span>Nuevo Gasto</span>
              </button>

              <button 
                onClick={() => { setPanelOpen('installment'); setMenuOpen(false); }}
                className="flex items-center gap-2 bg-slate-900 border border-indigo-500/30 hover:border-indigo-500 text-indigo-400 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <CreditCard size={14} />
                <span>Nueva Cuota / Préstamo</span>
              </button>

              <button 
                onClick={() => { setPanelOpen('unplanned'); setMenuOpen(false); }}
                className="flex items-center gap-2 bg-slate-900 border border-yellow-500/30 hover:border-yellow-500 text-yellow-400 text-xs font-bold px-3.5 py-2.5 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                <PiggyBank size={14} />
                <span>Gasto Imprevisto (Ahorro)</span>
              </button>
            </div>
          )}

          {/* Botón principal */}
          <button 
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-14 h-14 bg-gradient-to-r from-lux-accent to-brand-indigo text-white rounded-full flex items-center justify-center shadow-lg shadow-lux-accent/30 hover:shadow-lux-accent/50 hover:scale-105 transition-all duration-300 active:scale-95 cursor-pointer z-40"
          >
            <Plus size={28} className={`transition-transform duration-300 ${menuOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>
      )}

      {/* -----------------------------------------------------------------
          8. PANELES FLOTANTES (BOTTOM SHEETS DESLIZANTES COMPONENTES)
          ----------------------------------------------------------------- */}

      {/* PANEL 1: REGISTRAR INGRESO */}
      <Panel 
        isOpen={panelOpen === 'income'} 
        onClose={resetForm}
        title={activeMonthRecord?.status === 'planning' ? 'Planificar Ingreso Futuro' : 'Registrar Ingreso'}
      >
        <form onSubmit={handleAddIncome} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción</label>
            <input
              type="text"
              required
              placeholder="Ej: Sueldo de Junio, Freelance"
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
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha de Acreditación</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <ChipsSelector
            label="Cuenta de Destino"
            options={accountOptions}
            selectedValue={account}
            onChange={setAccount}
          />

          <ChipsSelector
            label="Categoría"
            options={[
              { value: 'Sueldo', label: 'Sueldo' },
              { value: 'Freelance', label: 'Freelance' },
              { value: 'Bono', label: 'Bono' },
              { value: 'Otros', label: 'Otros' }
            ]}
            selectedValue={category}
            onChange={setCategory}
          />

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-emerald to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
          >
            Guardar Ingreso
          </button>
        </form>
      </Panel>

      {/* PANEL 2: REGISTRAR GASTO */}
      <Panel 
        isOpen={panelOpen === 'expense'} 
        onClose={resetForm}
        title={activeMonthRecord?.status === 'planning' ? 'Planificar Gasto Futuro' : 'Registrar Gasto'}
      >
        <form onSubmit={handleAddExpense} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción</label>
            <input
              type="text"
              required
              placeholder="Ej: Luz de Junio, Supermercado"
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
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha de Débito</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <ChipsSelector
            label="Responsable (Titular)"
            options={holderOptions}
            selectedValue={holder}
            onChange={setHolder}
          />

          <ChipsSelector
            label="Cuenta de Débito"
            options={accountOptions}
            selectedValue={account}
            onChange={setAccount}
          />

          <ChipsSelector
            label="Categoría del Gasto"
            options={categories
              // Excluimos cuotas de las categorías seleccionables para evitar confusiones
              .filter((c) => c.name.toLowerCase() !== 'cuotas' && c.name.toLowerCase() !== 'gastos no planificados')
              .map((c) => ({ value: c.id, label: c.name }))}
            selectedValue={category}
            onChange={setCategory}
          />

          <label className="flex items-center gap-3 bg-lux-bg/40 border border-lux-border/50 p-4 rounded-2xl cursor-pointer hover:border-lux-accent/60 transition-colors my-1">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
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
              placeholder="Detalles del gasto"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text resize-none"
            />
          </div>

          {/* Si el mes está cerrado, forzar nota de ajuste */}
          {activeMonthRecord?.status === 'closed' && (
            <div className="flex flex-col gap-1.5 border border-brand-rose/20 p-3 rounded-2xl bg-brand-rose/5">
              <label className="text-xs font-extrabold text-brand-rose uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={12} />
                <span>Nota de Ajuste Obligatoria</span>
              </label>
              <textarea
                required
                placeholder="Explica la razón extraordinaria de esta edición..."
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
            Guardar Gasto
          </button>
        </form>
      </Panel>

      {/* PANEL 3: NUEVA CUOTA / PRÉSTAMO */}
      <Panel 
        isOpen={panelOpen === 'installment'} 
        onClose={resetForm}
        title="Nueva Cuota / Préstamo"
      >
        <form onSubmit={handleAddInstallment} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción (Concepto o Préstamo)</label>
            <input
              type="text"
              required
              placeholder="Ej: Aspiradora Robot, Heladera"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Importe Total (€)</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={totalAmount}
                onChange={(e) => handleTotalAmountChange(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Nro de Cuotas</label>
              <input
                type="number"
                min="1"
                required
                placeholder="Ej: 12, 60, 120, 360"
                value={numInstallments}
                onChange={(e) => handleNumInstallmentsChange(e.target.value)}
                className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Importe por Cuota (€)</label>
            <input
              type="number"
              step="0.01"
              required
              placeholder="0.00"
              value={installmentAmount}
              onChange={(e) => setInstallmentAmount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
            <p className="text-[10px] text-lux-muted">Calculado automáticamente. Puedes corregirlo por redondeos.</p>
          </div>

          <ChipsSelector
            label="Tipo de Pago"
            options={[
              { value: 'credit_card', label: 'Tarjeta de Crédito', icon: <CreditCard size={14} /> },
              { value: 'debit', label: 'Débito en Cuenta', icon: <Landmark size={14} /> }
            ]}
            selectedValue={paymentType}
            onChange={setPaymentType}
          />

          <ChipsSelector
            label="Tarjeta / Cuenta de Débito"
            options={accountOptions}
            selectedValue={account}
            onChange={setAccount}
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Mes Primer Débito</label>
              <select
                value={firstMonth}
                onChange={(e) => setFirstMonth(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>{getPeriodLabel(2026, m).split(' ')[0]}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Año Primer Débito</label>
              <select
                value={firstYear}
                onChange={(e) => setFirstYear(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                {[2025, 2026, 2027, 2028].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Notas Opcionales</label>
            <textarea
              placeholder="Ej: Cuotas 0% interés, regalo..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-indigo to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
          >
            Generar Proyección de Cuotas
          </button>
        </form>
      </Panel>

      {/* PANEL 4: REGISTRAR GASTO IMPREVISTO EXTRAORDINARIO */}
      <Panel 
        isOpen={panelOpen === 'unplanned'} 
        onClose={resetForm}
        title="Gasto Imprevisto (Afecta Ahorros)"
      >
        <form onSubmit={handleAddUnplanned} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción del Gasto</label>
            <input
              type="text"
              required
              placeholder="Ej: Arreglo auto, Urgencia odontólogo"
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
              placeholder="0.00"
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

          <ChipsSelector
            label="Responsable (Titular)"
            options={holderOptions}
            selectedValue={holder}
            onChange={setHolder}
          />

          <ChipsSelector
            label="Cuenta de Pago"
            options={accountOptions}
            selectedValue={account}
            onChange={setAccount}
          />

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
          >
            Registrar Imprevisto
          </button>
        </form>
      </Panel>
    </div>
  );
};
