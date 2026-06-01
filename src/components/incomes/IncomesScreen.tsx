import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getPeriodLabel, toISODateString } from '../../utils/dateUtils';
import { Trash2, Edit3, ArrowUpRight, Coins, Landmark, Calendar, User, Plus } from 'lucide-react';
import { Panel } from '../ui/Panel';

export const IncomesScreen: React.FC = () => {
  const { 
    incomes, deleteIncome, updateIncome, addIncome, activeMonthRecord, selectedPeriod, showToast, activeHousehold
  } = useApp();

  // Cargar cuentas dinámicas del hogar con fallbacks seguros
  const currentAccounts: any[] = activeHousehold?.accounts || [
    { id: '1', name: activeHousehold?.account_1_name || 'Cuenta Titular 1', type: 'bank_account', holder: activeHousehold?.holder_1_name || 'Titular 1' },
    { id: '2', name: activeHousehold?.account_2_name || 'Cuenta Titular 2', type: 'bank_account', holder: activeHousehold?.holder_2_name || 'Titular 2' },
    { id: '3', name: activeHousehold?.account_joint_name || 'Cuenta conjunta', type: 'bank_account', holder: 'Compartido' }
  ];

  // Estados para Registro Directo (Añadir)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [addDesc, setAddDesc] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDate, setAddDate] = useState(toISODateString(new Date()));
  const [addAccount, setAddAccount] = useState(currentAccounts[0]?.name || 'Cuenta conjunta');
  const [addCategory, setAddCategory] = useState('');

  // Sincronizar cuenta por defecto al cambiar el hogar activo
  useEffect(() => {
    if (currentAccounts.length > 0) {
      setAddAccount(currentAccounts[0].name);
    }
  }, [activeHousehold]);

  // Estados para edición
  const [editingIncome, setEditingIncome] = useState<any | null>(null);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [account, setAccount] = useState('Cuenta conjunta');
  const [category, setCategory] = useState('');

  const handleEditClick = (inc: any) => {
    setEditingIncome(inc);
    setDesc(inc.description);
    setAmount(String(inc.amount));
    setDate(inc.date);
    setAccount(inc.account);
    setCategory(inc.category || '');
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDesc || !addAmount) {
      showToast('Por favor, ingresa descripción e importe', 'error');
      return;
    }
    try {
      await addIncome({
        description: addDesc,
        amount: parseFloat(addAmount),
        date: addDate,
        account: addAccount,
        category: (addCategory as any) || null,
        is_estimated: activeMonthRecord?.status === 'planning'
      });
      // Resetear formulario
      setAddDesc('');
      setAddAmount('');
      setAddDate(toISODateString(new Date()));
      setAddCategory('');
      setIsAddPanelOpen(false);
    } catch (e) {}
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount) {
      showToast('Completa todos los campos obligatorios', 'error');
      return;
    }
    try {
      await updateIncome(editingIncome.id, {
        description: desc,
        amount: parseFloat(amount),
        date,
        account,
        category: (category as any) || null
      });
      setEditingIncome(null);
    } catch (e) {}
  };

  const totalIncomes = incomes.reduce((acc, i) => acc + Number(i.amount), 0);

  return (
    <div className="px-4 py-5 pb-24 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-extrabold font-sans text-gradient-emerald">Ingresos del Período</h2>
          <p className="text-xs text-lux-muted mt-0.5">{getPeriodLabel(selectedPeriod.year, selectedPeriod.month)}</p>
        </div>
        
        <div className="flex items-center gap-2">
          {activeMonthRecord?.status !== 'closed' && (
            <button
              onClick={() => setIsAddPanelOpen(true)}
              className="bg-brand-emerald text-white px-3.5 py-2.5 rounded-2xl text-xs font-bold shadow-lg hover:shadow-brand-emerald/20 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Registrar Ingreso</span>
            </button>
          )}

          <div className="bg-brand-emerald/10 border border-brand-emerald/20 px-4 py-2.5 rounded-2xl flex items-center gap-2">
            <ArrowUpRight size={18} className="text-brand-emerald" />
            <span className="text-sm font-extrabold text-brand-emerald">
              {totalIncomes.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
            </span>
          </div>
        </div>
      </div>

      {incomes.length === 0 ? (
        <div className="glass-panel p-10 rounded-3xl border-lux-border/40 text-center flex flex-col items-center justify-center">
          <Coins size={36} className="text-lux-muted mb-3" />
          <p className="text-sm font-bold text-lux-text">Sin ingresos registrados</p>
          <p className="text-xs text-lux-muted mt-1 max-w-xs mb-4">
            {activeMonthRecord?.status === 'planning'
              ? 'Puedes precargar ingresos esperados para planificar este mes.'
              : 'Agrega tus ingresos mensuales (sueldos, freelance, etc.) para iniciar el cálculo.'}
          </p>
          {activeMonthRecord?.status !== 'closed' && (
            <button
              onClick={() => setIsAddPanelOpen(true)}
              className="bg-gradient-to-r from-brand-emerald to-emerald-600 text-white font-bold px-5 py-2.5 rounded-2xl shadow-lg hover:shadow-brand-emerald/20 transition-transform active:scale-95 text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>Agregar Primer Ingreso</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {incomes.map((inc) => (
            <div 
              key={inc.id} 
              className={`glass-panel p-4.5 rounded-3xl border-lux-border/30 hover:border-lux-border/60 transition-all flex justify-between items-center relative overflow-hidden ${
                inc.is_estimated ? 'planning-pattern border-brand-indigo/30' : ''
              }`}
            >
              {inc.is_estimated && (
                <div className="absolute top-0 left-0 bg-brand-indigo text-white text-[8px] font-extrabold px-2 py-0.5 rounded-br-xl uppercase tracking-wider scale-95">
                  Estimado
                </div>
              )}
              
              <div className="flex flex-col gap-1 pr-4">
                <span className="text-sm font-bold text-lux-text">{inc.description}</span>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-lux-muted font-semibold mt-1">
                  <span className="flex items-center gap-1">
                    <Landmark size={12} className="text-lux-accent" />
                    {inc.account}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {inc.date}
                  </span>
                  {inc.category && (
                    <span className="px-2 py-0.5 rounded-lg bg-lux-panel border border-lux-border/50 text-[10px] text-lux-text">
                      {inc.category}
                    </span>
                  )}
                  {inc.profiles && (
                    <span className="flex items-center gap-1 text-[10px] text-lux-muted italic font-normal">
                      <User size={10} />
                      Agregado por {inc.profiles.display_name}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-extrabold text-brand-emerald">
                  +{Number(inc.amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </span>
                
                {activeMonthRecord?.status !== 'closed' && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditClick(inc)}
                      className="p-2 rounded-full hover:bg-lux-border/50 text-lux-muted hover:text-lux-text transition-colors"
                      title="Editar"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => deleteIncome(inc.id)}
                      className="p-2 rounded-full hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PANEL DE NUEVO INGRESO */}
      <Panel
        isOpen={isAddPanelOpen}
        onClose={() => setIsAddPanelOpen(false)}
        title={activeMonthRecord?.status === 'planning' ? 'Planificar Ingreso Futuro' : 'Registrar Ingreso'}
      >
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Descripción</label>
            <input
              type="text"
              required
              placeholder="Ej: Sueldo, Freelance, Bono"
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
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Fecha de Acreditación</label>
            <input
              type="date"
              required
              value={addDate}
              onChange={(e) => setAddDate(e.target.value)}
              className="w-full bg-lux-bg/60 border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Cuenta de Destino</label>
            <select
              value={addAccount}
              onChange={(e) => setAddAccount(e.target.value)}
              className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            >
              {currentAccounts.map((acc) => (
                <option key={acc.id} value={acc.name}>
                  {acc.name} ({acc.holder})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Categoría</label>
            <select
              value={addCategory}
              onChange={(e) => setAddCategory(e.target.value)}
              className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
            >
              <option value="">Ninguna</option>
              <option value="Sueldo">Sueldo</option>
              <option value="Freelance">Freelance</option>
              <option value="Bono">Bono</option>
              <option value="Otros">Otros</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-brand-emerald to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
          >
            Guardar Ingreso
          </button>
        </form>
      </Panel>

      {/* PANEL DE EDICIÓN DE INGRESO */}
      <Panel 
        isOpen={editingIncome !== null} 
        onClose={() => setEditingIncome(null)}
        title="Editar Ingreso"
      >
        {editingIncome && (
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
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Cuenta de Destino</label>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                {currentAccounts.map((acc) => (
                  <option key={acc.id} value={acc.name}>
                    {acc.name} ({acc.holder})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-lux-muted uppercase tracking-wider">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-lux-bg border border-lux-border/60 focus:border-lux-accent rounded-2xl px-4 py-3 text-sm text-lux-text"
              >
                <option value="">Ninguna</option>
                <option value="Sueldo">Sueldo</option>
                <option value="Freelance">Freelance</option>
                <option value="Bono">Bono</option>
                <option value="Otros">Otros</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-brand-emerald to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold py-3.5 rounded-2xl shadow-lg transition-all active:scale-[0.98] mt-3"
            >
              Guardar Cambios
            </button>
          </form>
        )}
      </Panel>
    </div>
  );
};
