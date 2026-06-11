import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Profile, Household, UserRole, ExpenseCategory, Month, 
  Income, Expense, Installment, UnplannedExpense, SavingsConfig
} from '../types';
import { getFinancialPeriod, arePeriodsEqual, FinancialPeriod } from '../utils/dateUtils';

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
  installments: Installment[];
  savingsConfig: SavingsConfig | null;
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
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [savingsConfig, setSavingsConfig] = useState<SavingsConfig | null>(null);
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
        // 1. Buscar hogar con ese código
        const { data: h, error: hError } = await supabase
          .from('households')
          .select('*')
          .eq('invite_code', inviteCode.trim().toUpperCase())
          .single();
        
        if (hError || !h) {
          throw new Error('Código de invitación no válido');
        }

        // 2. Unirse como colaborador
        const { error: mError } = await supabase
          .from('household_members')
          .insert({
            household_id: h.id,
            user_id: user.id,
            role: 'collaborator'
          });

        if (mError) {
          if (mError.code === '23505') {
            showToast('Ya perteneces a este hogar', 'info');
            return;
          }
          throw mError;
        }

        await loadHouseholds(user.id);
        showToast(`Te has unido al hogar "${h.name}"`, 'success');
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
        // Creamos el mes automáticamente
        const isFuture = selectedPeriod.year > currentPeriod.year || 
          (selectedPeriod.year === currentPeriod.year && selectedPeriod.month > currentPeriod.month);
        
        const status = isFuture ? 'planning' : 'open';

        const { data: newMonth, error: createError } = await supabase
          .from('months')
          .insert({
            household_id: activeHousehold.id,
            year: selectedPeriod.year,
            month: selectedPeriod.month,
            status
          })
          .select()
          .single();
        
        if (!createError && newMonth) {
          record = newMonth;
          setMonthsData((prev) => [...prev, newMonth].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month)));
          
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
                    month_id: newMonth.id,
                    created_by: exp.created_by
                  };
                });

                await supabase.from('expenses').insert(copies);
              }

              // 2. Copiar ingresos recurrentes (identificados por terminar con \u200B)
              const { data: prevIncomes } = await supabase
                .from('incomes')
                .select('*')
                .eq('month_id', prevMonthRecord.id);

              if (prevIncomes && prevIncomes.length > 0) {
                const recurringIncomes = prevIncomes.filter(inc => inc.description && inc.description.endsWith('\u200B'));

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
      const { error } = await supabase
        .from('months')
        .update({ status: 'closed' })
        .eq('id', monthId);

      if (error) throw error;
      
      showToast('Mes cerrado correctamente. Ahora es de solo lectura.', 'info');
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
      const { error } = await supabase
        .from('months')
        .update({ status: 'open' })
        .eq('id', monthId);

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
  const loadFinancialData = async () => {
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
 
      if (!incError && incs) {
        const enrichedIncs = incs.map((i) => {
          const isRecurring = i.description && i.description.endsWith('\u200B');
          return {
            ...i,
            description: isRecurring ? i.description.replace(/\u200B$/, '') : i.description,
            is_recurring: isRecurring,
            profiles: i.created_by ? profilesMap.get(i.created_by) || null : null
          };
        });
        setAllIncomes(enrichedIncs as unknown as Income[]);
        setIncomes(enrichedIncs.filter((i) => i.month_id === activeMonthRecord.id) as unknown as Income[]);
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
 
      // Autocorrección robusta de desalineaciones históricas de mes
      if (!incError && incs && dbMonths && dbMonths.length > 0) {
        const startDay = activeHousehold.billing_cycle_start_day || 10;
        for (const i of incs) {
          const correctPeriod = getFinancialPeriod(i.date, startDay);
          const currentMonthRecord = dbMonths.find(m => m.id === i.month_id);
          if (!currentMonthRecord || currentMonthRecord.year !== correctPeriod.year || currentMonthRecord.month !== correctPeriod.month) {
            const correctMonthRecord = dbMonths.find(m => m.year === correctPeriod.year && m.month === correctPeriod.month);
            if (correctMonthRecord) {
              i.month_id = correctMonthRecord.id;
              supabase
                .from('incomes')
                .update({ month_id: correctMonthRecord.id })
                .eq('id', i.id)
                .then(({ error }) => {
                  if (error) console.error('Error auto-healing income month_id:', error);
                });
            } else {
              const isFuture = correctPeriod.year > currentPeriod.year || 
                (correctPeriod.year === currentPeriod.year && correctPeriod.month > currentPeriod.month);
              const status = isFuture ? 'planning' : 'open';
              
              const createAndMigrate = async () => {
                try {
                  const { data: newMonth, error: createError } = await supabase
                    .from('months')
                    .insert({
                      household_id: activeHousehold.id,
                      year: correctPeriod.year,
                      month: correctPeriod.month,
                      status
                    })
                    .select()
                    .single();
                    
                  if (!createError && newMonth) {
                    dbMonths.push(newMonth);
                    setMonthsData((prev) => [...prev, newMonth].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month)));
                    
                    i.month_id = newMonth.id;
                    await supabase
                      .from('incomes')
                      .update({ month_id: newMonth.id })
                      .eq('id', i.id);
                      
                    loadFinancialData();
                  }
                } catch (err) {
                  console.error('Error creating month on auto-heal for income:', err);
                }
              };
              createAndMigrate();
            }
          }
        }
      }

      if (!expError && exps && dbMonths && dbMonths.length > 0) {
        const startDay = activeHousehold.billing_cycle_start_day || 10;
        for (const e of exps) {
          const correctPeriod = getFinancialPeriod(e.date, startDay);
          const currentMonthRecord = dbMonths.find(m => m.id === e.month_id);
          if (!currentMonthRecord || currentMonthRecord.year !== correctPeriod.year || currentMonthRecord.month !== correctPeriod.month) {
            const correctMonthRecord = dbMonths.find(m => m.year === correctPeriod.year && m.month === correctPeriod.month);
            if (correctMonthRecord) {
              e.month_id = correctMonthRecord.id;
              supabase
                .from('expenses')
                .update({ month_id: correctMonthRecord.id })
                .eq('id', e.id)
                .then(({ error }) => {
                  if (error) console.error('Error auto-healing expense month_id:', error);
                });
            } else {
              const isFuture = correctPeriod.year > currentPeriod.year || 
                (correctPeriod.year === correctPeriod.year && correctPeriod.month > currentPeriod.month);
              const status = isFuture ? 'planning' : 'open';
              
              const createAndMigrate = async () => {
                try {
                  const { data: newMonth, error: createError } = await supabase
                    .from('months')
                    .insert({
                      household_id: activeHousehold.id,
                      year: correctPeriod.year,
                      month: correctPeriod.month,
                      status
                    })
                    .select()
                    .single();
                    
                  if (!createError && newMonth) {
                    dbMonths.push(newMonth);
                    setMonthsData((prev) => [...prev, newMonth].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month)));
                    
                    e.month_id = newMonth.id;
                    await supabase
                      .from('expenses')
                      .update({ month_id: newMonth.id })
                      .eq('id', e.id);
                      
                    loadFinancialData();
                  }
                } catch (err) {
                  console.error('Error creating month on auto-heal for expense:', err);
                }
              };
              createAndMigrate();
            }
          }
        }
      }

      if (!expError && exps) {
        const CHAR_EXPLICIT_DEBITED = '\u200C';
        const CHAR_EXPLICIT_PENDING = '\u200D';
        
        const todayLocal = new Date();
        const yyyy = todayLocal.getFullYear();
        const mm = String(todayLocal.getMonth() + 1).padStart(2, '0');
        const dd = String(todayLocal.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        const enrichedExps = exps.map((e) => {
          let isReconciled = false;
          let cleanDescription = e.description || '';

          const hasExplicitDebited = cleanDescription.endsWith(CHAR_EXPLICIT_DEBITED);
          const hasExplicitPending = cleanDescription.endsWith(CHAR_EXPLICIT_PENDING);

          if (hasExplicitDebited) {
            isReconciled = true;
            cleanDescription = cleanDescription.slice(0, -1);
          } else if (hasExplicitPending) {
            isReconciled = false;
            cleanDescription = cleanDescription.slice(0, -1);
          } else {
            isReconciled = e.date <= todayStr;
          }

          return {
            ...e,
            description: cleanDescription,
            is_reconciled: isReconciled,
            has_explicit_debited: hasExplicitDebited,
            has_explicit_pending: hasExplicitPending,
            profiles: e.created_by ? profilesMap.get(e.created_by) || null : null
          };
        });
        setAllExpenses(enrichedExps as unknown as Expense[]);
        setExpenses(enrichedExps.filter((e) => e.month_id === activeMonthRecord.id) as unknown as Expense[]);
      }

      // 6. Cargar gastos extraordinarios (unplanned_expenses) del período seleccionado
      const { data: unps, error: unpError } = await supabase
        .from('unplanned_expenses')
        .select('*')
        .eq('month_id', activeMonthRecord.id);

      if (!unpError && unps) {
        const enrichedUnps = unps.map((u) => ({
          ...u,
          profiles: u.created_by ? profilesMap.get(u.created_by) || null : null
        }));
        setUnplannedExpenses(enrichedUnps as unknown as UnplannedExpense[]);
      }

    } catch (e) {
      console.error('Error loading financial data', e);
      showToast('Error al cargar datos financieros', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (activeHousehold && activeMonthRecord) {
      loadFinancialData();
    } else {
      setIncomes([]);
      setExpenses([]);
      setUnplannedExpenses([]);
      setInstallments([]);
      setSavingsConfig(null);
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
        { event: '*', schema: 'public', table: 'unplanned_expenses', filter: `month_id=eq.${activeMonthRecord.id}` },
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
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeHousehold, activeMonthRecord]);

  const getOrCreateMonthIdForDate = async (dateStr: string): Promise<string> => {
    if (!activeHousehold) throw new Error("No active household");
    const startDay = activeHousehold.billing_cycle_start_day;
    const period = getFinancialPeriod(dateStr, startDay);
    
    // Buscar en la lista local de meses
    let record = monthsData.find(m => m.year === period.year && m.month === period.month);
    if (record) return record.id;
    
    // Si no está local, buscar en la base de datos por si acaso
    const { data: dbRecord } = await supabase
      .from('months')
      .select('id')
      .eq('household_id', activeHousehold.id)
      .eq('year', period.year)
      .eq('month', period.month)
      .maybeSingle();
      
    if (dbRecord) return dbRecord.id;
    
    // Si no existe, crearlo
    const isFuture = period.year > currentPeriod.year || 
      (period.year === currentPeriod.year && period.month > currentPeriod.month);
    const status = isFuture ? 'planning' : 'open';
    
    const { data: newMonth, error: createError } = await supabase
      .from('months')
      .insert({
        household_id: activeHousehold.id,
        year: period.year,
        month: period.month,
        status
      })
      .select()
      .single();
      
    if (createError || !newMonth) throw createError || new Error("Failed to create month record");
    
    // Actualizar monthsData local
    setMonthsData((prev) => [...prev, newMonth].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month)));
    
    return newMonth.id;
  };

  // -------------------------------------------------------------------
  // OPERACIONES FINANCIERAS
  // -------------------------------------------------------------------
  const addIncome = async (income: Omit<Income, 'id' | 'month_id' | 'created_by' | 'created_at'>) => {
    if (!activeMonthRecord || !user || !activeHousehold) return;
    try {
      const { is_recurring, ...dbPayload } = income as any;
      
      // Si es recurrente, agregamos la marca invisible \u200B al final de la descripción
      if (is_recurring) {
        dbPayload.description = `${dbPayload.description}\u200B`;
      }

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
      if (is_recurring) {
        try {
          const { data: futureMonths, error: fmError } = await supabase
            .from('months')
            .select('*')
            .eq('household_id', activeHousehold.id)
            .in('status', ['open', 'planning']);

          if (!fmError && futureMonths) {
            const activePeriod = getFinancialPeriod(income.date, activeHousehold.billing_cycle_start_day);
            const activeYear = activePeriod.year;
            const activeMonth = activePeriod.month;
            
            const filteredFutureMonths = futureMonths.filter(m => 
              m.year > activeYear || (m.year === activeYear && m.month > activeMonth)
            );

            if (filteredFutureMonths.length > 0) {
              const startDay = activeHousehold.billing_cycle_start_day;
              const copiesToInsert = filteredFutureMonths.map(m => {
                const prevDate = new Date(income.date);
                const day = prevDate.getUTCDate();
                
                let targetYear = m.year;
                let targetMonth = m.month;
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
                  ...dbPayload,
                  month_id: m.id,
                  created_by: user.id,
                  date: targetDateStr
                };
              });

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

  const updateIncome = async (id: string, income: Partial<Income>, adjustmentNote?: string) => {
    if (!activeHousehold || !activeMonthRecord) return;
    try {
      // 1. Obtener detalles del ingreso antes de actualizarlo
      const { data: targetIncome } = await supabase
        .from('incomes')
        .select('*')
        .eq('id', id)
        .single();

      if (!targetIncome) throw new Error('Ingreso no encontrado');

      const isTargetRecurring = targetIncome.description && targetIncome.description.endsWith('\u200B');

      // 2. Si es un ingreso recurrente, propagar las modificaciones a los clones futuros
      if (isTargetRecurring) {
        // Cargar todos los meses registrados del hogar
        const { data: allMonthsRecords } = await supabase
          .from('months')
          .select('*')
          .eq('household_id', activeHousehold.id);

        if (allMonthsRecords) {
          const originMonth = allMonthsRecords.find((m) => m.id === targetIncome.month_id);
          
          if (originMonth) {
            const originYear = originMonth.year;
            const originMonthVal = originMonth.month;

            // Filtrar todos los meses posteriores
            const subsequentMonthIds = allMonthsRecords
              .filter((m) => m.year > originYear || (m.year === originYear && m.month > originMonthVal))
              .map((m) => m.id);

            if (subsequentMonthIds.length > 0) {
              // Buscar todos los ingresos recurrentes futuros coincidentes por descripción original
              const { data: futureIncomes } = await supabase
                .from('incomes')
                .select('id, month_id')
                .in('month_id', subsequentMonthIds)
                .eq('description', targetIncome.description);

              if (futureIncomes && futureIncomes.length > 0) {
                const futureIds = futureIncomes.map((fi) => fi.id);

                // Construir el payload de actualización excluyendo campos individuales e ID
                const { is_recurring, ...dbPayload } = income as any;

                // Si se actualizó la descripción, asegurar que mantenga el sufijo \u200B
                if (dbPayload.description && !dbPayload.description.endsWith('\u200B')) {
                  dbPayload.description = `${dbPayload.description}\u200B`;
                }

                const futurePayload: any = { ...dbPayload };
                delete futurePayload.amount;
                delete futurePayload.date;
                delete futurePayload.month_id;
                delete futurePayload.id;

                // 2.1. Actualizar en lote
                await supabase
                  .from('incomes')
                  .update(futurePayload)
                  .in('id', futureIds);

                // 2.2. Si la fecha cambió, actualizar el día en cada copia futura
                if (income.date && income.date !== targetIncome.date) {
                  try {
                    const newDateObj = new Date(income.date);
                    const targetDay = newDateObj.getUTCDate();

                    const startDay = activeHousehold.billing_cycle_start_day;
                    for (const fi of futureIncomes) {
                      const mRecord = allMonthsRecords.find((m) => m.id === fi.month_id);
                      if (mRecord) {
                        let targetYear = mRecord.year;
                        let targetMonth = mRecord.month;
                        if (targetDay < startDay) {
                          targetMonth += 1;
                          if (targetMonth > 12) {
                            targetMonth = 1;
                            targetYear += 1;
                          }
                        }
                        const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
                        const dayVal = Math.min(targetDay, lastDayOfTargetMonth);
                        const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`;

                        await supabase
                          .from('incomes')
                          .update({ date: targetDateStr })
                          .eq('id', fi.id);
                      }
                    }
                  } catch (dateUpdateErr) {
                    console.error('Error updating future income dates:', dateUpdateErr);
                  }
                }
              }
            }
          }
        }
      }

      // 3. Actualizar el ingreso actual
      const { is_recurring, ...payload } = income as any;
      if (is_recurring !== undefined) {
        if (is_recurring) {
          if (payload.description && !payload.description.endsWith('\u200B')) {
            payload.description = `${payload.description}\u200B`;
          }
        } else {
          if (payload.description) {
            payload.description = payload.description.replace(/\u200B$/, '');
          }
        }
      }

      if (income.date) {
        payload.month_id = await getOrCreateMonthIdForDate(income.date);
      }

      const { error } = await supabase
        .from('incomes')
        .update(payload)
        .eq('id', id);

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
      // 1. Obtener detalles del ingreso antes de borrarlo
      const { data: targetIncome } = await supabase
        .from('incomes')
        .select('*')
        .eq('id', id)
        .single();

      if (!targetIncome) throw new Error('Ingreso no encontrado');

      // 2. Borrar el ingreso seleccionado
      const { error } = await supabase
        .from('incomes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // 3. Si deleteFuture es true, borrar los ingresos idénticos de los meses siguientes
      if (deleteFuture) {
        try {
          const { data: futureMonths } = await supabase
            .from('months')
            .select('*')
            .eq('household_id', activeHousehold.id)
            .in('status', ['open', 'planning']);

          if (futureMonths) {
            const activeYear = activeMonthRecord.year;
            const activeMonth = activeMonthRecord.month;
            
            const filteredMonths = futureMonths.filter(m => 
              m.year > activeYear || (m.year === activeYear && m.month > activeMonth)
            );

            if (filteredMonths.length > 0) {
              const monthIds = filteredMonths.map(m => m.id);
              await supabase
                .from('incomes')
                .delete()
                .in('month_id', monthIds)
                .eq('description', targetIncome.description)
                .eq('amount', targetIncome.amount)
                .eq('account', targetIncome.account);
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
      const calculatedMonthId = await getOrCreateMonthIdForDate(expense.date);
      // 1. Insertar el gasto en el mes activo
      const { error } = await supabase
        .from('expenses')
        .insert({
          ...expense,
          month_id: calculatedMonthId,
          created_by: user.id
        });

      if (error) throw error;

      // 2. Si el gasto es recurrente, lo propagamos a meses futuros ya existentes en la DB
      if (expense.is_recurring) {
        try {
          const { data: futureMonths, error: fmError } = await supabase
            .from('months')
            .select('*')
            .eq('household_id', activeHousehold.id)
            .in('status', ['open', 'planning']);

          if (!fmError && futureMonths) {
            const activePeriod = getFinancialPeriod(expense.date, activeHousehold.billing_cycle_start_day);
            const activeYear = activePeriod.year;
            const activeMonth = activePeriod.month;
            
            const filteredFutureMonths = futureMonths.filter(m => 
              m.year > activeYear || (m.year === activeYear && m.month > activeMonth)
            );

            if (filteredFutureMonths.length > 0) {
              const startDay = activeHousehold.billing_cycle_start_day;
              const copiesToInsert = filteredFutureMonths.map(m => {
                const prevDate = new Date(expense.date);
                const day = prevDate.getUTCDate();
                
                let targetYear = m.year;
                let targetMonth = m.month;
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
                  ...expense,
                  month_id: m.id,
                  created_by: user.id,
                  date: targetDateStr
                };
              });

              await supabase.from('expenses').insert(copiesToInsert);
            }
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

  const updateExpense = async (id: string, expense: Partial<Expense>, adjustmentNote?: string) => {
    if (!activeHousehold || !activeMonthRecord) return;
    console.log('[DEBUG updateExpense] Starting update for expense ID:', id, 'Payload:', expense);
    try {
      // 1. Obtener detalles del gasto antes de actualizarlo para identificar clones futuros
      const { data: targetExpense, error: targetError } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();

      if (targetError || !targetExpense) {
        console.error('[DEBUG updateExpense] Target expense not found or error:', targetError);
        throw new Error('Gasto no encontrado');
      }

      console.log('[DEBUG updateExpense] Target expense found:', {
        description: targetExpense.description,
        is_recurring: targetExpense.is_recurring,
        month_id: targetExpense.month_id,
        category_id: targetExpense.category_id,
        account: targetExpense.account
      });

      // 2. Si es un gasto recurrente y hay cambios generales (no solo de conciliación), propagar las modificaciones a los clones futuros
      const cleanDesc = (d: string) => (d || '').replace(/\u200C/g, '').replace(/\u200D/g, '');
      const cleanNewDesc = cleanDesc(expense.description || '');
      const cleanOldDesc = cleanDesc(targetExpense.description || '');

      const hasGeneralChanges = 
        (expense.category_id !== undefined && expense.category_id !== targetExpense.category_id) ||
        (expense.account !== undefined && expense.account !== targetExpense.account) ||
        (expense.holder !== undefined && expense.holder !== targetExpense.holder) ||
        (expense.notes !== undefined && expense.notes !== targetExpense.notes) ||
        (expense.description !== undefined && cleanNewDesc !== cleanOldDesc);

      if (targetExpense.is_recurring && hasGeneralChanges) {
        console.log('[DEBUG updateExpense] Expense is recurring and has general changes. Loading all months...');
        // Cargar todos los meses registrados del hogar
        const { data: allMonthsRecords, error: monthsErr } = await supabase
          .from('months')
          .select('*')
          .eq('household_id', activeHousehold.id);

        if (monthsErr) {
          console.error('[DEBUG updateExpense] Error loading months:', monthsErr);
        }

        if (allMonthsRecords) {
          // Identificar el mes de origen exacto del gasto que estamos editando
          const originMonth = allMonthsRecords.find((m) => m.id === targetExpense.month_id);
          console.log('[DEBUG updateExpense] Origin month of targetExpense:', originMonth);
          
          if (originMonth) {
            const originYear = originMonth.year;
            const originMonthVal = originMonth.month;

            // Filtrar todos los meses posteriores de forma cronológica
            const subsequentMonthIds = allMonthsRecords
              .filter((m) => m.year > originYear || (m.year === originYear && m.month > originMonthVal))
              .map((m) => m.id);

            console.log('[DEBUG updateExpense] Subsequent month IDs:', subsequentMonthIds);

            if (subsequentMonthIds.length > 0) {
              // Buscar todos los gastos recurrentes futuros de la misma categoría y flag de recurrencia
              console.log('[DEBUG updateExpense] Querying future expenses for category:', targetExpense.category_id);
              const { data: rawFutureExpenses, error: fetchErr } = await supabase
                .from('expenses')
                .select('id, month_id, description, is_recurring')
                .in('month_id', subsequentMonthIds)
                .eq('category_id', targetExpense.category_id)
                .eq('is_recurring', true);

              if (fetchErr) {
                console.error('[DEBUG updateExpense] Error fetching future recurring expenses for replication:', fetchErr);
              }

              let futureExpenses: any[] = [];
              if (rawFutureExpenses) {
                const cleanDescFn = (d: string) => (d || '').replace(/\u200C/g, '').replace(/\u200D/g, '').trim().toLowerCase();
                const cleanedTarget = cleanDescFn(targetExpense.description);
                futureExpenses = rawFutureExpenses.filter(fe => cleanDescFn(fe.description) === cleanedTarget);
              }

              console.log('[DEBUG updateExpense] Found future matching expenses:', futureExpenses);

              if (futureExpenses && futureExpenses.length > 0) {
                const futureIds = futureExpenses.map((fe) => fe.id);

                // Construir el payload de actualización excluyendo campos individuales e ID
                const futurePayload: any = { ...expense };
                if (futurePayload.description) {
                  futurePayload.description = cleanDesc(futurePayload.description);
                }
                delete futurePayload.amount;
                delete futurePayload.date;
                delete futurePayload.adjustment_note;
                delete futurePayload.month_id;
                delete futurePayload.id;

                console.log('[DEBUG updateExpense] Batch updating future expenses with payload:', futurePayload);

                // 2.1. Actualizar campos generales (descripción, categoría, cuenta, titular, notas) en lote para estos IDs
                const { error: batchUpdateErr } = await supabase
                  .from('expenses')
                  .update(futurePayload)
                  .in('id', futureIds);

                if (batchUpdateErr) {
                  console.error('[DEBUG updateExpense] Error in batch update of future recurring expenses:', batchUpdateErr);
                } else {
                  console.log('[DEBUG updateExpense] Batch update of future expenses succeeded!');
                }

                // 2.2. Si la fecha (de debitación) cambió, re-calcular el día y actualizar la fecha de cada copia según su mes correspondiente
                if (expense.date && expense.date !== targetExpense.date) {
                  console.log('[DEBUG updateExpense] Date changed from', targetExpense.date, 'to', expense.date, '. Updating individual future dates...');
                  try {
                    const newDateObj = new Date(expense.date);
                    const targetDay = newDateObj.getUTCDate();

                    const startDay = activeHousehold.billing_cycle_start_day;
                    for (const fe of futureExpenses) {
                      const mRecord = allMonthsRecords.find((m) => m.id === fe.month_id);
                      if (mRecord) {
                        let targetYear = mRecord.year;
                        let targetMonth = mRecord.month;
                        if (targetDay < startDay) {
                          targetMonth += 1;
                          if (targetMonth > 12) {
                            targetMonth = 1;
                            targetYear += 1;
                          }
                        }
                        const lastDayOfTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
                        const dayVal = Math.min(targetDay, lastDayOfTargetMonth);
                        const targetDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`;

                        console.log('[DEBUG updateExpense] Updating future expense', fe.id, 'date to:', targetDateStr);
                        const { error: dateErr } = await supabase
                          .from('expenses')
                          .update({ date: targetDateStr })
                          .eq('id', fe.id);

                        if (dateErr) {
                          console.error('[DEBUG updateExpense] Error updating date for', fe.id, ':', dateErr);
                        }
                      }
                    }
                  } catch (dateUpdateErr) {
                    console.error('[DEBUG updateExpense] Error updating future expense dates:', dateUpdateErr);
                  }
                }
              } else {
                console.log('[DEBUG updateExpense] No future matching recurring expenses found.');
              }
            } else {
              console.log('[DEBUG updateExpense] No subsequent months found.');
            }
          }
        }
      } else {
        console.log('[DEBUG updateExpense] targetExpense is NOT recurring.');
      }

      // 3. Actualizar el gasto actual
      const payload: any = { ...expense };
      if (activeMonthRecord?.status === 'closed' && adjustmentNote) {
        payload.adjustment_note = adjustmentNote;
      }
      
      if (expense.date) {
        payload.month_id = await getOrCreateMonthIdForDate(expense.date);
      }
      
      console.log('[DEBUG updateExpense] Updating current expense', id, 'with payload:', payload);
      const { error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', id);

      if (error) {
        console.error('[DEBUG updateExpense] Error updating current expense:', error);
        throw error;
      }
      
      console.log('[DEBUG updateExpense] Current expense updated successfully!');
      showToast('Gasto actualizado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      console.error('[DEBUG updateExpense] Error in updateExpense:', e);
      showToast('Error al actualizar gasto', 'error');
      throw e;
    }
  };

  const deleteExpense = async (id: string, deleteFuture = false) => {
    if (!activeHousehold || !activeMonthRecord) return;
    try {
      // 1. Obtener detalles del gasto antes de borrarlo
      const { data: targetExpense } = await supabase
        .from('expenses')
        .select('*')
        .eq('id', id)
        .single();

      if (!targetExpense) throw new Error('Gasto no encontrado');

      // 2. Si se solicitó borrar futuros y es un gasto recurrente
      if (deleteFuture && targetExpense.is_recurring) {
        const currentYear = activeMonthRecord.year;
        const currentMonth = activeMonthRecord.month;

        // Cargar todos los meses registrados del hogar
        const { data: allMonthsRecords } = await supabase
          .from('months')
          .select('*')
          .eq('household_id', activeHousehold.id);

        if (allMonthsRecords) {
          // Filtrar meses posteriores al mes del gasto
          const subsequentMonthIds = allMonthsRecords
            .filter((m) => m.year > currentYear || (m.year === currentYear && m.month > currentMonth))
            .map((m) => m.id);

          if (subsequentMonthIds.length > 0) {
            // Cargar todos los gastos recurrentes futuros de la misma categoría en esos meses
            const { data: futureExps } = await supabase
              .from('expenses')
              .select('id, description')
              .in('month_id', subsequentMonthIds)
              .eq('category_id', targetExpense.category_id)
              .eq('is_recurring', true);

            if (futureExps && futureExps.length > 0) {
              // Limpiar descripción obviando sufijos invisibles de conciliación (debitado / pendiente)
              const cleanDesc = (d: string) => (d || '').replace(/\u200C/g, '').replace(/\u200D/g, '').trim().toLowerCase();
              const cleanedTarget = cleanDesc(targetExpense.description);

              const idsToDelete = futureExps
                .filter(e => cleanDesc(e.description) === cleanedTarget)
                .map(e => e.id);

              if (idsToDelete.length > 0) {
                const { error: deleteFutureError } = await supabase
                  .from('expenses')
                  .delete()
                  .in('id', idsToDelete);

                if (deleteFutureError) {
                  console.error('Error deleting future recurrings:', deleteFutureError);
                }
              }
            }
          }
        }
      }

      // 3. Eliminar el gasto actual
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

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
        installments,
        savingsConfig,
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
