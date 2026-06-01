-- =====================================================================
-- ESQUEMA SQL PARA SUPABASE - PWA FINANZAS DEL HOGAR
-- Copia y ejecuta este script en el editor SQL de tu panel de Supabase.
-- =====================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA DE PERFILES DE USUARIO (Vinculada a Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS en profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Los perfiles son públicos para lectura" 
    ON public.profiles FOR SELECT 
    USING (true);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" 
    ON public.profiles FOR UPDATE 
    USING (auth.uid() = id);

-- Trigger para crear automáticamente el perfil de un usuario tras registrarse en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si ya existe para evitar errores en recreación
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 2. TABLA DE HOGARES (Households)
CREATE TABLE IF NOT EXISTS public.households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    invite_code TEXT UNIQUE NOT NULL,
    billing_cycle_start_day INTEGER DEFAULT 10 CHECK (billing_cycle_start_day BETWEEN 1 AND 28) NOT NULL,
    holder_1_name TEXT DEFAULT 'Titular 1' NOT NULL,
    holder_2_name TEXT DEFAULT 'Titular 2' NOT NULL,
    account_1_name TEXT DEFAULT 'Cuenta Titular 1' NOT NULL,
    account_2_name TEXT DEFAULT 'Cuenta Titular 2' NOT NULL,
    account_joint_name TEXT DEFAULT 'Cuenta conjunta' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;


-- 3. TABLA DE MIEMBROS DE HOGARES
CREATE TABLE IF NOT EXISTS public.household_members (
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT CHECK (role IN ('admin', 'collaborator')) DEFAULT 'collaborator' NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (household_id, user_id)
);

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;


-- Función de utilidad para políticas RLS de seguridad (Comprobar pertenencia al hogar)
CREATE OR REPLACE FUNCTION public.is_household_member(household_uuid UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = household_uuid AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql;

-- Función de utilidad para comprobar si el usuario es administrador del hogar
CREATE OR REPLACE FUNCTION public.is_household_admin(household_uuid UUID)
RETURNS BOOLEAN SECURITY DEFINER AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_id = household_uuid AND user_id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql;


-- Políticas de seguridad para households (Hogares)
CREATE POLICY "Lectura de hogares a los que pertenece el usuario"
    ON public.households FOR SELECT
    USING (
        id IN (
            SELECT hm.household_id 
            FROM public.household_members hm 
            WHERE hm.user_id = auth.uid()
        )
    );

CREATE POLICY "Los usuarios autenticados pueden crear hogares"
    ON public.households FOR INSERT
    WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Los miembros pueden actualizar la configuración del hogar"
    ON public.households FOR UPDATE
    USING (
        id IN (
            SELECT hm.household_id 
            FROM public.household_members hm 
            WHERE hm.user_id = auth.uid()
        )
    );


-- Políticas de seguridad para household_members (Miembros)
CREATE POLICY "Los miembros pueden ver la lista de integrantes del hogar"
    ON public.household_members FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Los usuarios pueden registrar su propia membresía (creador o invitado)"
    ON public.household_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sólo el administrador puede modificar roles de los miembros"
    ON public.household_members FOR UPDATE
    USING (public.is_household_admin(household_id));

CREATE POLICY "Sólo el administrador puede expulsar miembros del hogar"
    ON public.household_members FOR DELETE
    USING (public.is_household_admin(household_id));


-- 4. TABLA DE CATEGORÍAS DE GASTOS
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0 NOT NULL,
    budget_limit NUMERIC(12,2) DEFAULT NULL, -- Límite de presupuesto mensual (por ejemplo para Supermercado y Varios)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (household_id, name)
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar categorías"
    ON public.expense_categories FOR ALL
    USING (public.is_household_member(household_id));


-- 5. TABLA DE PERÍODOS MENSUALES
CREATE TABLE IF NOT EXISTS public.months (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status TEXT CHECK (status IN ('open', 'planning', 'closed')) DEFAULT 'open' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (household_id, year, month)
);

ALTER TABLE public.months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar meses"
    ON public.months FOR ALL
    USING (public.is_household_member(household_id));


-- 6. COMPRAS A PLAZOS (Installments)
CREATE TABLE IF NOT EXISTS public.installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    num_installments INTEGER NOT NULL CHECK (num_installments > 0),
    amount_per_installment NUMERIC(12,2) NOT NULL,
    payment_type TEXT CHECK (payment_type IN ('credit_card', 'debit')) NOT NULL,
    account TEXT NOT NULL,
    first_debit_month INTEGER NOT NULL CHECK (first_debit_month BETWEEN 1 AND 12),
    first_debit_year INTEGER NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar compras a plazos"
    ON public.installments FOR ALL
    USING (public.is_household_member(household_id));


-- 7. INGRESOS MENSUALES
CREATE TABLE IF NOT EXISTS public.incomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_id UUID REFERENCES public.months(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL,
    account TEXT NOT NULL,
    category TEXT CHECK (category IN ('Sueldo', 'Freelance', 'Bono', 'Otros')),
    is_estimated BOOLEAN DEFAULT false NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar ingresos"
    ON public.incomes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.months
            WHERE months.id = month_id AND public.is_household_member(months.household_id)
        )
    );


-- 8. GASTOS MENSUALES
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month_id UUID REFERENCES public.months(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL,
    account TEXT NOT NULL,
    holder TEXT NOT NULL,
    category_id UUID REFERENCES public.expense_categories(id) ON DELETE RESTRICT NOT NULL,
    is_planned BOOLEAN DEFAULT false NOT NULL,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT false NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    installment_id UUID REFERENCES public.installments(id) ON DELETE CASCADE,
    installment_number INTEGER,
    adjustment_note TEXT, -- Nota obligatoria para editar en meses cerrados
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar gastos"
    ON public.expenses FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.months
            WHERE months.id = month_id AND public.is_household_member(months.household_id)
        )
    );


