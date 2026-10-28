import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Profile, Household, UserRole, ExpenseCategory, Month, 
  Income, Expense, Installment, UnplannedExpense, SavingsConfig,
  SavingsAccount, SavingsAllocation, SavingsAccountExpense, AllocationKind
} from '../types';
import { getFinancialPeriod, arePeriodsEqual, FinancialPeriod } from '../utils/dateUtils';
import { calculateEncainedFinances } from '../utils/financeUtils';
import { isSameSeries, getDayOfMonth } from '../utils/recurrence';

// Mensaje cuando faltan las tablas/columnas de la migración de ahorros en Supabase
const SAVINGS_MIGRATION_MESSAGE =
  'Falta ejecutar la migración SQL (migration_savings_accounts.sql) en Supabase';

// Detecta errores de PostgREST/Postgres por tabla o columna inexistente
const isMissingSchemaError = (err: any): boolean => {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205' ||
    msg.includes('does not exist') || msg.includes('schema cache')
  );
};

// Interfaz para Toasts
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// Interfaz del contexto de la aplicación
interface AppContextType {
  // Autenticación
  user: any | null;
  profile: Profile | null;
  loadingAuth: boolean;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  
  // Hogares
  households: Household[];
  activeHousehold: Household | null;
  userRole: UserRole | null;
  loadingHouseholds: boolean;
  householdsError: string | null;
  selectHousehold: (id: string) => void;
  createHousehold: (name: string, billingDay: number) => Promise<string>;
  joinHousehold: (inviteCode: string) => Promise<void>;
  leaveHousehold: (householdId: string) => Promise<void>;
  updateHouseholdSettings: (settings: Partial<Household>) => Promise<void>;
  loadHouseholds: (userId: string) => Promise<void>;
  
  // Categorías de gastos
  categories: ExpenseCategory[];
  refreshCategories: () => Promise<void>;
  
  // Navegación Temporal
  currentPeriod: FinancialPeriod;
  selectedPeriod: FinancialPeriod;
  setSelectedPeriod: (period: FinancialPeriod) => void;
  monthsData: Month[];
  activeMonthRecord: Month | null;
  loadingPeriod: boolean;
  closeMonth: (monthId: string) => Promise<void>;
  reopenMonth: (monthId: string) => Promise<void>;
  
  // Datos Financieros del Período
  incomes: Income[];
  allIncomes: Income[];
  expenses: Expense[];
  allExpenses: Expense[];
  unplannedExpenses: UnplannedExpense[];
  allUnplannedExpenses: UnplannedExpense[]; // de todos los meses del hogar (para el saldo encadenado)
  installments: Installment[];
  savingsConfig: SavingsConfig | null;
  savingsAccounts: SavingsAccount[];
  savingsAllocations: SavingsAllocation[];
  savingsAccountExpenses: SavingsAccountExpense[];
  savingsAccountsReady: boolean; // false si falta ejecutar la migración SQL
  loadingData: boolean;
  
  // Operaciones Financieras
  addIncome: (income: Omit<Income, 'id' | 'month_id' | 'created_by' | 'created_at'>) => Promise<void>;
  updateIncome: (id: string, income: Partial<Income>, adjustmentNote?: string) => Promise<void>;
  deleteIncome: (id: string, deleteFuture?: boolean) => Promise<void>;
  
