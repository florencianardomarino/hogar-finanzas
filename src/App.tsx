import React, { useState, useRef, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthScreen } from './components/auth/AuthScreen';
import { Dashboard } from './components/dashboard/Dashboard';
import { IncomesScreen } from './components/incomes/IncomesScreen';
import { ExpensesScreen } from './components/expenses/ExpensesScreen';
import { InstallmentsScreen } from './components/installments/InstallmentsScreen';
import { SavingsScreen } from './components/savings/SavingsScreen';
import { MonthlySummaryScreen } from './components/summary/MonthlySummaryScreen';
import { SettingsScreen } from './components/settings/SettingsScreen';
import { ToastContainer } from './components/ui/ToastContainer';
import { HomeflowLogo } from './components/ui/HomeflowLogo';
import { getPeriodList, getPeriodLabel, arePeriodsEqual, FinancialPeriod } from './utils/dateUtils';
import { 
  Sparkles, PiggyBank, ArrowUpRight, ArrowDownRight, 
  CreditCard, CalendarRange, PieChart, Settings, LogOut, ChevronDown, Landmark, AlertTriangle, Calendar
} from 'lucide-react';

type Tab = 'dashboard' | 'incomes' | 'expenses' | 'installments' | 'savings' | 'summary' | 'settings';