-- 9. GASTOS EXTRAORDINARIOS FUERA DE PRESUPUESTO CORRIENTE (Unplanned Expenses)
CREATE TABLE IF NOT EXISTS public.unplanned_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    month_id UUID REFERENCES public.months(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL,
    account TEXT NOT NULL,
    holder TEXT NOT NULL,
    category TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.unplanned_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar gastos extraordinarios"
    ON public.unplanned_expenses FOR ALL
    USING (public.is_household_member(household_id));


-- 10. CONFIGURACIÓN DE AHORRO ACUMULADO POR HOGAR
CREATE TABLE IF NOT EXISTS public.savings_config (
    household_id UUID PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
    initial_balance NUMERIC(12,2) DEFAULT 0.00 NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.savings_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Miembros del hogar pueden gestionar la configuración del ahorro"
    ON public.savings_config FOR ALL
    USING (public.is_household_member(household_id));


-- =====================================================================
-- FUNCIÓN SQL PARA INICIALIZAR LAS 6 CATEGORÍAS ESTÁNDAR
-- Se llamará automáticamente cuando se cree un nuevo hogar.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.initialize_household_categories()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.expense_categories (household_id, name, color, icon, sort_order, budget_limit)
    VALUES 
        (new.id, 'Servicios', '#3B82F6', 'Zap', 1, NULL),
        (new.id, 'Suscripciones', '#8B5CF6', 'Tv', 2, NULL),
        (new.id, 'Supermercado y Varios', '#10B981', 'ShoppingBag', 3, 500.00), -- Presupuesto base 500€
        (new.id, 'Tarjeta de Crédito', '#F59E0B', 'CreditCard', 4, NULL),
        (new.id, 'Cuotas', '#6366F1', 'CalendarDays', 5, NULL),
        (new.id, 'Gastos No Planificados', '#EF4444', 'AlertTriangle', 6, NULL);
    
    -- Inicializar también savings_config para el hogar
    INSERT INTO public.savings_config (household_id, initial_balance)
    VALUES (new.id, 0.00);

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_household_created
    AFTER INSERT ON public.households
    FOR EACH ROW EXECUTE PROCEDURE public.initialize_household_categories();


-- =====================================================================
-- HABILITACIÓN DE TIEMPO REAL (Supabase Realtime)
-- Permite suscribirse a cambios de datos desde la app cliente.
-- =====================================================================
begin;
  -- Recrear publicación de realtime si es necesario
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

alter publication supabase_realtime add table public.incomes;
alter publication supabase_realtime add table public.expenses;
alter publication supabase_realtime add table public.installments;
alter publication supabase_realtime add table public.months;
alter publication supabase_realtime add table public.unplanned_expenses;
alter publication supabase_realtime add table public.household_members;
alter publication supabase_realtime add table public.expense_categories;
alter publication supabase_realtime add table public.savings_config;
