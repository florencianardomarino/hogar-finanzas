import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel, arePeriodsEqual, toISODateString, formatCompactDate } from '../../utils/dateUtils';
import { calculateEncainedFinances } from '../../utils/financeUtils';
import { UnplannedExpense } from '../../types';
import { Panel } from '../ui/Panel';
import { ChipsSelector } from '../ui/ChipsSelector';
import { 
  PiggyBank, Sparkles, TrendingUp, ShieldAlert, Plus, Edit3, Trash2, Calendar, Landmark, User, AlertTriangle 
} from 'lucide-react';

interface SavingsScreenProps {
  onNavigate?: (tab: 'dashboard' | 'incomes' | 'expenses' | 'installments' | 'savings' | 'summary' | 'settings') => void;
}

export const SavingsScreen: React.FC<SavingsScreenProps> = ({ onNavigate }) => {
  const { 
    monthsData, 
    allIncomes, 
    allExpenses, 
    unplannedExpenses, 
    installments, 
    savingsConfig, 
    currentPeriod, 
    activeHousehold, 
    setSelectedPeriod,
    selectedPeriod,
    addUnplannedExpense,
    deleteUnplannedExpense,
    updateUnplannedExpense
  } = useApp();

  // Estados para formularios y paneles
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<UnplannedExpense | null>(null);

  // Campos de formulario
  const [formDesc, setFormDesc] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(toISODateString(new Date()));
  const [formHolder, setFormHolder] = useState('Compartido');
  const [formAccount, setFormAccount] = useState('Cuenta conjunta');

  // Calcular la cascada financiera
  const calculatedMonths = calculateEncainedFinances(
    monthsData, allIncomes, allExpenses, unplannedExpenses, installments, savingsConfig, activeHousehold?.billing_cycle_start_day || 10
  );

  // Cargar titulares y cuentas dinámicas del hogar
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

  // Opciones de responsable para ChipsSelector
  const holderOptions = currentHolders.map((h, index) => {
    const colors = [
      'border-purple-500/30 text-purple-400 bg-purple-500/10 active:bg-purple-500/20',
      'border-orange-500/30 text-orange-400 bg-orange-500/10 active:bg-orange-500/20',
      'border-blue-500/30 text-blue-400 bg-blue-500/10 active:bg-blue-500/20',
      'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 active:bg-emerald-500/20',
      'border-pink-500/30 text-pink-400 bg-pink-500/10 active:bg-pink-500/20'
    ];
    return {
      value: h,
      label: h,
      className: colors[index % colors.length]
    };
  });

  // Encontrar el saldo actual real al mes de hoy
  const currentMonthData = calculatedMonths.find(
    (c) => c.year === currentPeriod.year && c.month === currentPeriod.month
  );
  const totalRealSavings = currentMonthData ? currentMonthData.finalBalance : (savingsConfig?.initial_balance || 0);

  // Mostrar únicamente el mes en curso en la sección de progreso real
  const realMonths = calculatedMonths.filter(
    (c) => c.year === currentPeriod.year && c.month === currentPeriod.month
  );

  const projectedMonths = calculatedMonths.filter(
    (c) => c.year > currentPeriod.year || (c.year === currentPeriod.year && c.month > currentPeriod.month)
  );

  // Clic en bloque mensual selecciona el período en el contexto
  const handleMonthClick = (year: number, month: number) => {
    setSelectedPeriod({ year, month });
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDesc || !formAmount) return;

    try {
      await addUnplannedExpense({
        description: formDesc,
        amount: parseFloat(formAmount),
        date: formDate,
        account: formAccount,
        holder: formHolder,
        category: null
      });
      setIsAddOpen(false);
      setFormDesc('');
      setFormAmount('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditClick = (exp: UnplannedExpense) => {
    setEditingExpense(exp);
    setFormDesc(exp.description);
    setFormAmount(String(exp.amount));
    setFormDate(exp.date);
    setFormHolder(exp.holder);
    setFormAccount(exp.account);
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || !formDesc || !formAmount) return;

    try {
      await updateUnplannedExpense(editingExpense.id, {
        description: formDesc,
        amount: parseFloat(formAmount),
        date: formDate,
        account: formAccount,
        holder: formHolder
      });
      setIsEditOpen(false);
      setEditingExpense(null);
      setFormDesc('');
      setFormAmount('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteClick = async (exp: UnplannedExpense) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar el gasto extra "${exp.description}"?`)) {
      await deleteUnplannedExpense(exp.id);
    }
  };

  // Renderizar un bloque mensual de 4 filas
  const renderMonthBlock = (mData: any, isProjected: boolean) => {
    const isSelected = selectedPeriod && selectedPeriod.year === mData.year && selectedPeriod.month === mData.month;

    return (
      <div 
        key={mData.monthId}
        onClick={() => handleMonthClick(mData.year, mData.month)}
        className={`glass-panel p-5 rounded-3xl border flex flex-col gap-3.5 relative overflow-hidden transition-all duration-300 hover:border-lux-border cursor-pointer active:scale-[0.99] hover:bg-lux-panel/30 ${
          isSelected
            ? 'border-lux-accent bg-lux-accent/5 ring-1 ring-lux-accent shadow-lux-accent/5'
            : isProjected 
              ? 'planning-pattern border-brand-indigo/30 shadow-indigo-950/5' 
              : 'border-lux-border/30 hover:shadow-lg shadow-black/10'
        }`}
      >
        {isProjected && (
          <div className="absolute top-0 right-0 bg-brand-indigo/20 border-b border-l border-brand-indigo/30 text-brand-indigo text-[8px] font-extrabold px-3 py-1 rounded-bl-2xl uppercase tracking-wider animate-pulse">
            Proyectado
          </div>
        )}

        {/* Encabezado del Mes */}
        <div className="flex justify-between items-center pb-2 border-b border-lux-border/10">
          <span className="text-sm font-extrabold text-lux-text">
            {getPeriodLabel(mData.year, mData.month)}
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
            mData.status === 'closed' 
              ? 'bg-brand-rose/10 text-brand-rose border border-brand-rose/20' 
              : isProjected 
                ? 'bg-brand-indigo/10 text-brand-indigo border border-brand-indigo/20' 
                : 'bg-brand-emerald/10 text-brand-emerald border border-brand-emerald/20'
          }`}>
            {mData.status === 'closed' ? 'Cerrado' : isProjected ? 'Planificación' : 'Abierto'}
          </span>
        </div>

        {/* Estructura de 4 filas de cálculo */}
        <div className="flex flex-col gap-2.5 text-xs">
          {/* Fila 1: Saldo del mes anterior */}
          <div className="flex justify-between items-center text-lux-muted font-semibold">
            <span>Saldo mes anterior</span>
            <span>{Number(mData.previousBalance).toFixed(2)}€</span>
          </div>

          {/* Fila 2: Ahorro del mes en curso */}
          <div className="flex justify-between items-center font-bold">
            <span className="text-lux-muted">Ahorro del mes</span>
            <span className={mData.saving >= 0 ? 'text-brand-emerald' : 'text-brand-rose'}>
              {mData.saving >= 0 ? '+' : ''}{Number(mData.saving).toFixed(2)}€
            </span>
          </div>

          {/* Fila 3: Gastos extraordinarios */}
          <div className="flex justify-between items-center font-bold">
            <span className="text-lux-muted">Gastos extras (Ahorros)</span>
            <span className="text-brand-rose">
              -{Number(mData.totalUnplanned).toFixed(2)}€
            </span>
          </div>

          {/* Fila 4: Total final */}
          <div className="flex justify-between items-center pt-2.5 border-t border-lux-border/20 text-sm font-extrabold text-lux-text">
            <span className="flex items-center gap-1">
              <PiggyBank size={14} className="text-lux-accent" />
              Total acumulado
            </span>
            <span className="text-gradient-sky">
              {Number(mData.finalBalance).toFixed(2)}€
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="px-4 py-5 safe-bottom-padding animate-fade-in">
      {/* 1. SECTOR DESTACADO INICIAL */}
      <div className="glass-panel p-6 rounded-3xl premium-card flex flex-col items-center justify-center text-center mb-8 relative overflow-hidden">
        <div className="w-14 h-14 bg-gradient-to-tr from-brand-emerald to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-emerald/20 mb-4 animate-bounce-slow">
          <PiggyBank size={28} className="text-white" />
        </div>
        <h2 className="text-xs font-bold text-lux-muted uppercase tracking-widest">Fondo de Ahorro Real</h2>
        <span className="text-3xl lg:text-4xl font-extrabold font-sans text-gradient-emerald mt-2">
          {Number(totalRealSavings).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
        </span>
        <p className="text-[10px] text-lux-muted mt-2 font-medium max-w-xs">
          Suma acumulada histórica desde el saldo inicial de partida ({Number(savingsConfig?.initial_balance || 0).toFixed(0)}€) hasta el mes de hoy.
        </p>
      </div>

      {/* 2. TABLA ENCADENADA MES A MES (DOS COLUMNAS EN DESKTOP) */}
      <div className="flex flex-col gap-6">
        {/* MESES REALES */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Progreso Real Cerrado / Abierto</h3>
          
          {realMonths.length === 0 ? (
            <p className="text-xs text-lux-muted text-center py-4">No hay datos históricos registrados.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {realMonths.map((m) => renderMonthBlock(m, false))}
            </div>
          )}
        </div>

        {/* LÍNEA DIVISORIA DE PROYECCIÓN */}
        {projectedMonths.length > 0 && (
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t-2 border-dashed border-brand-indigo/30"></div>
            </div>
            <span className="relative px-4 py-1 rounded-full text-[9px] font-extrabold bg-lux-bg border border-brand-indigo/40 text-brand-indigo uppercase tracking-wider flex items-center gap-1 shadow-md">
              <TrendingUp size={10} />
              Línea de Proyección (6 Meses Futuros)
            </span>
          </div>
        )}

        {/* MESES PROYECTADOS FUTUROS */}
        {projectedMonths.length > 0 && (
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider px-1">Proyección de Ahorro Futuro</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projectedMonths.map((m) => renderMonthBlock(m, true))}
            </div>
            <p className="text-[10px] text-lux-muted italic text-center mt-2 px-4">
              * Nota: Las proyecciones futuras no modifican tu balance de ahorro real acumulado hasta que esos meses transcurran y sus balances sean consolidados.
            </p>
          </div>
        )}
      </div>

      {/* 3. SECCIÓN DE GASTOS EXTRAORDINARIOS */}
      {selectedPeriod && (
        <div className="mt-8 border-t border-lux-border/20 pt-8 flex flex-col gap-5">
          <div className="flex justify-between items-center px-1">
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider">
                Gastos Extras (Fondo de Ahorro)
              </h3>
              <span className="text-xs font-extrabold text-lux-text">
                Período: {getPeriodLabel(selectedPeriod.year, selectedPeriod.month)}
              </span>
            </div>
            {monthsData.find(m => m.year === selectedPeriod.year && m.month === selectedPeriod.month)?.status !== 'closed' && (
              <button
                onClick={() => {
                  setFormDesc('');
                  setFormAmount('');
                  setFormDate(toISODateString(new Date()));
                  setFormHolder(currentHolders[0] || 'Compartido');
                  setFormAccount(currentAccounts[0]?.name || 'Cuenta conjunta');
                  setIsAddOpen(true);
                }}
                className="bg-lux-panel border border-lux-border/60 hover:border-lux-border text-lux-text font-bold px-3 py-2 rounded-2xl transition-all hover:bg-lux-panel/60 text-[11px] flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={12} />
                <span>Registrar Gasto Extra</span>
              </button>
            )}
          </div>

          {/* Listado de Gastos Extraordinarios */}
          {unplannedExpenses.length === 0 ? (
            <div className="glass-panel p-8 rounded-3xl border border-lux-border/20 text-center flex flex-col items-center justify-center">
              <ShieldAlert size={28} className="text-lux-muted mb-2 opacity-60" />
              <p className="text-xs font-bold text-lux-text">Sin gastos extraordinarios registrados</p>
              <p className="text-[10px] text-lux-muted mt-1 max-w-xs">
                Los gastos imprevistos de este período que se pagan con ahorros aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {unplannedExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="glass-panel p-4 rounded-2xl border border-lux-border/20 hover:border-lux-border/40 transition-all flex justify-between items-center relative overflow-hidden"
                >
                  <div className="flex items-center gap-3 pr-3 min-w-0">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-bold text-lux-text truncate">{exp.description}</span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-lux-muted font-semibold mt-1">
                        <span className="flex items-center gap-0.5 text-lux-accent">
                          <Landmark size={10} />
                          {exp.account}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <User size={10} />
                          {exp.holder}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Calendar size={10} />
                          {formatCompactDate(exp.date)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-xs font-extrabold text-brand-rose">
                      -{Number(exp.amount).toFixed(2)}€
                    </span>
                    {monthsData.find(m => m.year === selectedPeriod.year && m.month === selectedPeriod.month)?.status !== 'closed' && (
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => handleEditClick(exp)}
                          className="p-2 rounded-full hover:bg-lux-border/50 text-lux-muted hover:text-lux-text transition-colors cursor-pointer"
                          title="Editar"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(exp)}
                          className="p-2 rounded-full hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 transition-colors cursor-pointer"
                          title="Eliminar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PANEL REGISTRAR GASTO EXTRAORDINARIO */}
      <Panel 
        isOpen={isAddOpen} 
        onClose={() => setIsAddOpen(false)}
        title="Gasto Extraordinario"
      >
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción del Gasto</label>
            <input
              type="text"
              required
              placeholder="Ej: Reparación caldera, Compra colchón"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
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
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha</label>
            <input
              type="date"
              required
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <ChipsSelector
            label="Responsable (Titular)"
            options={holderOptions}
            selectedValue={formHolder}
            onChange={setFormHolder}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Cuenta de Pago</label>
            <select
              value={formAccount}
              onChange={(e) => setFormAccount(e.target.value)}
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

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-rose to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg hover:shadow-brand-rose/25 transition-transform active:scale-[0.98] mt-2 cursor-pointer"
          >
            Registrar Gasto Extra
          </button>
        </form>
      </Panel>

      {/* PANEL EDITAR GASTO EXTRAORDINARIO */}
      <Panel 
        isOpen={isEditOpen} 
        onClose={() => setIsEditOpen(false)}
        title="Editar Gasto Extra"
      >
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción del Gasto</label>
            <input
              type="text"
              required
              placeholder="Ej: Reparación caldera"
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
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
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha</label>
            <input
              type="date"
              required
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <ChipsSelector
            label="Responsable (Titular)"
            options={holderOptions}
            selectedValue={formHolder}
            onChange={setFormHolder}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Cuenta de Pago</label>
            <select
              value={formAccount}
              onChange={(e) => setFormAccount(e.target.value)}
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

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-rose to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-bold py-3.5 rounded-2xl shadow-lg hover:shadow-brand-rose/25 transition-transform active:scale-[0.98] mt-2 cursor-pointer"
          >
            Guardar Cambios
          </button>
        </form>
      </Panel>
    </div>
  );
};
