import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { 
  Settings, Users, Copy, Trash2, Plus, Edit3, 
  PiggyBank, Moon, Sun, CreditCard, Landmark, Coins, Wallet
} from 'lucide-react';

export const SettingsScreen: React.FC = () => {
  const {
    activeHousehold, userRole, updateHouseholdSettings, savingsConfig, 
    updateSavingsConfig, categories, refreshCategories, theme, toggleTheme, showToast, user
  } = useApp();

  const isAdmin = userRole === 'admin';

  // -------------------------------------------------------------------
  // CONFIGURACIÓN DEL HOGAR (ESTADOS BÁSICOS)
  // -------------------------------------------------------------------
  const [householdName, setHouseholdName] = useState(activeHousehold?.name || '');
  const [billingDay, setBillingDay] = useState(activeHousehold?.billing_cycle_start_day || 10);
  
  // Estado de Ahorros Iniciales
  const [initialBalance, setInitialBalance] = useState(String(savingsConfig?.initial_balance || '0'));

  // Estado de Miembros del Hogar
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Estado para gestión de Categorías
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#3B82F6');
  const [newCatBudget, setNewCatBudget] = useState('');

  // -------------------------------------------------------------------
  // TITULARES Y CUENTAS DINÁMICAS (ESTADOS Y FALLBACKS)
  // -------------------------------------------------------------------
  // Cargar titulares con fallbacks retrocompatibles
  const currentHolders: string[] = activeHousehold?.holders || [
    activeHousehold?.holder_1_name || 'Titular 1',
    activeHousehold?.holder_2_name || 'Titular 2',
    'Compartido'
  ];

  // Cargar cuentas/tarjetas de pago con fallbacks retrocompatibles
  const currentAccounts: any[] = activeHousehold?.accounts || [
    { id: '1', name: activeHousehold?.account_1_name || 'Cuenta Titular 1', type: 'bank_account', holder: activeHousehold?.holder_1_name || 'Titular 1' },
    { id: '2', name: activeHousehold?.account_2_name || 'Cuenta Titular 2', type: 'bank_account', holder: activeHousehold?.holder_2_name || 'Titular 2' },
    { id: '3', name: activeHousehold?.account_joint_name || 'Cuenta conjunta', type: 'bank_account', holder: 'Compartido' }
  ];

  // Estados locales para formularios dinámicos
  const [newHolderName, setNewHolderName] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<'bank_account' | 'credit_card' | 'debit_card' | 'cash' | 'other'>('bank_account');
  const [newAccountHolder, setNewAccountHolder] = useState(currentHolders[0] || 'Compartido');

  // Sincronizar titular por defecto al cambiar el hogar activo
  useEffect(() => {
    if (currentHolders.length > 0) {
      setNewAccountHolder(currentHolders[0]);
    }
  }, [activeHousehold]);

  // Sincronizar datos básicos del hogar
  useEffect(() => {
    if (activeHousehold) {
      setHouseholdName(activeHousehold.name);
      setBillingDay(activeHousehold.billing_cycle_start_day);
    }
  }, [activeHousehold]);

  useEffect(() => {
    if (savingsConfig) {
      setInitialBalance(String(savingsConfig.initial_balance));
    }
  }, [savingsConfig]);

  // -------------------------------------------------------------------
  // CARGA DE INTEGRANTES DEL HOGAR
  // -------------------------------------------------------------------
  const loadMembers = async () => {
    if (!activeHousehold) return;
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from('household_members')
        .select(`
          role,
          joined_at,
          user_id,
          profiles (
            display_name
          )
        `)
        .eq('household_id', activeHousehold.id);

      if (!error && data) {
        setMembers(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (activeHousehold) {
      loadMembers();
    }
  }, [activeHousehold]);

  // -------------------------------------------------------------------
  // GUARDAR CONFIGURACIONES DE ADMINISTRADOR (BÁSICAS)
  // -------------------------------------------------------------------
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') {
      showToast('Sólo el Administrador puede editar los ajustes principales del hogar', 'error');
      return;
    }
    try {
      await updateHouseholdSettings({
        name: householdName,
        billing_cycle_start_day: billingDay
      });
    } catch (e) {}
  };

  const handleSaveSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'admin') return;
    try {
      await updateSavingsConfig(parseFloat(initialBalance) || 0);
    } catch (e) {}
  };

  // -------------------------------------------------------------------
  // ACCIONES DINÁMICAS: GESTIÓN DE TITULARES
  // -------------------------------------------------------------------
  const handleAddHolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolderName.trim() || !activeHousehold) return;
    
    if (userRole !== 'admin') {
      showToast('Sólo el Administrador puede gestionar los titulares del hogar', 'error');
      return;
    }

    const name = newHolderName.trim();
    if (currentHolders.some(h => h && typeof h === 'string' && h.toLowerCase() === name.toLowerCase())) {
      showToast('Este titular ya existe en el hogar', 'error');
      return;
    }

    const updatedHolders = [...currentHolders, name];
    try {
      await updateHouseholdSettings({
        holders: updatedHolders,
        holder_1_name: updatedHolders[0] || 'Titular 1',
        holder_2_name: updatedHolders[1] || 'Titular 2'
      });
      setNewHolderName('');
      showToast(`Titular "${name}" agregado con éxito`, 'success');
    } catch (err) {}
  };

  const handleDeleteHolder = async (name: string) => {
    if (userRole !== 'admin') {
      showToast('Sólo el Administrador puede eliminar titulares del hogar', 'error');
      return;
    }

    if (currentHolders.length <= 1) {
      showToast('Debe haber al menos un titular activo en el hogar', 'error');
      return;
    }

    if (window.confirm(`¿Estás seguro de que deseas eliminar al titular "${name}"? También se eliminarán todas sus cuentas y tarjetas asociadas de forma permanente.`)) {
      const updatedHolders = currentHolders.filter((h) => h !== name);
      const updatedAccounts = currentAccounts.filter((acc) => acc.holder !== name);
      
      try {
        await updateHouseholdSettings({
          holders: updatedHolders,
          accounts: updatedAccounts,
          holder_1_name: updatedHolders[0] || 'Titular 1',
          holder_2_name: updatedHolders[1] || 'Titular 2',
          account_1_name: updatedAccounts[0]?.name || 'Cuenta Titular 1',
          account_2_name: updatedAccounts[1]?.name || 'Cuenta Titular 2',
          account_joint_name: updatedAccounts[2]?.name || 'Cuenta conjunta'
        });
        showToast(`Titular "${name}" eliminado`, 'info');
      } catch (err) {}
    }
  };

  // -------------------------------------------------------------------
  // ACCIONES DINÁMICAS: GESTIÓN DE CUENTAS / TARJETAS
  // -------------------------------------------------------------------
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim() || !activeHousehold) return;

    if (userRole !== 'admin') {
      showToast('Sólo el Administrador puede gestionar las cuentas del hogar', 'error');
      return;
    }

    const name = newAccountName.trim();
    if (currentAccounts.some((acc) => acc.name && typeof acc.name === 'string' && acc.name.toLowerCase() === name.toLowerCase() && acc.holder === newAccountHolder)) {
      showToast('Este titular ya tiene una cuenta o tarjeta registrada con ese nombre', 'error');
      return;
    }

    const newAcc = {
      id: 'acc-' + Math.random().toString(36).substring(2, 9),
      name,
      type: newAccountType,
      holder: newAccountHolder
    };

    const updatedAccounts = [...currentAccounts, newAcc];
    try {
      await updateHouseholdSettings({
        accounts: updatedAccounts,
        account_1_name: updatedAccounts[0]?.name || 'Cuenta Titular 1',
        account_2_name: updatedAccounts[1]?.name || 'Cuenta Titular 2',
        account_joint_name: updatedAccounts[2]?.name || 'Cuenta conjunta'
      });
      setNewAccountName('');
      showToast(`Cuenta/Tarjeta "${name}" agregada con éxito`, 'success');
    } catch (err) {}
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (userRole !== 'admin') {
      showToast('Sólo el Administrador puede eliminar cuentas o tarjetas', 'error');
      return;
    }

    if (currentAccounts.length <= 1) {
      showToast('Debe haber al menos una cuenta de pago activa en el hogar', 'error');
      return;
    }

    if (window.confirm(`¿Estás seguro de que deseas eliminar la cuenta/tarjeta "${name}"?`)) {
      const updatedAccounts = currentAccounts.filter((acc) => acc.id !== id);
      try {
        await updateHouseholdSettings({
          accounts: updatedAccounts,
          account_1_name: updatedAccounts[0]?.name || 'Cuenta Titular 1',
          account_2_name: updatedAccounts[1]?.name || 'Cuenta Titular 2',
          account_joint_name: updatedAccounts[2]?.name || 'Cuenta conjunta'
        });
        showToast(`Cuenta "${name}" eliminada`, 'info');
      } catch (err) {}
    }
  };

  // Icono para tipo de cuenta
  const getAccountIcon = (type: string) => {
    switch (type) {
      case 'bank_account':
        return <Landmark size={14} className="text-blue-400" />;
      case 'credit_card':
        return <CreditCard size={14} className="text-indigo-400" />;
      case 'debit_card':
        return <CreditCard size={14} className="text-emerald-400" />;
      case 'cash':
        return <Coins size={14} className="text-amber-400" />;
      default:
        return <Wallet size={14} className="text-lux-muted" />;
    }
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'bank_account': return 'Cuenta Bancaria';
      case 'credit_card': return 'Tarjeta de Crédito';
      case 'debit_card': return 'Tarjeta de Débito';
      case 'cash': return 'Efectivo';
      default: return 'Otro';
    }
  };

  // -------------------------------------------------------------------
  // CÓDIGO DE INVITACIÓN (COPIAR)
  // -------------------------------------------------------------------
  const copyInviteCode = () => {
    if (!activeHousehold) return;
    navigator.clipboard.writeText(activeHousehold.invite_code);
    showToast('Código de invitación copiado al portapapeles', 'success');
  };

  const handleRevokeMember = async (userId: string, displayName: string) => {
    if (userRole !== 'admin') return;
    if (userId === user.id) {
      showToast('No puedes expulsarte a ti mismo', 'error');
      return;
    }
    if (window.confirm(`¿Estás seguro de que deseas revocar el acceso a "${displayName}"? Perderá el acceso instantáneo a este hogar.`)) {
      try {
        const { error } = await supabase
          .from('household_members')
          .delete()
          .eq('household_id', activeHousehold?.id)
          .eq('user_id', userId);

        if (error) throw error;
        showToast(`Acceso revocado a ${displayName}`, 'info');
        loadMembers();
      } catch (e) {
        showToast('Error al expulsar integrante', 'error');
      }
    }
  };

  // -------------------------------------------------------------------
  // GESTIÓN DE CATEGORÍAS
  // -------------------------------------------------------------------
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName || !activeHousehold) return;
    try {
      const budget = newCatBudget ? parseFloat(newCatBudget) : null;
      const { error } = await supabase
        .from('expense_categories')
        .insert({
          household_id: activeHousehold.id,
          name: newCatName,
          color: newCatColor,
          icon: 'ShoppingBag',
          budget_limit: budget,
          sort_order: categories.length + 1
        });

      if (error) throw error;
      showToast('Categoría creada', 'success');
      setNewCatName('');
      setNewCatBudget('');
      refreshCategories();
    } catch (e) {
      showToast('Error al crear categoría (nombre duplicado)', 'error');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (name === 'Cuotas' || name === 'Gastos No Planificados' || name === 'Supermercado y Varios') {
      showToast('Esta categoría del sistema es crítica y no se puede eliminar', 'error');
      return;
    }
    if (window.confirm(`¿Estás seguro de que deseas eliminar la categoría "${name}"? Los gastos existentes en esta categoría causarán errores.`)) {
      try {
        const { error } = await supabase
          .from('expense_categories')
          .delete()
          .eq('id', id);

        if (error) throw error;
        showToast('Categoría eliminada', 'info');
        refreshCategories();
      } catch (e) {
        showToast('Error al eliminar categoría (contiene gastos asociados)', 'error');
      }
    }
  };

  const handleUpdateBudget = async (id: string, name: string, currentBudget: number | null) => {
    const input = window.prompt(`Configura el presupuesto mensual para "${name}" (€):`, String(currentBudget || ''));
    if (input === null) return;
    try {
      const newBudget = input.trim() === '' ? null : parseFloat(input);
      const { error } = await supabase
        .from('expense_categories')
        .update({ budget_limit: newBudget })
        .eq('id', id);

      if (error) throw error;
      showToast('Presupuesto actualizado correctamente', 'success');
      refreshCategories();
    } catch (e) {
      showToast('Error al actualizar presupuesto', 'error');
    }
  };

  return (
    <div className="px-4 py-5 pb-24 animate-fade-in flex flex-col gap-6">
      {/* Cabecera */}
      <div>
        <h2 className="text-xl font-extrabold font-sans text-gradient-sky">Ajustes</h2>
        <p className="text-xs text-lux-muted mt-0.5">Administra los parámetros de tu hogar, titulares, métodos de pago y miembros</p>
      </div>

      {/* 1. SECCIÓN TEMA (CLARO/OSCURO) - ACCESIBLE PARA TODOS */}
      <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex justify-between items-center">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-lux-text flex items-center gap-1.5">
            {theme === 'dark' ? <Moon size={16} className="text-lux-accent" /> : <Sun size={16} className="text-brand-amber" />}
            Modo de Visualización
          </span>
          <span className="text-[10px] text-lux-muted">Preferencia estética de la aplicación</span>
        </div>
        <button
          onClick={toggleTheme}
          className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out bg-lux-border focus:outline-none focus:ring-1 focus:ring-lux-accent dark:bg-lux-accent/30"
        >
          <span
            className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              theme === 'dark' ? 'translate-x-5 bg-lux-accent' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* 2. CONFIGURACIÓN DEL HOGAR (SÓLO ADMINISTRADOR) */}
      {activeHousehold && (
        <div className={`glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4 ${!isAdmin ? 'opacity-70 pointer-events-none' : ''}`}>
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2.5">
            <Settings size={14} className="text-lux-accent" />
            Configuraciones del Hogar (Solo Admin)
          </h3>

          <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Nombre del Hogar</label>
              <input
                type="text"
                disabled={!isAdmin}
                required
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                className="bg-lux-bg/60 border border-lux-border/60 rounded-2xl px-4 py-2.5 text-xs text-lux-text"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Día de Inicio de Ciclo</label>
                <span className="text-xs font-extrabold text-lux-accent">Día {billingDay}</span>
              </div>
              <input
                type="range"
                disabled={!isAdmin}
                min="1"
                max="28"
                value={billingDay}
                onChange={(e) => setBillingDay(parseInt(e.target.value))}
                className="accent-lux-accent cursor-pointer py-1"
              />
            </div>

            {isAdmin && (
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-lux-accent to-blue-600 text-white font-semibold py-3 rounded-2xl shadow-lg mt-2 text-xs transition-transform active:scale-[0.98]"
              >
                Guardar Configuración
              </button>
            )}
          </form>
        </div>
      )}

      {/* 3. GESTIÓN DE TITULARES DINÁMICOS (NUEVO) */}
      {activeHousehold && (
        <div className={`glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4 ${!isAdmin ? 'opacity-70 pointer-events-none' : ''}`}>
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2.5">
            <Users size={14} className="text-lux-accent" />
            Gestión de Titulares del Hogar
          </h3>

          {/* Formulario Añadir Titular */}
          {isAdmin && (
            <form onSubmit={handleAddHolder} className="flex gap-2.5">
              <input
                type="text"
                required
                placeholder="Nombre del Titular (ej: Florencia, Lucas)"
                value={newHolderName}
                onChange={(e) => setNewHolderName(e.target.value)}
                className="bg-lux-bg/60 border border-lux-border/60 rounded-2xl px-4 py-2.5 text-xs text-lux-text flex-1"
              />
              <button
                type="submit"
                className="bg-lux-accent hover:bg-blue-600 text-white px-4 rounded-2xl text-xs font-bold shadow-md transition-colors flex items-center gap-1"
              >
                <Plus size={14} />
                <span>Agregar</span>
              </button>
            </form>
          )}

          {/* Lista de Titulares */}
          <div className="flex flex-col gap-2 mt-2">
            {currentHolders.map((holderName) => (
              <div 
                key={holderName}
                className="flex justify-between items-center bg-lux-panel/30 border border-lux-border/20 px-4 py-3 rounded-2xl text-xs"
              >
                <span className="font-bold text-lux-text">{holderName}</span>
                {isAdmin && holderName !== 'Compartido' && (
                  <button
                    onClick={() => handleDeleteHolder(holderName)}
                    className="p-1.5 hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 rounded-full transition-colors"
                    title="Eliminar Titular"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. GESTIÓN DE CUENTAS Y TARJETAS DINÁMICAS (NUEVO) */}
      {activeHousehold && (
        <div className={`glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4 ${!isAdmin ? 'opacity-70 pointer-events-none' : ''}`}>
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2.5">
            <CreditCard size={14} className="text-lux-accent" />
            Cuentas y Tarjetas de Pago
          </h3>

          {/* Formulario Añadir Cuenta/Tarjeta */}
          {isAdmin && (
            <form onSubmit={handleAddAccount} className="flex flex-col gap-3 bg-lux-bg/40 border border-lux-border/30 p-4 rounded-2xl">
              <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Añadir Nueva Tarjeta / Cuenta</span>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Nombre (ej: Visa Galicia, Galicia Débito, Efectivo)"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  className="bg-lux-bg border border-lux-border/60 rounded-xl px-3.5 py-2 text-xs text-lux-text"
                />
                
                <select
                  value={newAccountType}
                  onChange={(e: any) => setNewAccountType(e.target.value)}
                  className="bg-lux-bg border border-lux-border/60 rounded-xl px-3.5 py-2 text-xs text-lux-text"
                >
                  <option value="bank_account">Cuenta Bancaria</option>
                  <option value="credit_card">Tarjeta de Crédito</option>
                  <option value="debit_card">Tarjeta de Débito</option>
                  <option value="cash">Efectivo</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div className="flex gap-2.5 items-center mt-1">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider whitespace-nowrap">Asociar a:</span>
                  <select
                    value={newAccountHolder}
                    onChange={(e) => setNewAccountHolder(e.target.value)}
                    className="bg-lux-bg border border-lux-border/60 rounded-xl px-3.5 py-2 text-xs text-lux-text w-full"
                  >
                    {currentHolders.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                
                <button
                  type="submit"
                  className="bg-gradient-to-r from-lux-accent to-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md hover:from-blue-600 hover:to-indigo-600 transition-all flex items-center gap-1 shrink-0"
                >
                  <Plus size={14} />
                  <span>Añadir</span>
                </button>
              </div>
            </form>
          )}

          {/* Listado de Cuentas Agrupadas por Titular */}
          <div className="flex flex-col gap-4 mt-2">
            {currentHolders.map((hName) => {
              const hAccounts = currentAccounts.filter((acc) => acc.holder === hName);
              if (hAccounts.length === 0) return null;

              return (
                <div key={hName} className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-extrabold text-lux-muted uppercase tracking-wider px-1">{hName}</span>
                  <div className="flex flex-col gap-2">
                    {hAccounts.map((acc) => (
                      <div 
                        key={acc.id}
                        className="flex justify-between items-center bg-lux-panel/30 border border-lux-border/20 px-4 py-3 rounded-2xl text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          {getAccountIcon(acc.type)}
                          <div className="flex flex-col">
                            <span className="font-bold text-lux-text">{acc.name || 'Sin nombre'}</span>
                            <span className="text-[9px] text-lux-muted">{getAccountTypeLabel(acc.type)}</span>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteAccount(acc.id, acc.name || 'Sin nombre')}
                            className="p-1.5 hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 rounded-full transition-colors"
                            title="Eliminar Cuenta"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. FONDO DE AHORROS INICIAL (SÓLO ADMINISTRADOR) */}
      {isAdmin && (
        <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2.5">
            <PiggyBank size={14} className="text-lux-accent" />
            Configuración del Saldo Inicial (Solo Admin)
          </h3>

          <form onSubmit={handleSaveSavings} className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="bg-lux-bg/60 border border-lux-border/60 rounded-2xl px-4 py-3 text-xs text-lux-text w-full"
              />
            </div>
            <button
              type="submit"
              className="bg-gradient-to-r from-brand-emerald to-emerald-600 text-white px-5 rounded-2xl text-xs font-semibold shadow-lg hover:from-emerald-600 hover:to-emerald-700 transition-colors"
            >
              Establecer
            </button>
          </form>
          <p className="text-[10px] text-lux-muted">
            Este saldo inicial representa tu punto de partida financiero histórico antes del primer mes de uso de la app.
          </p>
        </div>
      )}

      {/* 6. GESTIÓN DE COLABORADORES (MEMBERS) */}
      {activeHousehold && (
        <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2.5">
            <Users size={14} className="text-lux-accent" />
            Integrantes del Hogar
          </h3>

          {/* Panel de Invitación */}
          <div className="bg-lux-bg/60 border border-lux-border/40 p-4 rounded-2xl flex flex-col gap-2.5">
            <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Código de Invitación</span>
            <div className="flex gap-2">
              <span className="flex-1 bg-lux-panel border border-lux-border/50 text-lux-text px-4 py-2.5 rounded-xl text-sm font-extrabold uppercase select-all tracking-wider text-center flex items-center justify-center">
                {activeHousehold.invite_code}
              </span>
              <button
                type="button"
                onClick={copyInviteCode}
                className="p-2.5 bg-lux-accent/15 border border-lux-accent/30 text-lux-accent rounded-xl hover:bg-lux-accent/25 transition-colors"
                title="Copiar código"
              >
                <Copy size={16} />
              </button>
            </div>
            <p className="text-[10px] text-lux-muted text-center mt-1">
              Comparte este código para agregar colaboradores. Los invitados quedarán vinculados al instante.
            </p>
          </div>

          {/* Lista de integrantes */}
          <div className="flex flex-col gap-2.5 mt-2">
            <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider px-0.5">Miembros Activos ({members.length})</span>
            
            {loadingMembers ? (
              <div className="text-center py-4 text-xs text-lux-muted">Cargando integrantes...</div>
            ) : (
              <div className="flex flex-col gap-2">
                {members.map((m) => {
                  const isUser = m.user_id === user?.id;
                  return (
                    <div 
                      key={m.user_id}
                      className="flex justify-between items-center bg-lux-panel/30 border border-lux-border/20 px-4 py-3 rounded-2xl text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-lux-accent/10 border border-lux-accent/30 text-lux-accent font-bold flex items-center justify-center uppercase">
                          {m.profiles?.display_name?.substring(0, 2) || 'US'}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-lux-text">
                            {m.profiles?.display_name || 'Miembro'}
                            {isUser && <span className="text-[10px] text-lux-accent font-normal italic ml-1">(tú)</span>}
                          </span>
                          <span className="text-[9px] text-lux-muted font-semibold uppercase">{m.role === 'admin' ? 'Administrador' : 'Colaborador'}</span>
                        </div>
                      </div>

                      {isAdmin && !isUser && (
                        <button
                          onClick={() => handleRevokeMember(m.user_id, m.profiles?.display_name)}
                          className="p-1.5 hover:bg-brand-rose/10 text-brand-rose hover:text-red-400 rounded-full transition-colors"
                          title="Revocar acceso"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. GESTIÓN DE CATEGORÍAS - ACCESIBLE PARA TODOS */}
      <div className="glass-panel p-5 rounded-3xl border-lux-border/40 flex flex-col gap-4">
        <h3 className="text-xs font-bold text-lux-muted uppercase tracking-wider flex items-center gap-1.5 border-b border-lux-border/10 pb-2.5">
          <CreditCard size={14} className="text-lux-accent" />
          Categorías y Presupuestos
        </h3>

        {/* Formulario Agregar Categoría */}
        <form onSubmit={handleAddCategory} className="flex flex-col gap-3 bg-lux-bg/60 border border-lux-border/40 p-4 rounded-2xl">
          <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider">Nueva Categoría Personalizada</span>
          
          <div className="flex gap-2">
            <input
              type="text"
              required
              placeholder="Ej: Mascotas, Regalos"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="bg-lux-bg border border-lux-border/60 rounded-xl px-3 py-2 text-xs text-lux-text flex-1"
            />
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="w-10 h-8 rounded-xl cursor-pointer border border-lux-border/60 bg-transparent shrink-0"
            />
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="Presupuesto límite (€) (opcional)"
              value={newCatBudget}
              onChange={(e) => setNewCatBudget(e.target.value)}
              className="bg-lux-bg border border-lux-border/60 rounded-xl px-3 py-2 text-xs text-lux-text flex-1"
            />
            <button
              type="submit"
              className="bg-lux-accent text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-blue-600 transition-colors"
            >
              Crear
            </button>
          </div>
        </form>

        {/* Lista de Categorías */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[10px] font-bold text-lux-muted uppercase tracking-wider px-0.5">Listado de Categorías Activas</span>
          
          <div className="flex flex-col gap-2">
            {categories.map((cat) => {
              const isCritial = cat.name === 'Cuotas' || cat.name === 'Gastos No Planificados' || cat.name === 'Servicios' || cat.name === 'Suscripciones' || cat.name === 'Tarjeta de Crédito';
              return (
                <div 
                  key={cat.id}
                  className="flex justify-between items-center bg-lux-panel/30 border border-lux-border/20 px-4 py-3 rounded-2xl text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <div className="flex flex-col">
                      <span className="font-bold text-lux-text">{cat.name}</span>
                      {cat.budget_limit && (
                        <span className="text-[10px] text-lux-muted">Límite mensual: {Number(cat.budget_limit).toFixed(0)}€</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpdateBudget(cat.id, cat.name, cat.budget_limit)}
                      className="p-1 text-lux-muted hover:text-lux-text hover:bg-lux-border/40 rounded transition-colors"
                      title="Editar presupuesto"
                    >
                      <Edit3 size={12} />
                    </button>
                    
                    {!isCritial && (
                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1 text-brand-rose hover:text-red-400 hover:bg-brand-rose/10 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