  addExpense: (expense: Omit<Expense, 'id' | 'month_id' | 'created_by' | 'created_at'>) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense>, adjustmentNote?: string) => Promise<void>;
  deleteExpense: (id: string, deleteFuture?: boolean) => Promise<void>;
  
  addInstallment: (installment: Omit<Installment, 'id' | 'household_id' | 'created_by' | 'created_at'>) => Promise<void>;
  cancelInstallment: (id: string) => Promise<void>;
  updateInstallment: (id: string, installment: Partial<Installment>) => Promise<void>;
  
  addUnplannedExpense: (unplanned: Omit<UnplannedExpense, 'id' | 'household_id' | 'month_id' | 'created_by' | 'created_at'>) => Promise<void>;
  updateUnplannedExpense: (id: string, unplanned: Partial<UnplannedExpense>) => Promise<void>;
  deleteUnplannedExpense: (id: string) => Promise<void>;
  
  updateSavingsConfig: (balance: number) => Promise<void>;
  resetSavingsBalance: (year: number, month: number, balance: number, previousComputed: number) => Promise<void>;
  clearSavingsAnchor: () => Promise<void>;

  // Cuentas de ahorro (ej: Inversión, Cancelar deudas)
  addSavingsAccount: (name: string, color: string) => Promise<void>;
  updateSavingsAccount: (id: string, patch: Partial<Pick<SavingsAccount, 'name' | 'color'>>) => Promise<void>;
  deleteSavingsAccount: (id: string) => Promise<void>;
  setSavingsAllocation: (accountId: string, year: number, month: number, kind: AllocationKind, value: number) => Promise<void>;
  deleteSavingsAllocation: (id: string) => Promise<void>;
  addSavingsAccountExpense: (expense: Pick<SavingsAccountExpense, 'savings_account_id' | 'description' | 'amount' | 'date' | 'notes'>) => Promise<void>;
  updateSavingsAccountExpense: (id: string, patch: Partial<Pick<SavingsAccountExpense, 'description' | 'amount' | 'date' | 'notes'>>) => Promise<void>;
  deleteSavingsAccountExpense: (id: string) => Promise<void>;
  
  // Interfaz de Usuario (Tema & Toasts)
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Autenticación
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Hogares
  const [households, setHouseholds] = useState<Household[]>([]);
  const [activeHousehold, setActiveHousehold] = useState<Household | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loadingHouseholds, setLoadingHouseholds] = useState(false);
  const [householdsError, setHouseholdsError] = useState<string | null>(null);

  // Refs para de-duplicar llamadas concurrentes e impedir flashes de cargando
  const activeLoadPromiseRef = useRef<Promise<void> | null>(null);
  const householdsLoadedRef = useRef(false);
  const financialLoadInFlightRef = useRef<Promise<void> | null>(null);
  const financialLoadPendingRef = useRef(false);
  const runLoadFinancialDataRef = useRef<() => Promise<void>>(async () => {});

  // Categorías de Gastos
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Períodos temporales
  const [currentPeriod, setCurrentPeriod] = useState<FinancialPeriod>(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [selectedPeriod, setSelectedPeriod] = useState<FinancialPeriod>(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  });
  const [monthsData, setMonthsData] = useState<Month[]>([]);
  const [activeMonthRecord, setActiveMonthRecord] = useState<Month | null>(null);
  const [loadingPeriod, setLoadingPeriod] = useState(false);

  // Datos financieros del período activo
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [allIncomes, setAllIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [unplannedExpenses, setUnplannedExpenses] = useState<UnplannedExpense[]>([]);
  const [allUnplannedExpenses, setAllUnplannedExpenses] = useState<UnplannedExpense[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [savingsConfig, setSavingsConfig] = useState<SavingsConfig | null>(null);
  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [savingsAllocations, setSavingsAllocations] = useState<SavingsAllocation[]>([]);
  const [savingsAccountExpenses, setSavingsAccountExpenses] = useState<SavingsAccountExpense[]>([]);
  const [savingsAccountsReady, setSavingsAccountsReady] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  // Toasts & Tema
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [toasts, setToasts] = useState<Toast[]>([]);

  // -------------------------------------------------------------------
  // TOASTS & TEMA
  // -------------------------------------------------------------------
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // -------------------------------------------------------------------
  // AUTENTICACIÓN
  // -------------------------------------------------------------------
  const refreshAuth = async () => {
    if (!user) return;
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (prof) setProfile(prof);
      await loadHouseholds(user.id);
    } catch (e) {
      console.error('Error refreshing auth', e);
    }
  };

  // Carga e inicialización robusta al montar
  useEffect(() => {
    const initializeAuth = async () => {
      setLoadingAuth(true);
      try {
        console.log('DEBUG Homeflow - Starting initializeAuth...');
        
        // Timeout de 6 segundos para obtener la sesión inicial
        const authTimeout = new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado al verificar la sesión inicial')), 6000)
        );
        
        const sessionPromise = supabase.auth.getSession();
        const raceResult = await Promise.race([sessionPromise, authTimeout]);
        const session = raceResult?.data?.session || raceResult?.session || null;
        
        if (session) {
          console.log('DEBUG Homeflow - Initial session found:', session.user.email);
          setUser(session.user);
          
          // Cargar perfil en segundo plano (sin bloquear el arranque de la app)
          (async () => {
            try {
              const { data: prof, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();
              
              if (!error && prof) {
                setProfile(prof);
              } else {
                const displayName = session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Usuario';
                const { data: newProf } = await supabase
                  .from('profiles')
                  .upsert({ id: session.user.id, display_name: displayName })
                  .select()
                  .single();
                if (newProf) setProfile(newProf);
              }
            } catch (pe) {
              console.error('Error loading profile on startup in background', pe);
            }
          })();
          
          // Cargar hogares de inmediato antes de desactivar loadingAuth
          await loadHouseholds(session.user.id);
        } else {
          console.log('DEBUG Homeflow - No initial session found');
          setUser(null);
          setProfile(null);
        }
      } catch (e) {
        console.error('Error during initial auth check:', e);
        setUser(null);
        setProfile(null);
      } finally {
        setLoadingAuth(false);
      }
    };

    initializeAuth();

    // Nos suscribimos a cambios posteriores de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('DEBUG Homeflow - AuthStateChange Event:', event, 'Session:', session ? 'Active' : 'Null');
      
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && session) {
        setUser(session.user);
        
        // Evitamos doble pantalla de carga innecesaria si ya tenemos hogares
        if (!householdsLoadedRef.current) {
          setLoadingHouseholds(true);
        }
        
        // Cargar perfil en segundo plano (sin bloquear la carga de hogares)
        (async () => {
          try {
            const { data: prof, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
            if (!error && prof) {
              setProfile(prof);
            } else {
              const displayName = session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Usuario';
              const { data: newProf } = await supabase
                .from('profiles')
                .upsert({ id: session.user.id, display_name: displayName })
                .select()
                .single();
              if (newProf) setProfile(newProf);
            }
          } catch (pe) {
            console.error('Error loading profile in SIGNED_IN event in background', pe);
          }
        })();
        
        await loadHouseholds(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        // Limpieza total instantánea al cerrar sesión
        setUser(null);
        setProfile(null);
        setHouseholds([]);
        setActiveHousehold(null);
        setUserRole(null);
        setHouseholdsError(null);
        setLoadingHouseholds(false);
        householdsLoadedRef.current = false;
        localStorage.removeItem('active_household_id');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    try {
      // Limpiar estados locales de inmediato para una desconexión instantánea
      setUser(null);
      setProfile(null);
      setHouseholds([]);
      setActiveHousehold(null);
      setUserRole(null);
      setHouseholdsError(null);
      setLoadingHouseholds(false);
      householdsLoadedRef.current = false;
      localStorage.removeItem('active_household_id');
      
      await supabase.auth.signOut();
      showToast('Sesión cerrada con éxito', 'info');
    } catch (e) {
      showToast('Error al cerrar sesión', 'error');
    }
  };

  // -------------------------------------------------------------------
  // HOGARES
  // -------------------------------------------------------------------
  const loadHouseholds = async (userId: string) => {
    // Si ya existe una consulta de hogares activa en este momento, reutilizamos la misma promesa
    if (activeLoadPromiseRef.current) {
      console.log('DEBUG Homeflow - loadHouseholds ya en ejecución, reusando promesa activa.');
      return activeLoadPromiseRef.current;
    }

    const loadPromise = (async () => {
      // Solo activamos spinner de carga en UI si no hay hogares cargados aún
      if (!householdsLoadedRef.current) {
        setLoadingHouseholds(true);
      }
      setHouseholdsError(null);
      
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con el servidor')), 20000)
        );

        const queryPromise = supabase
          .from('household_members')
          .select(`
            household_id,
            role,
            households (*)
          `)
          .eq('user_id', userId);

        let response = await Promise.race([queryPromise, timeoutPromise]);
        let { data: members, error } = response as any;

        if (error) throw error;

        // RETRY FALLBACK: Si hay un usuario conectado pero la consulta retorna vacío,
        // podría ser por retraso de propagación del JWT en las cabeceras de Supabase (RLS).
        // Hacemos una pausa y reintentamos tras 600ms una única vez para garantizar robustez absoluta.
        if (!error && (!members || members.length === 0)) {
          console.log('DEBUG Homeflow - RLS no devolvió hogares en primer intento. Reintentando en 600ms...');
          await new Promise((resolve) => setTimeout(resolve, 600));
          
          const retryQueryPromise = supabase
            .from('household_members')
            .select(`
              household_id,
              role,
              households (*)
            `)
            .eq('user_id', userId);
            
          const retryResponse = await Promise.race([retryQueryPromise, timeoutPromise]);
          members = (retryResponse as any).data;
          const retryError = (retryResponse as any).error;
          if (retryError) throw retryError;
        }

        if (members && members.length > 0) {
          // Filtrar nulos para evitar errores si RLS bloquea algún registro en cascada
          const list = members.map((m: any) => m.households).filter(Boolean) as Household[];
          setHouseholds(list);
          
          if (list.length > 0) {
            householdsLoadedRef.current = true;
            const savedId = localStorage.getItem('active_household_id');
            const active = list.find((h) => h.id === savedId) || list[0];
            setActiveHousehold(active);
            
            const activeMember = members.find((m: any) => m.household_id === active.id);
            setUserRole(activeMember ? activeMember.role : 'collaborator');
            localStorage.setItem('active_household_id', active.id);
          } else {
            setHouseholds([]);
            setActiveHousehold(null);
            setUserRole(null);
            householdsLoadedRef.current = false;
          }
        } else {
          setHouseholds([]);
          setActiveHousehold(null);
          setUserRole(null);
          householdsLoadedRef.current = false;
        }
      } catch (e: any) {
        console.error('Error loading households:', e);
        // Solo bloquear la pantalla si no tenemos ningún dato cargado aún
        if (!householdsLoadedRef.current || households.length === 0) {
          setHouseholdsError(e.message || 'Error al conectar con la base de datos');
          showToast('Error al cargar hogares', 'error');
        } else {
          // Si ya estábamos adentro, mostrar un toast sutil e informativo y no bloquear la pantalla
          showToast('Conexión inestable. Usando datos locales.', 'info');
        }
      } finally {
        setLoadingHouseholds(false);
        activeLoadPromiseRef.current = null; // Liberamos la referencia al finalizar
      }
    })();

    activeLoadPromiseRef.current = loadPromise;
    return loadPromise;
  };

  const selectHousehold = (id: string) => {
    const active = households.find((h) => h.id === id);
    if (active) {
      setActiveHousehold(active);
      localStorage.setItem('active_household_id', active.id);
      
      // Obtener rol
      supabase
        .from('household_members')
        .select('role')
        .eq('household_id', active.id)
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setUserRole(data.role as UserRole);
        });
        
      showToast(`Hogar "${active.name}" seleccionado`, 'success');
    }
  };

  const createHousehold = async (name: string, billingDay: number): Promise<string> => {
    if (!user) throw new Error('Usuario no autenticado');
    
    // Crear promesa de timeout de 30 segundos
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado al crear el hogar en la base de datos')), 30000)
    );

    try {
      const inviteCode = 'HOGAR-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const householdId = window.crypto.randomUUID();
      
      const actionPromise = (async () => {
        // 1. Crear el hogar (Inserción pura sin .select(), evitando fallos de RLS antes de tener membresía)
        const { error: hError } = await supabase
          .from('households')
          .insert({
            id: householdId,
            name,
            billing_cycle_start_day: billingDay,
            invite_code: inviteCode,
            created_by: user.id
          });
        
        if (hError) throw hError;

        // 2. Asociar al creador como Administrador
        const { error: mError } = await supabase
          .from('household_members')
          .insert({
            household_id: householdId,
            user_id: user.id,
            role: 'admin'
          });

        if (mError) throw mError;

        // Actualizar listado local
        await loadHouseholds(user.id);
        return householdId;
      })();

      // Competir la operación de creación real contra el timeout
      const resultId = await Promise.race([actionPromise, timeoutPromise]);
      showToast(`Hogar "${name}" creado con éxito`, 'success');
      return resultId;
    } catch (e: any) {
      console.error('Error in createHousehold:', e);
      showToast(e.message || 'Error al crear el hogar', 'error');
      throw e;
    }
  };

  const joinHousehold = async (inviteCode: string): Promise<void> => {
    if (!user) throw new Error('Usuario no autenticado');
    
    // Crear promesa de timeout de 30 segundos
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado al unirse al hogar')), 30000)
    );

    try {
      const actionPromise = (async () => {
        // Unirse mediante la función RPC (valida el código y registra al colaborador en el servidor)
        const { data, error: jError } = await supabase.rpc('join_household', { invite: inviteCode });

        if (jError) {
          if (jError.message?.includes('invalid_invite_code')) {
            throw new Error('Código de invitación no válido');
          }
          throw jError;
        }

        const joined = Array.isArray(data) ? data[0] : data;
        if (!joined) throw new Error('Código de invitación no válido');

        if (joined.already_member) {
          showToast('Ya perteneces a este hogar', 'info');
          return;
        }

        await loadHouseholds(user.id);
        showToast(`Te has unido al hogar "${joined.household_name}"`, 'success');
      })();

      await Promise.race([actionPromise, timeoutPromise]);
    } catch (e: any) {
      console.error('Error in joinHousehold:', e);
      showToast(e.message || 'Error al unirse al hogar', 'error');
      throw e;
    }
  };

  const leaveHousehold = async (householdId: string): Promise<void> => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', user.id);

      if (error) throw error;
      
      await loadHouseholds(user.id);
      showToast('Saliste del hogar', 'info');
    } catch (e) {
      showToast('Error al salir del hogar', 'error');
    }
  };

  const updateHouseholdSettings = async (settings: Partial<Household>) => {
    if (!activeHousehold) return;
    try {
      const { data, error } = await supabase
        .from('households')
        .update(settings)
        .eq('id', activeHousehold.id)
        .select()
        .single();
      
      if (error) throw error;
      
      setActiveHousehold(data);
      setHouseholds((prev) => prev.map((h) => (h.id === data.id ? data : h)));
      showToast('Configuración del hogar actualizada', 'success');
    } catch (e) {
      showToast('Error al actualizar la configuración', 'error');
    }
  };

  // -------------------------------------------------------------------
  // CATEGORÍAS
  // -------------------------------------------------------------------
  const refreshCategories = async () => {
    if (!activeHousehold) return;
    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('household_id', activeHousehold.id)
      .order('sort_order', { ascending: true });
    
    if (!error && data) {
      setCategories(data);
    }
  };

  useEffect(() => {
    if (activeHousehold) {
      refreshCategories();
    } else {
      setCategories([]);
    }
  }, [activeHousehold]);

  // -------------------------------------------------------------------
  // NAVEGACIÓN TEMPORAL Y PERÍODO FINANCIERO
  // -------------------------------------------------------------------
  // Calcular período actual dinámicamente al cargar o cambiar el hogar
  useEffect(() => {
    if (activeHousehold) {
      const startDay = activeHousehold.billing_cycle_start_day;
      const todayPeriod = getFinancialPeriod(new Date(), startDay);
      setCurrentPeriod(todayPeriod);
      setSelectedPeriod(todayPeriod);
    }
  }, [activeHousehold]);

  // Devuelve el mes (año/mes) del hogar, creándolo si no existe. Tolera la carrera con otra
  // pestaña/usuario: si el INSERT choca con la restricción UNIQUE, lee el mes ya creado.
  // `created` es true solo si este llamado lo creó.
  const ensureMonthRecord = async (year: number, month: number): Promise<{ record: Month; created: boolean }> => {
    if (!activeHousehold) throw new Error('No active household');
    const isFuture = year > currentPeriod.year || (year === currentPeriod.year && month > currentPeriod.month);

    const { data: newMonth, error } = await supabase
      .from('months')
      .insert({ household_id: activeHousehold.id, year, month, status: isFuture ? 'planning' : 'open' })
      .select()
      .single();

    let record: Month | null = newMonth;
    let created = true;
    if (error || !record) {
      if (error && error.code !== '23505') throw error;
      const { data: existing, error: selError } = await supabase
        .from('months')
        .select('*')
        .eq('household_id', activeHousehold.id)
        .eq('year', year)
        .eq('month', month)
        .single();
      if (selError || !existing) throw selError || new Error('No se pudo crear el mes');
      record = existing;
      created = false;
    }

    const ensured = record as Month;
    setMonthsData((prev) =>
      prev.some((m) => m.id === ensured.id)
        ? prev
        : [...prev, ensured].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    );
    return { record: ensured, created };
  };

  // Sincronizar/Crear el mes seleccionado en la base de datos
  const loadPeriodRecord = async () => {
    if (!activeHousehold) return;
    setLoadingPeriod(true);
    try {
      // 1. Cargar todos los meses registrados del hogar para el historial
      const { data: months, error: mError } = await supabase
        .from('months')
        .select('*')
        .eq('household_id', activeHousehold.id)
        .order('year', { ascending: true })
        .order('month', { ascending: true });

      if (mError) throw mError;
      
      setMonthsData(months || []);

      // 2. Comprobar si el mes seleccionado ya existe
      let record = (months || []).find((m) => m.year === selectedPeriod.year && m.month === selectedPeriod.month);
      
      if (!record) {
        // Creamos el mes automáticamente (solo copiamos recurrentes si lo creamos nosotros)
        const { record: ensured, created } = await ensureMonthRecord(selectedPeriod.year, selectedPeriod.month);
        record = ensured;
        const newMonth = ensured;

        if (created) {
          // --- NUEVO: Copiar gastos e ingresos recurrentes del mes anterior ---
          try {
            let prevMonthVal = selectedPeriod.month - 1;
            let prevYearVal = selectedPeriod.year;
            if (prevMonthVal === 0) {
              prevMonthVal = 12;
              prevYearVal -= 1;
            }

            const { data: prevMonthRecord } = await supabase
              .from('months')
              .select('id')
              .eq('household_id', activeHousehold.id)
              .eq('year', prevYearVal)
              .eq('month', prevMonthVal)
              .maybeSingle();

            if (prevMonthRecord) {
              // 1. Copiar gastos recurrentes
              const { data: recurringExpenses } = await supabase
                .from('expenses')
                .select('*')
                .eq('month_id', prevMonthRecord.id)
                .eq('is_recurring', true);

               if (recurringExpenses && recurringExpenses.length > 0) {
                const startDay = activeHousehold.billing_cycle_start_day;
                const copies = recurringExpenses.map(exp => {
                  const prevDate = new Date(exp.date);
                  const day = prevDate.getUTCDate();
                  
                  let targetYear = newMonth.year;
                  let targetMonth = newMonth.month;
                  if (day < startDay) {
                    targetMonth += 1;
                    if (targetMonth > 12) {
                      targetMonth = 1;
                      targetYear += 1;
                    }
                  }
                  const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
                  const targetDay = Math.min(day, lastDayOfTargetMonth);
                  const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

                  return {
                    description: exp.description,
                    amount: exp.amount,
                    date: targetDateStr,
                    account: exp.account,
                    holder: exp.holder,
                    category_id: exp.category_id,
                    is_planned: exp.is_planned,
                    notes: exp.notes,
                    is_recurring: true,
                    recurrence_group_id: exp.recurrence_group_id ?? null,
                    month_id: newMonth.id,
                    created_by: exp.created_by
                  };
                });

                await supabase.from('expenses').insert(copies);
              }

              // 2. Copiar ingresos recurrentes
              const { data: prevIncomes } = await supabase
                .from('incomes')
                .select('*')
                .eq('month_id', prevMonthRecord.id);

              if (prevIncomes && prevIncomes.length > 0) {
                const recurringIncomes = prevIncomes.filter(inc => inc.is_recurring);

                if (recurringIncomes.length > 0) {
                  const startDay = activeHousehold.billing_cycle_start_day;
                  const incomeCopies = recurringIncomes.map(inc => {
                    const prevDate = new Date(inc.date);
                    const day = prevDate.getUTCDate();
                    
                    let targetYear = newMonth.year;
                    let targetMonth = newMonth.month;
                    if (day < startDay) {
                      targetMonth += 1;
                      if (targetMonth > 12) {
                        targetMonth = 1;
                        targetYear += 1;
                      }
                    }
                    const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
                    const targetDay = Math.min(day, lastDayOfTargetMonth);
                    const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

                    return {
                      description: inc.description,
                      amount: inc.amount,
                      date: targetDateStr,
                      account: inc.account,
                      category: inc.category,
                      is_estimated: inc.is_estimated,
                      is_recurring: true,
                      recurrence_group_id: inc.recurrence_group_id ?? null,
                      month_id: newMonth.id,
                      created_by: inc.created_by
                    };
                  });

                  await supabase.from('incomes').insert(incomeCopies);
                }
              }
            }
          } catch (copyErr) {
            console.error('Error copying recurring items to new month:', copyErr);
          }
          // ---------------------------------------------------------
        }
      }

      setActiveMonthRecord(record || null);
    } catch (e) {
      console.error('Error loading period records', e);
    } finally {
      setLoadingPeriod(false);
    }
  };

  useEffect(() => {
    if (activeHousehold) {
      loadPeriodRecord();
    } else {
      setActiveMonthRecord(null);
      setMonthsData([]);
    }
  }, [activeHousehold, selectedPeriod, currentPeriod]);

  const closeMonth = async (monthId: string) => {
    try {
      // Congelamos el saldo de cierre tal como lo muestra la app en este momento
      const calculated = calculateEncainedFinances(
        monthsData, allIncomes, allExpenses, allUnplannedExpenses, installments, savingsConfig,
        activeHousehold?.billing_cycle_start_day || 10, savingsAllocations
      );
      const target = monthsData.find((m) => m.id === monthId);
      const closing = target
        ? calculated.find((c) => c.year === target.year && c.month === target.month)
        : undefined;

      let { error } = await supabase
        .from('months')
        .update({
          status: 'closed',
          closing_balance: closing ? closing.finalBalance : null,
          closed_at: new Date().toISOString()
        })
        .eq('id', monthId);

      // Si falta la migración del saldo de cierre, cerramos igualmente sin congelarlo
      if (error && isMissingSchemaError(error)) {
        ({ error } = await supabase.from('months').update({ status: 'closed' }).eq('id', monthId));
        if (!error) showToast('Mes cerrado sin congelar el saldo: falta ejecutar migration_month_closing_balance.sql', 'info');
      } else if (!error) {
        showToast('Mes cerrado correctamente. El saldo de cierre quedó fijo.', 'info');
      }

      if (error) throw error;
      await loadPeriodRecord();
    } catch (e) {
      showToast('Error al cerrar el mes', 'error');
    }
  };

  const reopenMonth = async (monthId: string) => {
    if (userRole !== 'admin') {
      showToast('Solo el administrador puede reabrir un mes', 'error');
      return;
    }
    try {
      let { error } = await supabase
        .from('months')
        .update({ status: 'open', closing_balance: null, closed_at: null })
        .eq('id', monthId);

      if (error && isMissingSchemaError(error)) {
        ({ error } = await supabase.from('months').update({ status: 'open' }).eq('id', monthId));
      }

      if (error) throw error;

      showToast('Mes reabierto correctamente', 'success');
      await loadPeriodRecord();
    } catch (e) {
      showToast('Error al reabrir el mes', 'error');
    }
  };

  // -------------------------------------------------------------------
  // CARGA DE DATOS FINANCIEROS Y TIEMPO REAL (Supabase Realtime)
  // -------------------------------------------------------------------
  const runLoadFinancialData = async () => {
    if (!activeHousehold || !activeMonthRecord) return;
    setLoadingData(true);
    try {
      // 1. Cargar ahorros iniciales
      const { data: sc, error: scError } = await supabase
        .from('savings_config')
        .select('*')
        .eq('household_id', activeHousehold.id)
        .single();
      
      if (!scError && sc) {
        setSavingsConfig(sc);
      }

      // 2. Cargar compras en cuotas (installments) activas globales del hogar
      const { data: insts, error: iError } = await supabase
        .from('installments')
        .select('*')
        .eq('household_id', activeHousehold.id);

      if (!iError && insts) {
        setInstallments(insts);
      }

      // 3. Cargar perfiles de usuario en memoria para evitar errores de relación/FK en PostgREST
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, display_name');

      const profilesMap = new Map<string, { display_name: string }>();
      if (allProfiles) {
        allProfiles.forEach((p) => {
          profilesMap.set(p.id, { display_name: p.display_name });
        });
      }

      // 4. Obtener todos los IDs de meses de este hogar de forma robusta e independiente de la asincronía de estados
      const { data: dbMonths } = await supabase
        .from('months')
        .select('id, year, month')
        .eq('household_id', activeHousehold.id);
      
      const dbMonthIds = dbMonths ? dbMonths.map((m) => m.id) : [];

      // 4.1. Cargar ingresos del período seleccionado y del hogar completo
      let incs: any[] = [];
      let incError: any = null;

      if (dbMonthIds.length > 0) {
        const { data, error } = await supabase
          .from('incomes')
          .select('*')
          .in('month_id', dbMonthIds);
        incs = data || [];
        incError = error;
      } else {
        const { data, error } = await supabase
          .from('incomes')
          .select('*')
          .eq('month_id', activeMonthRecord.id);
        incs = data || [];
        incError = error;
      }
 
      // 5. Cargar gastos del período seleccionado y del hogar completo
      let exps: any[] = [];
      let expError: any = null;

      if (dbMonthIds.length > 0) {
        const { data, error } = await supabase
          .from('expenses')
          .select(`
            *,
            expense_categories (*)
          `)
          .in('month_id', dbMonthIds);
        exps = data || [];
        expError = error;
      } else {
        const { data, error } = await supabase
          .from('expenses')
          .select(`
            *,
            expense_categories (*)
          `)
          .eq('month_id', activeMonthRecord.id);
        exps = data || [];
        expError = error;
      }
 
      // Autocorrección de desalineaciones históricas de mes: se resuelve antes de enriquecer los
      // datos para que el estado ya refleje el mes correcto (sin recargar en cascada).
      if (dbMonths && dbMonths.length > 0) {
        const startDay = activeHousehold.billing_cycle_start_day || 10;
        const knownMonths: { id: string; year: number; month: number }[] = [...dbMonths];

        const healMonthAlignment = async (rows: any[], table: 'incomes' | 'expenses') => {
          const fixes: { id: string; month_id: string }[] = [];
          for (const row of rows) {
            const correct = getFinancialPeriod(row.date, startDay);
            const current = knownMonths.find((m) => m.id === row.month_id);
            if (current && current.year === correct.year && current.month === correct.month) continue;

            let target = knownMonths.find((m) => m.year === correct.year && m.month === correct.month);
            if (!target) {
              try {
                target = (await ensureMonthRecord(correct.year, correct.month)).record;
                knownMonths.push(target);
              } catch (err) {
                console.error(`Error creating month on auto-heal for ${table}:`, err);
                continue;
              }
            }
            row.month_id = target.id;
            fixes.push({ id: row.id, month_id: target.id });
          }

          await Promise.all(
            fixes.map(async (f) => {
              const { error } = await supabase.from(table).update({ month_id: f.month_id }).eq('id', f.id);
              if (error) console.error(`Error auto-healing ${table} month_id:`, error);
            })
          );
        };

        if (!incError) await healMonthAlignment(incs, 'incomes');
        if (!expError) await healMonthAlignment(exps, 'expenses');
      }

      if (!incError && incs) {
        const enrichedIncs = incs.map((i) => ({
          ...i,
          is_recurring: !!i.is_recurring,
          profiles: i.created_by ? profilesMap.get(i.created_by) || null : null
        }));
        setAllIncomes(enrichedIncs as unknown as Income[]);
        setIncomes(enrichedIncs.filter((i) => i.month_id === activeMonthRecord.id) as unknown as Income[]);
      }
 
      if (!expError && exps) {
        const todayLocal = new Date();
        const yyyy = todayLocal.getFullYear();
        const mm = String(todayLocal.getMonth() + 1).padStart(2, '0');
        const dd = String(todayLocal.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const enrichedExps = exps.map((e) => ({
          ...e,
          // Conciliación explícita (reconciled) o, si es null, automática según la fecha
          is_reconciled: e.reconciled ?? e.date <= todayStr,
          has_explicit_debited: e.reconciled === true,
          has_explicit_pending: e.reconciled === false,
          profiles: e.created_by ? profilesMap.get(e.created_by) || null : null
        }));
        setAllExpenses(enrichedExps as unknown as Expense[]);
        setExpenses(enrichedExps.filter((e) => e.month_id === activeMonthRecord.id) as unknown as Expense[]);
      }

      // 6. Cargar gastos extraordinarios (unplanned_expenses) de todo el hogar: el saldo encadenado
      // necesita los de todos los meses, no solo los del período seleccionado.
      const { data: unps, error: unpError } = await supabase
        .from('unplanned_expenses')
        .select('*')
        .eq('household_id', activeHousehold.id);

      if (!unpError && unps) {
        const enrichedUnps = unps.map((u) => ({
          ...u,
          profiles: u.created_by ? profilesMap.get(u.created_by) || null : null
        })) as unknown as UnplannedExpense[];
        setAllUnplannedExpenses(enrichedUnps);
        setUnplannedExpenses(enrichedUnps.filter((u) => u.month_id === activeMonthRecord.id));
      }

      // 7. Cargar cuentas de ahorro, asignaciones mensuales y sus gastos (opcional: requiere migración)
      const { data: sAccs, error: sAccsError } = await supabase
        .from('savings_accounts')
        .select('*')
        .eq('household_id', activeHousehold.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (sAccsError) {
        if (isMissingSchemaError(sAccsError)) {
          setSavingsAccountsReady(false);
          setSavingsAccounts([]);
          setSavingsAllocations([]);
          setSavingsAccountExpenses([]);
        }
      } else {
        setSavingsAccountsReady(true);
        setSavingsAccounts((sAccs || []) as SavingsAccount[]);

        const { data: sAllocs, error: sAllocsError } = await supabase
          .from('savings_allocations')
          .select('*')
          .eq('household_id', activeHousehold.id);
        if (!sAllocsError) setSavingsAllocations((sAllocs || []) as SavingsAllocation[]);

        const { data: sExps, error: sExpsError } = await supabase
          .from('savings_account_expenses')
          .select('*')
          .eq('household_id', activeHousehold.id)
          .order('date', { ascending: false });
        if (!sExpsError) setSavingsAccountExpenses((sExps || []) as SavingsAccountExpense[]);
      }

    } catch (e) {
      console.error('Error loading financial data', e);
      showToast('Error al cargar datos financieros', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  // Mantiene siempre la última versión de la carga (evita closures viejos en cargas encoladas)
  useEffect(() => {
    runLoadFinancialDataRef.current = runLoadFinancialData;
  });

  // Serializa las cargas: si llega una mientras otra está en curso (p. ej. ráfagas de Realtime),
  // se encola una sola repetición al terminar, en vez de lanzar cargas simultáneas que se pisan.
  const loadFinancialData = async (): Promise<void> => {
    if (financialLoadInFlightRef.current) {
      financialLoadPendingRef.current = true;
      return financialLoadInFlightRef.current;
    }
    const run = (async () => {
      try {
        do {
          financialLoadPendingRef.current = false;
          await runLoadFinancialDataRef.current();
        } while (financialLoadPendingRef.current);
      } finally {
        financialLoadInFlightRef.current = null;
      }
    })();
    financialLoadInFlightRef.current = run;
    return run;
  };

  useEffect(() => {
    if (activeHousehold && activeMonthRecord) {
      loadFinancialData();
    } else {
      setIncomes([]);
      setExpenses([]);
      setUnplannedExpenses([]);
      setAllUnplannedExpenses([]);
      setInstallments([]);
      setSavingsConfig(null);
      setSavingsAccounts([]);
      setSavingsAllocations([]);
      setSavingsAccountExpenses([]);
    }
  }, [activeHousehold, activeMonthRecord]);

  // SUSCRIPCIÓN EN TIEMPO REAL (SUPABASE REALTIME)
  useEffect(() => {
    if (!activeHousehold || !activeMonthRecord) return;

    // Canal en tiempo real para cambios en vivo colaborativos
    const channel = supabase
      .channel(`household_realtime_${activeHousehold.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incomes' },
        () => loadFinancialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => loadFinancialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'unplanned_expenses', filter: `household_id=eq.${activeHousehold.id}` },
        () => loadFinancialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'installments', filter: `household_id=eq.${activeHousehold.id}` },
        () => loadFinancialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'savings_config', filter: `household_id=eq.${activeHousehold.id}` },
        () => loadFinancialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expense_categories', filter: `household_id=eq.${activeHousehold.id}` },
        () => refreshCategories()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'months', filter: `household_id=eq.${activeHousehold.id}` },
        () => loadPeriodRecord()
      );

    // Las tablas de cuentas de ahorro solo se escuchan si la migración ya está aplicada
    if (savingsAccountsReady) {
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'savings_accounts', filter: `household_id=eq.${activeHousehold.id}` },
          () => loadFinancialData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'savings_allocations', filter: `household_id=eq.${activeHousehold.id}` },
          () => loadFinancialData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'savings_account_expenses', filter: `household_id=eq.${activeHousehold.id}` },
          () => loadFinancialData()
        );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeHousehold, activeMonthRecord, savingsAccountsReady]);

  const getOrCreateMonthIdForDate = async (dateStr: string): Promise<string> => {
    if (!activeHousehold) throw new Error("No active household");
    const startDay = activeHousehold.billing_cycle_start_day;
    const period = getFinancialPeriod(dateStr, startDay);
    
    // Buscar en la lista local de meses
    let record = monthsData.find(m => m.year === period.year && m.month === period.month);
    if (record) return record.id;
    
    // Si no está local, lo buscamos o creamos en la base de datos
    const { record: ensured } = await ensureMonthRecord(period.year, period.month);
    return ensured.id;
  };

  // -------------------------------------------------------------------
  // SERIES RECURRENTES (ingresos y gastos que se repiten cada mes)
  // -------------------------------------------------------------------
  // Fecha física de una copia mensual: respeta el día de la serie, el ciclo de facturación
  // (un día anterior al inicio de ciclo cae en el mes calendario siguiente) y el largo del mes.
  const recurringDateFor = (day: number, year: number, month: number): string => {
    const startDay = activeHousehold?.billing_cycle_start_day ?? 10;
    let y = year;
    let m = month;
    if (day < startDay) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  };

  // Meses abiertos o en planificación posteriores a un período (los cerrados no se tocan)
  const getEditableMonthsAfter = async (year: number, month: number): Promise<Month[]> => {
    if (!activeHousehold) return [];
    const { data } = await supabase
      .from('months')
      .select('*')
      .eq('household_id', activeHousehold.id)
      .in('status', ['open', 'planning']);
    return ((data || []) as Month[]).filter((m) => m.year > year || (m.year === year && m.month > month));
  };

  // Filas recurrentes de la misma serie en los meses editables posteriores a un período
  const findFutureSeriesRows = async (
    table: 'incomes' | 'expenses',
    target: { description: string; recurrence_group_id?: string | null },
    year: number,
    month: number
  ) => {
    const futureMonths = await getEditableMonthsAfter(year, month);
    if (futureMonths.length === 0) return { rows: [] as any[], futureMonths };
    const { data } = await supabase
      .from(table)
      .select('id, month_id, description, recurrence_group_id')
      .in('month_id', futureMonths.map((m) => m.id))
      .eq('is_recurring', true);
    const rows = (data || []).filter((r) => isSameSeries(target, r));
    return { rows, futureMonths };
  };

  // Aplica a las copias futuras los cambios generales (no importe ni fecha) y, si cambió el día,
  // recalcula la fecha de cada copia según su mes.
  const propagateToFutureSeries = async (
    table: 'incomes' | 'expenses',
    rows: any[],
    futureMonths: Month[],
    changes: Record<string, any>,
    newDate?: string,
    oldDate?: string
  ) => {
    if (rows.length === 0) return;
    const futurePayload: Record<string, any> = { ...changes };
    ['amount', 'date', 'month_id', 'id', 'is_recurring', 'recurrence_group_id', 'reconciled', 'adjustment_note']
      .forEach((k) => delete futurePayload[k]);

    if (Object.keys(futurePayload).length > 0) {
      const { error } = await supabase.from(table).update(futurePayload).in('id', rows.map((r) => r.id));
      if (error) console.error(`Error updating future ${table}:`, error);
    }

    const newDay = getDayOfMonth(newDate);
    if (newDate && newDate !== oldDate && newDay) {
      await Promise.all(
        rows.map(async (r) => {
          const m = futureMonths.find((fm) => fm.id === r.month_id);
          if (!m) return;
          const { error } = await supabase
            .from(table)
            .update({ date: recurringDateFor(newDay, m.year, m.month) })
            .eq('id', r.id);
          if (error) console.error(`Error updating future ${table} date:`, error);
        })
      );
    }
  };

  // -------------------------------------------------------------------
  // OPERACIONES FINANCIERAS
  // -------------------------------------------------------------------
  const addIncome = async (income: Omit<Income, 'id' | 'month_id' | 'created_by' | 'created_at'>) => {
    if (!activeMonthRecord || !user || !activeHousehold) return;
    try {
      const isRecurring = !!income.is_recurring;
      const groupId = isRecurring ? crypto.randomUUID() : null;
      const dbPayload = { ...income, is_recurring: isRecurring, recurrence_group_id: groupId };

      const calculatedMonthId = await getOrCreateMonthIdForDate(income.date);

      const { error } = await supabase
        .from('incomes')
        .insert({
          ...dbPayload,
          month_id: calculatedMonthId,
          created_by: user.id
        });

      if (error) throw error;

      // Si el ingreso es recurrente, lo propagamos a meses futuros ya existentes en la DB
      if (isRecurring) {
        try {
          const activePeriod = getFinancialPeriod(income.date, activeHousehold.billing_cycle_start_day);
          const futureMonths = await getEditableMonthsAfter(activePeriod.year, activePeriod.month);

          if (futureMonths.length > 0) {
            // Evitar duplicar si ya existe un ingreso con la misma descripción en ese mes futuro
            const { data: existingFutureIncomes } = await supabase
              .from('incomes')
              .select('month_id, description, recurrence_group_id')
              .in('month_id', futureMonths.map((m) => m.id));

            const existingMonthIds = new Set(
              (existingFutureIncomes || [])
                .filter((ei) => isSameSeries(ei, dbPayload))
                .map((ei) => ei.month_id)
            );

            const day = getDayOfMonth(income.date) ?? 10;
            const copiesToInsert = futureMonths
              .filter((m) => !existingMonthIds.has(m.id))
              .map((m) => ({
                ...dbPayload,
                month_id: m.id,
                created_by: user.id,
                date: recurringDateFor(day, m.year, m.month)
              }));

            if (copiesToInsert.length > 0) {
              await supabase.from('incomes').insert(copiesToInsert);
            }
          }
        } catch (propagateErr) {
          console.error('Error propagating recurring income:', propagateErr);
        }
      }

      showToast('Ingreso registrado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al registrar ingreso', 'error');
      throw e;
    }
  };

  const realizeProjectedIncome = async (projectedId: string): Promise<string> => {
    if (!activeHousehold || !user) throw new Error("No active household or user");
    
    const match = projectedId.match(/^proj-inc-(.+)-(\d+)-(\d+)$/);
    if (!match) throw new Error("Invalid projected ID format");
    
    let originalId = match[1];
    while (originalId.startsWith('proj-inc-')) {
      originalId = originalId.replace(/^proj-inc-/, '').replace(/-\d+-\d+$/, '');
    }
    const targetYear = parseInt(match[2], 10);
    const targetMonth = parseInt(match[3], 10);
    
    // 1. Asegurar que el mes de destino exista en la base de datos
    let targetMonthRecord = monthsData.find(m => m.year === targetYear && m.month === targetMonth);
    if (!targetMonthRecord) {
      targetMonthRecord = (await ensureMonthRecord(targetYear, targetMonth)).record;
    }
    
    if (!targetMonthRecord) throw new Error("Target month record not found");
    
    // 2. Comprobar si el ingreso ya existe físicamente en este mes
    const { data: existingIncs } = await supabase
      .from('incomes')
      .select('*')
      .eq('month_id', targetMonthRecord.id);
      
    const { data: originalIncome } = await supabase
      .from('incomes')
      .select('*')
      .eq('id', originalId)
      .single();
      
    if (!originalIncome) throw new Error("Original income not found");
    
    const matchingCopiedInc = existingIncs?.find(i => isSameSeries(i, originalIncome));
    
    if (matchingCopiedInc) {
      return matchingCopiedInc.id;
    }
    
    // 3. Si no existe, creamos la copia física de la proyección en el mes de destino
    const day = getDayOfMonth(originalIncome.date) ?? 10;
    const targetDateStr = recurringDateFor(day, targetMonthRecord.year, targetMonthRecord.month);
    
    const { data: createdInc, error: createIncErr } = await supabase
      .from('incomes')
      .insert({
        description: originalIncome.description,
        amount: originalIncome.amount,
        date: targetDateStr,
        account: originalIncome.account,
        category: originalIncome.category,
        is_estimated: targetMonthRecord.status === 'planning',
        is_recurring: true,
        recurrence_group_id: originalIncome.recurrence_group_id ?? null,
        month_id: targetMonthRecord.id,
        created_by: user.id
      })
      .select()
      .single();
      
    if (createIncErr || !createdInc) {
      console.error("Error creating physical copy of projected income:", createIncErr);
      throw new Error("Error materializing projected income");
    }
    
    return createdInc.id;
  };

  const updateIncome = async (id: string, income: Partial<Income>, adjustmentNote?: string) => {
    if (!activeHousehold || !activeMonthRecord) return;
    try {
      let targetId = id;
      if (id.startsWith('proj-inc-')) {
        targetId = await realizeProjectedIncome(id);
      }

      // 1. Obtener detalles del ingreso antes de actualizarlo
      const { data: targetIncome } = await supabase
        .from('incomes')
        .select('*')
        .eq('id', targetId)
        .single();

      if (!targetIncome) throw new Error('Ingreso no encontrado');

      // 2. Si es un ingreso recurrente, propagar los cambios generales a las copias futuras de la serie
      if (targetIncome.is_recurring) {
        const { data: originMonth } = await supabase
          .from('months')
          .select('year, month')
          .eq('id', targetIncome.month_id)
          .single();

        if (originMonth) {
          const { rows, futureMonths } = await findFutureSeriesRows(
            'incomes', targetIncome, originMonth.year, originMonth.month
          );
          await propagateToFutureSeries('incomes', rows, futureMonths, income, income.date, targetIncome.date);
        }
      }

      // 3. Actualizar el ingreso actual
      const payload: Record<string, any> = { ...income };
      if (income.is_recurring === true && !targetIncome.recurrence_group_id) {
        payload.recurrence_group_id = crypto.randomUUID();
      } else if (income.is_recurring === false) {
        payload.recurrence_group_id = null;
      }

      if (income.date) {
        payload.month_id = await getOrCreateMonthIdForDate(income.date);
      }

      const { error } = await supabase
        .from('incomes')
        .update(payload)
        .eq('id', targetId);

      if (error) throw error;
      showToast('Ingreso actualizado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      console.error('Error in updateIncome:', e);
      showToast('Error al actualizar ingreso', 'error');
      throw e;
    }
  };

  const deleteIncome = async (id: string, deleteFuture = false) => {
    if (!activeHousehold || !activeMonthRecord) return;
    try {
      let targetId = id;
      if (id.startsWith('proj-inc-')) {
        targetId = await realizeProjectedIncome(id);
      }

      // 1. Obtener detalles del ingreso antes de borrarlo
      const { data: targetIncome } = await supabase
        .from('incomes')
        .select('*')
        .eq('id', targetId)
        .single();

      if (!targetIncome) throw new Error('Ingreso no encontrado');

      // 2. Borrar el ingreso seleccionado
      const { error } = await supabase
        .from('incomes')
        .delete()
        .eq('id', targetId);

      if (error) throw error;

      // 3. Si deleteFuture es true, borrar las copias de la misma serie en los meses siguientes
      if (deleteFuture && targetIncome.is_recurring) {
        try {
          const { data: originMonth } = await supabase
            .from('months')
            .select('year, month')
            .eq('id', targetIncome.month_id)
            .single();

          if (originMonth) {
            const { rows } = await findFutureSeriesRows('incomes', targetIncome, originMonth.year, originMonth.month);
            if (rows.length > 0) {
              await supabase.from('incomes').delete().in('id', rows.map((r) => r.id));
            }
          }
        } catch (futureErr) {
          console.error('Error deleting future incomes:', futureErr);
        }
      }

      showToast('Ingreso eliminado', 'info');
      loadFinancialData();
    } catch (e) {
      showToast('Error al eliminar ingreso', 'error');
    }
  };

  const addExpense = async (expense: Omit<Expense, 'id' | 'month_id' | 'created_by' | 'created_at'>) => {
    if (!activeMonthRecord || !user || !activeHousehold) return;
    try {
      const isRecurring = !!expense.is_recurring;
      const dbPayload = {
        ...expense,
        is_recurring: isRecurring,
        recurrence_group_id: isRecurring ? crypto.randomUUID() : null
      };

      const calculatedMonthId = await getOrCreateMonthIdForDate(expense.date);
      // 1. Insertar el gasto en el mes activo
      const { error } = await supabase
        .from('expenses')
        .insert({
          ...dbPayload,
          month_id: calculatedMonthId,
          created_by: user.id
        });

      if (error) throw error;

      // 2. Si el gasto es recurrente, lo propagamos a meses futuros ya existentes en la DB
      if (isRecurring) {
        try {
          const activePeriod = getFinancialPeriod(expense.date, activeHousehold.billing_cycle_start_day);
          const futureMonths = await getEditableMonthsAfter(activePeriod.year, activePeriod.month);

          if (futureMonths.length > 0) {
            const day = getDayOfMonth(expense.date) ?? 10;
            const copiesToInsert = futureMonths.map((m) => ({
              ...dbPayload,
              month_id: m.id,
              created_by: user.id,
              date: recurringDateFor(day, m.year, m.month)
            }));

            await supabase.from('expenses').insert(copiesToInsert);
          }
        } catch (propagateErr) {
          console.error('Error propagating recurring expense:', propagateErr);
        }
      }

      showToast('Gasto registrado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al registrar gasto', 'error');
      throw e;
    }
  };

  const realizeProjectedExpense = async (projectedId: string): Promise<string> => {
    if (!activeHousehold || !user) throw new Error("No active household or user");
    
    const match = projectedId.match(/^proj-exp-(.+)-(\d+)-(\d+)$/);
    if (!match) throw new Error("Invalid projected ID format");
    
    let originalId = match[1];
    while (originalId.startsWith('proj-exp-')) {
      originalId = originalId.replace(/^proj-exp-/, '').replace(/-\d+-\d+$/, '');
    }
    const targetYear = parseInt(match[2], 10);
    const targetMonth = parseInt(match[3], 10);
    
    // 1. Asegurar que el mes de destino exista en la base de datos
    let targetMonthRecord = monthsData.find(m => m.year === targetYear && m.month === targetMonth);
    if (!targetMonthRecord) {
      targetMonthRecord = (await ensureMonthRecord(targetYear, targetMonth)).record;
    }
    
    if (!targetMonthRecord) throw new Error("Target month record not found");
    
    // 2. Comprobar si el gasto ya existe físicamente en este mes
    const { data: existingExps } = await supabase
      .from('expenses')
      .select('*')
      .eq('month_id', targetMonthRecord.id);
      
    const { data: originalExpense } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', originalId)
      .single();
      
    if (!originalExpense) throw new Error("Original expense not found");
    
    const matchingCopiedExp = existingExps?.find(e => !e.installment_id && isSameSeries(e, originalExpense));
    
    if (matchingCopiedExp) {
      return matchingCopiedExp.id;
    }
    
    // 3. Si no existe, creamos la copia física de la proyección en el mes de destino
    const day = getDayOfMonth(originalExpense.date) ?? 10;
    const targetDateStr = recurringDateFor(day, targetMonthRecord.year, targetMonthRecord.month);
    
    const { data: createdExp, error: createExpErr } = await supabase
      .from('expenses')
      .insert({
        description: originalExpense.description,
        amount: originalExpense.amount,
        date: targetDateStr,
        account: originalExpense.account,
        holder: originalExpense.holder,
        category_id: originalExpense.category_id,
        is_planned: originalExpense.is_planned,
        notes: originalExpense.notes,
        is_recurring: true,
        recurrence_group_id: originalExpense.recurrence_group_id ?? null,
        month_id: targetMonthRecord.id,
        created_by: user.id
      })
      .select()
      .single();
      
    if (createExpErr || !createdExp) {
      console.error("Error creating physical copy of projected expense:", createExpErr);
      throw new Error("Error materializing projected expense");
    }
    
    return createdExp.id;
  };

  const realizeMockInstallment = async (mockId: string): Promise<string> => {
    if (!activeHousehold || !user) throw new Error("No active household or user");
    
    // Parsear el ID: inst-mock-${installmentId}-${installmentNumber}
    const match = mockId.match(/^inst-mock-(.+)-(\d+)$/);
    if (!match) throw new Error("Invalid mock installment ID format");
    
    const installmentId = match[1];
    const installmentNumber = parseInt(match[2], 10);
    
    // 1. Obtener la compra en cuotas (installment) desde la base de datos
    const { data: inst } = await supabase
      .from('installments')
      .select('*')
      .eq('id', installmentId)
      .single();
      
    if (!inst) throw new Error("Installment not found");
    
    // 2. Determinar el año y mes correspondientes a esta cuota
    const billingCycleStartDay = activeHousehold.billing_cycle_start_day;
    const firstDebitPeriod = getFinancialPeriod(
      new Date(inst.first_debit_year, inst.first_debit_month - 1, inst.first_debit_day || 10),
      billingCycleStartDay
    );
    
    let targetMonth = firstDebitPeriod.month + (installmentNumber - 1);
    let targetYear = firstDebitPeriod.year;
    while (targetMonth > 12) {
      targetMonth -= 12;
      targetYear += 1;
    }
    
    // 3. Asegurar que el mes exista en la base de datos
    let targetMonthRecord = monthsData.find(m => m.year === targetYear && m.month === targetMonth);
    if (!targetMonthRecord) {
      targetMonthRecord = (await ensureMonthRecord(targetYear, targetMonth)).record;
    }

    if (!targetMonthRecord) throw new Error("Target month record not found");
    
    // 4. Comprobar si ya existe el gasto de esta cuota física en la base de datos
    const { data: existingExps } = await supabase
      .from('expenses')
      .select('*')
      .eq('month_id', targetMonthRecord.id)
      .eq('installment_id', installmentId)
      .eq('installment_number', installmentNumber);
      
    if (existingExps && existingExps.length > 0) {
      return existingExps[0].id;
    }
    
    // 5. Si no existe, crear la cuota física en la base de datos
    const day = inst.first_debit_day || 10;
    let expYear = targetMonthRecord.year;
    let expMonth = targetMonthRecord.month;
    if (day < billingCycleStartDay) {
      expMonth += 1;
      if (expMonth > 12) {
        expMonth = 1;
        expYear += 1;
      }
    }
    const lastDayOfTargetMonth = new Date(expYear, expMonth, 0).getDate();
    const targetDay = Math.min(day, lastDayOfTargetMonth);
    const targetDateStr = `${expYear}-${String(expMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
    
    // Obtener la categoría 'Cuotas' para el hogar
    const cuotasCat = categories.find(c => c.name.toLowerCase() === 'cuotas');
    const categoryId = cuotasCat ? cuotasCat.id : (categories[0]?.id || '');
    
    const { data: createdExp, error: createExpErr } = await supabase
      .from('expenses')
      .insert({
        description: `${inst.description} (Cuota ${installmentNumber}/${inst.num_installments})`,
        amount: Number(inst.amount_per_installment),
        date: targetDateStr,
        account: inst.account,
        holder: inst.payment_type === 'credit_card' ? 'Tarjeta' : 'Cuenta',
        category_id: categoryId,
        is_planned: targetMonthRecord.status === 'planning',
        notes: inst.notes,
        is_recurring: false,
        month_id: targetMonthRecord.id,
        installment_id: inst.id,
        installment_number: installmentNumber,
        created_by: user.id
      })
      .select()
      .single();
      
    if (createExpErr || !createdExp) {
      console.error("Error creating physical copy of installment:", createExpErr);
      throw new Error("Error materializing mock installment");
    }
    
    return createdExp.id;
  };

  const updateExpense = async (id: string, expense: Partial<Expense>, adjustmentNote?: string) => {
    if (!activeHousehold || !activeMonthRecord) return;
    try {
      let targetId = id;
      if (id.startsWith('proj-exp-')) {
        targetId = await realizeProjectedExpense(id);
      } else if (id.startsWith('inst-mock-')) {
        targetId = await realizeMockInstallment(id);
      }

      // 1. Obtener detalles del gasto antes de actualizarlo para identificar clones futuros
      const { data: targetExpense, error: targetError } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', targetId)
        .single();

      if (targetError || !targetExpense) {
        console.error('Error updateExpense: gasto no encontrado', targetError);
        throw new Error('Gasto no encontrado');
      }

      // 2. Si es recurrente y hay cambios generales (no solo de conciliación, importe o fecha),
      //    propagarlos a las copias futuras de la serie
      const hasGeneralChanges =
        (expense.category_id !== undefined && expense.category_id !== targetExpense.category_id) ||
        (expense.account !== undefined && expense.account !== targetExpense.account) ||
        (expense.holder !== undefined && expense.holder !== targetExpense.holder) ||
        (expense.notes !== undefined && expense.notes !== targetExpense.notes) ||
        (expense.description !== undefined && expense.description !== targetExpense.description);
      const hasDateChange = !!expense.date && expense.date !== targetExpense.date;

      if (targetExpense.is_recurring && (hasGeneralChanges || hasDateChange)) {
        const { data: originMonth } = await supabase
          .from('months')
          .select('year, month')
          .eq('id', targetExpense.month_id)
          .single();

        if (originMonth) {
          const { rows, futureMonths } = await findFutureSeriesRows(
            'expenses', targetExpense, originMonth.year, originMonth.month
          );
          await propagateToFutureSeries('expenses', rows, futureMonths, expense, expense.date, targetExpense.date);
        }
      }

      // 3. Actualizar el gasto actual
      const payload: Record<string, any> = { ...expense };
      if (activeMonthRecord?.status === 'closed' && adjustmentNote) {
        payload.adjustment_note = adjustmentNote;
      }
      if (expense.is_recurring === true && !targetExpense.recurrence_group_id) {
        payload.recurrence_group_id = crypto.randomUUID();
      } else if (expense.is_recurring === false) {
        payload.recurrence_group_id = null;
      }

      if (expense.date) {
        payload.month_id = await getOrCreateMonthIdForDate(expense.date);
      }

      const { error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', targetId);

      if (error) throw error;

      showToast('Gasto actualizado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      console.error('Error in updateExpense:', e);
      showToast('Error al actualizar gasto', 'error');
      throw e;
    }
  };

  const deleteExpense = async (id: string, deleteFuture = false) => {
    if (!activeHousehold || !activeMonthRecord) return;
    try {
      let targetId = id;
      if (id.startsWith('proj-exp-')) {
        targetId = await realizeProjectedExpense(id);
      } else if (id.startsWith('inst-mock-')) {
        targetId = await realizeMockInstallment(id);
      }

      // 1. Obtener detalles del gasto antes de borrarlo
      const { data: targetExpense } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', targetId)
        .single();

      if (!targetExpense) throw new Error('Gasto no encontrado');

      // 2. Si se solicitó borrar futuros y es un gasto recurrente, borrar las copias de la serie
      if (deleteFuture && targetExpense.is_recurring) {
        const { data: originMonth } = await supabase
          .from('months')
          .select('year, month')
          .eq('id', targetExpense.month_id)
          .single();

        if (originMonth) {
          const { rows } = await findFutureSeriesRows('expenses', targetExpense, originMonth.year, originMonth.month);
          if (rows.length > 0) {
            const { error: deleteFutureError } = await supabase
              .from('expenses')
              .delete()
              .in('id', rows.map((r) => r.id));

            if (deleteFutureError) {
              console.error('Error deleting future recurrings:', deleteFutureError);
            }
          }
        }
      }

      // 3. Eliminar el gasto actual
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', targetId);

      if (error) throw error;
      showToast('Gasto eliminado', 'info');
      loadFinancialData();
    } catch (e) {
      console.error('Error in deleteExpense:', e);
      showToast('Error al eliminar gasto', 'error');
    }
  };

  const addInstallment = async (installment: Omit<Installment, 'id' | 'household_id' | 'created_by' | 'created_at'>) => {
    if (!activeHousehold || !user) return;
    try {
      // 1. Intentar insertar con la nueva columna first_debit_day
      const { error } = await supabase
        .from('installments')
        .insert({
          ...installment,
          household_id: activeHousehold.id,
          created_by: user.id
        });

      if (error) {
        // Fallback defensivo: si falla por columna no encontrada (ej. por no correr la migración SQL aún)
        console.warn('Fallo al registrar con columna first_debit_day. Reintentando sin ella...', error);
        const { first_debit_day, ...fallbackInstallment } = installment as any;
        const { error: fallbackError } = await supabase
          .from('installments')
          .insert({
            ...fallbackInstallment,
            household_id: activeHousehold.id,
            created_by: user.id
          });
          
        if (fallbackError) throw fallbackError;
      }
      
      showToast('Compra en cuotas registrada. Se proyectará automáticamente.', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al registrar cuotas', 'error');
      throw e;
    }
  };

  const cancelInstallment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('installments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Compra en cuotas cancelada', 'info');
      loadFinancialData();
    } catch (e) {
      showToast('Error al cancelar compra a plazos', 'error');
    }
  };

  const updateInstallment = async (id: string, installment: Partial<Installment>) => {
    try {
      // 1. Intentar actualizar con la nueva columna first_debit_day
      const { error } = await supabase
        .from('installments')
        .update(installment)
        .eq('id', id);

      if (error) {
        // Fallback defensivo si la columna no existe
        console.warn('Fallo al actualizar con columna first_debit_day. Reintentando sin ella...', error);
        const { first_debit_day, ...fallbackInstallment } = installment as any;
        const { error: fallbackError } = await supabase
          .from('installments')
          .update(fallbackInstallment)
          .eq('id', id);
          
        if (fallbackError) throw fallbackError;
      }
      
      showToast('Cuota/Préstamo actualizado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al actualizar cuota/préstamo', 'error');
      throw e;
    }
  };

  const addUnplannedExpense = async (unplanned: Omit<UnplannedExpense, 'id' | 'household_id' | 'month_id' | 'created_by' | 'created_at'>) => {
    if (!activeHousehold || !activeMonthRecord || !user) return;
    try {
      const { error } = await supabase
        .from('unplanned_expenses')
        .insert({
          ...unplanned,
          month_id: activeMonthRecord.id,
          household_id: activeHousehold.id,
          created_by: user.id
        });

      if (error) throw error;
      showToast('Gasto imprevisto registrado. Afectará tus ahorros.', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al registrar gasto imprevisto', 'error');
      throw e;
    }
  };

  const deleteUnplannedExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('unplanned_expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Gasto imprevisto eliminado', 'info');
      loadFinancialData();
    } catch (e) {
      showToast('Error al eliminar gasto imprevisto', 'error');
    }
  };

  const updateUnplannedExpense = async (id: string, unplanned: Partial<UnplannedExpense>) => {
    try {
      const { error } = await supabase
        .from('unplanned_expenses')
        .update(unplanned)
        .eq('id', id);

      if (error) throw error;
      showToast('Gasto imprevisto actualizado', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al actualizar gasto imprevisto', 'error');
      throw e;
    }
  };

  const updateSavingsConfig = async (balance: number) => {
    if (!activeHousehold) return;
    try {
      const { error } = await supabase
        .from('savings_config')
        .upsert({
          household_id: activeHousehold.id,
          initial_balance: balance,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      showToast('Saldo inicial de ahorros actualizado', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al actualizar saldo inicial', 'error');
    }
  };

  // -------------------------------------------------------------------
  // RESTABLECER SALDO DEL FONDO DE AHORRO (ANCLA A UN MES CERRADO)
  // -------------------------------------------------------------------
  const resetSavingsBalance = async (year: number, month: number, balance: number, previousComputed: number) => {
    if (!activeHousehold) return;
    try {
      const { error } = await supabase
        .from('savings_config')
        .upsert({
          household_id: activeHousehold.id,
          initial_balance: savingsConfig?.initial_balance ?? 0,
          anchor_year: year,
          anchor_month: month,
          anchor_balance: balance,
          anchor_previous_computed: previousComputed,
          anchor_set_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      showToast('Saldo de ahorros restablecido correctamente', 'success');
      await loadFinancialData();
    } catch (e) {
      showToast(isMissingSchemaError(e) ? SAVINGS_MIGRATION_MESSAGE : 'Error al restablecer el saldo de ahorros', 'error');
      throw e;
    }
  };

  const clearSavingsAnchor = async () => {
    if (!activeHousehold) return;
    try {
      const { error } = await supabase
        .from('savings_config')
        .update({
          anchor_year: null,
          anchor_month: null,
          anchor_balance: null,
          anchor_previous_computed: null,
          anchor_set_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('household_id', activeHousehold.id);

      if (error) throw error;
      showToast('Ajuste manual quitado. El saldo vuelve a calcularse automáticamente.', 'info');
      await loadFinancialData();
    } catch (e) {
      showToast(isMissingSchemaError(e) ? SAVINGS_MIGRATION_MESSAGE : 'Error al quitar el ajuste manual', 'error');
      throw e;
    }
  };

  // -------------------------------------------------------------------
  // CUENTAS DE AHORRO (Inversión, Cancelar deudas, ...)
  // -------------------------------------------------------------------
  const savingsAccountsError = (e: any, fallback: string) => {
    showToast(isMissingSchemaError(e) ? SAVINGS_MIGRATION_MESSAGE : fallback, 'error');
  };

  const addSavingsAccount = async (name: string, color: string) => {
    if (!activeHousehold || !user) return;
    try {
      const { error } = await supabase
        .from('savings_accounts')
        .insert({
          household_id: activeHousehold.id,
          name: name.trim(),
          color,
          sort_order: savingsAccounts.length,
          created_by: user.id
        });
      if (error) throw error;
      showToast('Cuenta de ahorro creada', 'success');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al crear la cuenta de ahorro');
      throw e;
    }
  };

  const updateSavingsAccount = async (id: string, patch: Partial<Pick<SavingsAccount, 'name' | 'color'>>) => {
    try {
      const { error } = await supabase
        .from('savings_accounts')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      showToast('Cuenta de ahorro actualizada', 'success');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al actualizar la cuenta de ahorro');
      throw e;
    }
  };

  const deleteSavingsAccount = async (id: string) => {
    try {
      // Las asignaciones y gastos de la cuenta se eliminan en cascada
      const { error } = await supabase
        .from('savings_accounts')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Cuenta de ahorro eliminada', 'info');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al eliminar la cuenta de ahorro');
      throw e;
    }
  };

  const setSavingsAllocation = async (accountId: string, year: number, month: number, kind: AllocationKind, value: number) => {
    if (!activeHousehold || !user) return;
    try {
      const { error } = await supabase
        .from('savings_allocations')
        .upsert(
          {
            household_id: activeHousehold.id,
            savings_account_id: accountId,
            year,
            month,
            kind,
            value,
            created_by: user.id
          },
          { onConflict: 'savings_account_id,year,month' }
        );
      if (error) throw error;
      showToast('Asignación del mes guardada', 'success');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al guardar la asignación');
      throw e;
    }
  };

  const deleteSavingsAllocation = async (id: string) => {
    try {
      const { error } = await supabase
        .from('savings_allocations')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Asignación eliminada. Ese importe vuelve al fondo principal.', 'info');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al eliminar la asignación');
      throw e;
    }
  };

  const addSavingsAccountExpense = async (
    expense: Pick<SavingsAccountExpense, 'savings_account_id' | 'description' | 'amount' | 'date' | 'notes'>
  ) => {
    if (!activeHousehold || !user) return;
    try {
      const { error } = await supabase
        .from('savings_account_expenses')
        .insert({
          ...expense,
          household_id: activeHousehold.id,
          created_by: user.id
        });
      if (error) throw error;
      showToast('Gasto registrado en la cuenta de ahorro', 'success');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al registrar el gasto');
      throw e;
    }
  };

  const updateSavingsAccountExpense = async (
    id: string,
    patch: Partial<Pick<SavingsAccountExpense, 'description' | 'amount' | 'date' | 'notes'>>
  ) => {
    try {
      const { error } = await supabase
        .from('savings_account_expenses')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      showToast('Gasto actualizado', 'success');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al actualizar el gasto');
      throw e;
    }
  };

  const deleteSavingsAccountExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('savings_account_expenses')
        .delete()
        .eq('id', id);
      if (error) throw error;
      showToast('Gasto eliminado', 'info');
      await loadFinancialData();
    } catch (e) {
      savingsAccountsError(e, 'Error al eliminar el gasto');
      throw e;
    }
  };

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        loadingAuth,
        logout,
        refreshAuth,
        
        households,
        activeHousehold,
        userRole,
        loadingHouseholds,
        householdsError,
        selectHousehold,
        createHousehold,
        joinHousehold,
        leaveHousehold,
        updateHouseholdSettings,
        loadHouseholds,
        
        categories,
        refreshCategories,
        
        currentPeriod,
        selectedPeriod,
        setSelectedPeriod,
        monthsData,
        activeMonthRecord,
        loadingPeriod,
        closeMonth,
        reopenMonth,
        
        incomes,
        allIncomes,
        expenses,
        allExpenses,
        unplannedExpenses,
        allUnplannedExpenses,
        installments,
        savingsConfig,
        savingsAccounts,
        savingsAllocations,
        savingsAccountExpenses,
        savingsAccountsReady,
        loadingData,
        
        addIncome,
        updateIncome,
        deleteIncome,
        addExpense,
        updateExpense,
        deleteExpense,
        addInstallment,
        cancelInstallment,
        updateInstallment,
        addUnplannedExpense,
        updateUnplannedExpense,
        deleteUnplannedExpense,
        updateSavingsConfig,
        resetSavingsBalance,
        clearSavingsAnchor,
        addSavingsAccount,
        updateSavingsAccount,
        deleteSavingsAccount,
        setSavingsAllocation,
        deleteSavingsAllocation,
        addSavingsAccountExpense,
        updateSavingsAccountExpense,
        deleteSavingsAccountExpense,
        
        theme,
        toggleTheme,
        toasts,
        showToast,
        removeToast
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
