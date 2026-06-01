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
  expenses: Expense[];
  unplannedExpenses: UnplannedExpense[];
  installments: Installment[];
  savingsConfig: SavingsConfig | null;
  loadingData: boolean;
  
  // Operaciones Financieras
  addIncome: (income: Omit<Income, 'id' | 'month_id' | 'created_by' | 'created_at'>) => Promise<void>;
  updateIncome: (id: string, income: Partial<Income>, adjustmentNote?: string) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  
  addExpense: (expense: Omit<Expense, 'id' | 'month_id' | 'created_by' | 'created_at' | 'installment_id' | 'installment_number'>) => Promise<void>;
  updateExpense: (id: string, expense: Partial<Expense>, adjustmentNote?: string) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  
  addInstallment: (installment: Omit<Installment, 'id' | 'household_id' | 'created_by' | 'created_at'>) => Promise<void>;
  cancelInstallment: (id: string) => Promise<void>;
  
  addUnplannedExpense: (unplanned: Omit<UnplannedExpense, 'id' | 'household_id' | 'month_id' | 'created_by' | 'created_at'>) => Promise<void>;
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
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
      
      if (event === 'SIGNED_IN' && session) {
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
        setHouseholdsError(e.message || 'Error al conectar con la base de datos');
        showToast('Error al cargar hogares', 'error');
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
          setMonthsData((prev) => [...prev, newMonth].sort((a,b) => (a.year !== b.year ? a.year - b.year : a.month - b.month)));
          
          // --- NUEVO: Copiar gastos recurrentes del mes anterior ---
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
              const { data: recurringExpenses } = await supabase
                .from('expenses')
                .select('*')
                .eq('month_id', prevMonthRecord.id)
                .eq('is_recurring', true);

              if (recurringExpenses && recurringExpenses.length > 0) {
                const copies = recurringExpenses.map(exp => {
                  const prevDate = new Date(exp.date);
                  const day = prevDate.getUTCDate();
                  const lastDayOfTargetMonth = new Date(newMonth.year, newMonth.month, 0).getDate();
                  const targetDay = Math.min(day, lastDayOfTargetMonth);
                  const targetDateStr = `${newMonth.year}-${String(newMonth.month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

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
            }
          } catch (copyErr) {
            console.error('Error copying recurring expenses to new month:', copyErr);
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

      // 3. Cargar ingresos del período seleccionado
      const { data: incs, error: incError } = await supabase
        .from('incomes')
        .select(`
          *,
          profiles (display_name)
        `)
        .eq('month_id', activeMonthRecord.id);

      if (!incError && incs) {
        setIncomes(incs as unknown as Income[]);
      }

      // 4. Cargar gastos del período seleccionado
      const { data: exps, error: expError } = await supabase
        .from('expenses')
        .select(`
          *,
          expense_categories (*),
          profiles (display_name)
        `)
        .eq('month_id', activeMonthRecord.id);

      if (!expError && exps) {
        setExpenses(exps as unknown as Expense[]);
      }

      // 5. Cargar gastos extraordinarios (unplanned_expenses) del período seleccionado
      const { data: unps, error: unpError } = await supabase
        .from('unplanned_expenses')
        .select(`
          *,
          profiles (display_name)
        `)
        .eq('month_id', activeMonthRecord.id);

      if (!unpError && unps) {
        setUnplannedExpenses(unps as unknown as UnplannedExpense[]);
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
        { event: '*', schema: 'public', table: 'incomes', filter: `month_id=eq.${activeMonthRecord.id}` },
        () => loadFinancialData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses', filter: `month_id=eq.${activeMonthRecord.id}` },
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

  // -------------------------------------------------------------------
  // OPERACIONES FINANCIERAS
  // -------------------------------------------------------------------
  const addIncome = async (income: Omit<Income, 'id' | 'month_id' | 'created_by' | 'created_at'>) => {
    if (!activeMonthRecord || !user) return;
    try {
      const { error } = await supabase
        .from('incomes')
        .insert({
          ...income,
          month_id: activeMonthRecord.id,
          created_by: user.id
        });

      if (error) throw error;
      showToast('Ingreso registrado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al registrar ingreso', 'error');
      throw e;
    }
  };

  const updateIncome = async (id: string, income: Partial<Income>, adjustmentNote?: string) => {
    try {
      const payload: any = { ...income };
      if (activeMonthRecord?.status === 'closed' && adjustmentNote) {
        // En mes cerrado, no guardamos nota en incomes directamente pero validamos.
        // Opcionalmente podemos registrar una nota. Para ingresos usaremos una validación en frontend.
      }
      
      const { error } = await supabase
        .from('incomes')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      showToast('Ingreso actualizado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al actualizar ingreso', 'error');
      throw e;
    }
  };

  const deleteIncome = async (id: string) => {
    try {
      const { error } = await supabase
        .from('incomes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Ingreso eliminado', 'info');
      loadFinancialData();
    } catch (e) {
      showToast('Error al eliminar ingreso', 'error');
    }
  };

  const addExpense = async (expense: Omit<Expense, 'id' | 'month_id' | 'created_by' | 'created_at' | 'installment_id' | 'installment_number'>) => {
    if (!activeMonthRecord || !user || !activeHousehold) return;
    try {
      // 1. Insertar el gasto en el mes activo
      const { error } = await supabase
        .from('expenses')
        .insert({
          ...expense,
          month_id: activeMonthRecord.id,
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
            const activeYear = activeMonthRecord.year;
            const activeMonth = activeMonthRecord.month;
            
            const filteredFutureMonths = futureMonths.filter(m => 
              m.year > activeYear || (m.year === activeYear && m.month > activeMonth)
            );

            if (filteredFutureMonths.length > 0) {
              const copiesToInsert = filteredFutureMonths.map(m => {
                const prevDate = new Date(expense.date);
                const day = prevDate.getUTCDate();
                const lastDayOfTargetMonth = new Date(m.year, m.month, 0).getDate();
                const targetDay = Math.min(day, lastDayOfTargetMonth);
                const targetDateStr = `${m.year}-${String(m.month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;

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
    try {
      const payload: any = { ...expense };
      if (activeMonthRecord?.status === 'closed' && adjustmentNote) {
        payload.adjustment_note = adjustmentNote;
      }
      
      const { error } = await supabase
        .from('expenses')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      showToast('Gasto actualizado con éxito', 'success');
      loadFinancialData();
    } catch (e) {
      showToast('Error al actualizar gasto', 'error');
      throw e;
    }
  };

  const deleteExpense = async (id: string) => {
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast('Gasto eliminado', 'info');
      loadFinancialData();
    } catch (e) {
      showToast('Error al eliminar gasto', 'error');
    }
  };

  const addInstallment = async (installment: Omit<Installment, 'id' | 'household_id' | 'created_by' | 'created_at'>) => {
    if (!activeHousehold || !user) return;
    try {
      const { error } = await supabase
        .from('installments')
        .insert({
          ...installment,
          household_id: activeHousehold.id,
          created_by: user.id
        });

      if (error) throw error;
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
        expenses,
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
        addUnplannedExpense,
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