const AppContent: React.FC = () => {
  const { 
    user, households, loadingAuth, loadingHouseholds, householdsError, 
    logout, selectHousehold, activeHousehold, theme, toggleTheme, loadHouseholds,
    currentPeriod, selectedPeriod, setSelectedPeriod, activeMonthRecord
  } = useApp();

  console.log('DEBUG Homeflow - loadingAuth:', loadingAuth, 'loadingHouseholds:', loadingHouseholds, 'user:', user ? user.email : 'null', 'households:', households.length);

  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showHouseholdDropdown, setShowHouseholdDropdown] = useState(false);

  const navMonths = getPeriodList(currentPeriod || { year: new Date().getFullYear(), month: new Date().getMonth() + 1 }, 6, 6);
  const activePeriodRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (activePeriodRef.current) {
      activePeriodRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [selectedPeriod]);

  // 1. Mostrar pantalla de carga durante la verificación de Auth o de Hogares
  if (loadingAuth || loadingHouseholds) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#090D16]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-lux-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-lux-muted font-bold tracking-wide">
            {loadingAuth ? 'Cargando Homeflow...' : 'Cargando la configuración de tu hogar...'}
          </p>
        </div>
      </div>
    );
  }

  // 2. Si hay un error al conectar con la base de datos de hogares y no tenemos datos locales previos, mostrar pantalla de reintento
  if (householdsError && households.length === 0) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-[#090D16] px-6 text-center">
        <div className="w-16 h-16 bg-brand-rose/10 border border-brand-rose/20 text-brand-rose rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle size={32} />
        </div>
        <h2 className="text-xl font-bold text-lux-text mb-2">Error de Conexión</h2>
        <p className="text-sm text-lux-muted max-w-sm mb-6">
          No pudimos cargar la información de tu hogar. Esto puede deberse a una mala conexión o a extensiones del navegador interrumpiendo la conexión:<br />
          <span className="text-brand-rose/80 font-mono mt-2 inline-block text-xs">{householdsError}</span>
        </p>
        <div className="flex gap-4">
          <button
            onClick={() => user && loadHouseholds(user.id)}
            className="bg-gradient-to-r from-lux-accent to-brand-indigo text-white font-bold px-6 py-3 rounded-2xl shadow-lg hover:shadow-lux-accent/25 transition-all active:scale-[0.98] text-sm"
          >
            Reintentar
          </button>
          <button
            onClick={logout}
            className="bg-lux-panel border border-lux-border/50 text-lux-text font-bold px-6 py-3 rounded-2xl hover:bg-lux-panel/60 transition-colors text-sm"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  // 3. Si no hay sesión o no hay hogares vinculados, mostrar Onboarding/Auth
  if (!user || households.length === 0) {
    return (
      <>
        <AuthScreen />
        <ToastContainer />
      </>
    );
  }

  // Renderizar la sección modular en base a la pestaña activa
  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard onNavigate={(tab) => setActiveTab(tab)} />;
      case 'incomes':
        return <IncomesScreen />;
      case 'expenses':
        return <ExpensesScreen />;
      case 'installments':
        return <InstallmentsScreen />;
      case 'savings':
        return <SavingsScreen onNavigate={(tab) => setActiveTab(tab)} />;
      case 'summary':
        return <MonthlySummaryScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-lux-bg text-lux-text relative overflow-x-hidden">
      
      {/* -----------------------------------------------------------------
          A. MENÚ LATERAL (SIDEBAR) - DISPOSITIVOS DE ESCRITORIO (md:flex)
          ----------------------------------------------------------------- */}
      <aside className="hidden md:flex flex-col w-72 glass-panel border-r border-lux-border/40 shrink-0 min-h-screen p-6 relative z-10">
        {/* Isotipo */}
        <div className="flex items-center gap-2.5 mb-8">
          <HomeflowLogo size={36} />
          <div>
            <h1 className="text-base font-extrabold leading-none text-gradient-sky">Homeflow</h1>
            <span className="text-[9px] text-lux-muted uppercase font-bold tracking-widest mt-0.5">Gestión Inteligente</span>
          </div>
        </div>

        {/* Selector de Hogares */}
        <div className="relative mb-6">
          <button 
            onClick={() => setShowHouseholdDropdown(!showHouseholdDropdown)}
            className="w-full flex justify-between items-center bg-lux-bg/60 border border-lux-border/50 px-4 py-3 rounded-2xl hover:border-lux-border transition-colors text-left"
          >
            <span className="text-xs font-bold text-lux-text truncate">{activeHousehold?.name}</span>
            <ChevronDown size={14} className="text-lux-muted shrink-0 ml-2" />
          </button>
          
          {showHouseholdDropdown && (
            <div className="absolute left-0 right-0 mt-2 bg-slate-900 border border-lux-border rounded-2xl shadow-2xl p-2 z-30">
              {households.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    selectHousehold(h.id);
                    setShowHouseholdDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold hover:bg-lux-panel/60 transition-colors ${
                    h.id === activeHousehold?.id ? 'text-lux-accent bg-lux-accent/10' : 'text-lux-muted hover:text-lux-text'
                  }`}
                >
                  {h.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navegación del Menú Lateral */}
        <nav className="flex-1 flex flex-col gap-1.5">
          {[
            { id: 'dashboard', label: 'Resumen Mensual', icon: CalendarRange },
            { id: 'incomes', label: 'Ingresos', icon: ArrowUpRight },
            { id: 'expenses', label: 'Gastos Corrientes', icon: ArrowDownRight },
            { id: 'installments', label: 'Cuotas y Préstamos', icon: CreditCard },
            { id: 'savings', label: 'Fondo de Ahorros', icon: PiggyBank },
            { id: 'summary', label: 'Estadísticas del Mes', icon: PieChart },
            { id: 'settings', label: 'Ajustes', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-xs font-bold transition-all duration-200 ${
                  isSelected
                    ? 'border-lux-accent/30 bg-lux-accent/10 text-lux-accent'
                    : 'border-transparent text-lux-muted hover:text-lux-text hover:bg-lux-panel/30'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Pie del Menú con Logout */}
        <div className="pt-4 border-t border-lux-border/20 flex flex-col gap-3">
          <div className="text-[10px] text-lux-muted truncate font-medium">
            Conectado como <strong className="text-lux-text font-bold">{user.email}</strong>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 bg-brand-rose/10 border border-brand-rose/20 text-brand-rose hover:bg-brand-rose/15 py-3 rounded-2xl text-xs font-bold transition-colors"
          >
            <LogOut size={14} />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* -----------------------------------------------------------------
          B. CONTENIDO DINÁMICO PRINCIPAL
          ----------------------------------------------------------------- */}
      <main className="flex-1 min-h-screen flex flex-col relative z-0">
        
        {/* Cabecera Móvil Premium de Marca permanente */}
        <div className="md:hidden flex justify-between items-center px-4 pb-3 safe-header-padding border-b border-lux-border/10 bg-lux-bg/50 backdrop-blur-md select-none sticky top-0 z-30">
          {/* Logo y Nombre de Marca */}
          <div className="flex items-center gap-2">
            <HomeflowLogo size={26} />
            <span className="text-sm font-extrabold text-gradient-sky tracking-tight">Homeflow</span>
          </div>

          {/* Selector de Hogar */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button 
                onClick={() => setShowHouseholdDropdown(!showHouseholdDropdown)}
                className="flex items-center gap-1.5 bg-lux-panel/60 border border-lux-border/40 px-3 py-1.5 rounded-xl text-xs font-bold text-lux-text max-w-32 truncate"
              >
                <span>{activeHousehold?.name}</span>
                <ChevronDown size={10} className="text-lux-muted shrink-0" />
              </button>
              
              {showHouseholdDropdown && (
                <div className="absolute right-0 mt-2 bg-slate-900 border border-lux-border rounded-2xl shadow-2xl p-2 z-40 w-48">
                  {households.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => {
                        selectHousehold(h.id);
                        setShowHouseholdDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl text-xs font-semibold text-lux-muted hover:text-lux-text hover:bg-lux-panel/40"
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={logout}
              className="p-2 bg-brand-rose/10 border border-brand-rose/20 text-brand-rose rounded-xl hover:bg-brand-rose/15 transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut size={12} />
            </button>
          </div>
        </div>

        {/* --- Selector de Período Global --- */}
        {activeTab !== 'settings' && (
          <div className="flex gap-2 overflow-x-auto py-3 px-4 scrollbar-none border-b border-lux-border/10 select-none bg-lux-bg/40 backdrop-blur-md scroll-smooth sticky top-[51px] md:top-0 z-20">
            {navMonths.map((p: FinancialPeriod, idx: number) => {
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
        )}

        {/* Sección del Módulo activo */}
        <div className="flex-1">
          {renderTabContent()}
        </div>

        {/* -----------------------------------------------------------------
            C. NAV BAR INFERIOR DE MÓVIL - ULTRA PREMIUM FLOATING GLASS
            ----------------------------------------------------------------- */}
        <div className="md:hidden fixed safe-bottom-nav left-4 right-4 z-40 bg-lux-panel/95 backdrop-blur-xl border border-lux-border/40 rounded-3xl shadow-2xl px-2 py-2 flex justify-around select-none">
          {[
            { id: 'dashboard', icon: CalendarRange, label: 'Inicio' },
            { id: 'incomes', icon: ArrowUpRight, label: 'Ingresos' },
            { id: 'expenses', icon: ArrowDownRight, label: 'Gastos' },
            { id: 'installments', icon: CreditCard, label: 'Cuotas' },
            { id: 'savings', icon: PiggyBank, label: 'Ahorros' },
            { id: 'summary', icon: PieChart, label: 'Estats' },
            { id: 'settings', icon: Settings, label: 'Ajustes' },
          ].map((item) => {
            const Icon = item.icon;
            const isSelected = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={`flex flex-col items-center justify-center w-12 py-1.5 rounded-2xl transition-all duration-300 relative ${
                  isSelected 
                    ? 'text-lux-accent bg-lux-accent/10 scale-105' 
                    : 'text-lux-muted hover:text-lux-text'
                }`}
              >
                <Icon size={18} className={isSelected ? 'text-lux-accent' : 'text-lux-muted'} />
                <span className="text-[9px] font-bold mt-1 tracking-tight leading-none">
                  {item.label}
                </span>
                {isSelected && (
                  <span className="absolute -top-1 w-1 h-1 bg-lux-accent rounded-full animate-ping" />
                )}
              </button>
            );
          })}
        </div>
      </main>

      {/* Contenedor de Toasts Flotantes */}
      <ToastContainer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
