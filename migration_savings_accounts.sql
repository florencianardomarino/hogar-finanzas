-- =====================================================================
-- MIGRACIÓN: RESTABLECER SALDO DE AHORROS + CUENTAS DE AHORRO
-- Ejecutar UNA VEZ en el editor SQL de Supabase (es idempotente: se puede
-- volver a ejecutar sin romper nada).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RESTABLECER EL SALDO DEL FONDO DE AHORRO A UN MES CERRADO
--    Se guarda un "ancla": el saldo real al cierre de un mes concreto.
--    Los meses anteriores no se tocan; desde el mes siguiente el saldo
--    se encadena a partir de este valor.
-- ---------------------------------------------------------------------
ALTER TABLE public.savings_config
    ADD COLUMN IF NOT EXISTS anchor_year INTEGER,
    ADD COLUMN IF NOT EXISTS anchor_month INTEGER CHECK (anchor_month BETWEEN 1 AND 12),
    ADD COLUMN IF NOT EXISTS anchor_balance NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS anchor_previous_computed NUMERIC(12,2), -- Lo que calculaba la app antes del ajuste (auditoría)
    ADD COLUMN IF NOT EXISTS anchor_set_at TIMESTAMP WITH TIME ZONE;


-- ---------------------------------------------------------------------
-- 2. CUENTAS DE AHORRO (ej: Inversión, Cancelar deudas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#3B82F6',
    sort_order INTEGER DEFAULT 0 NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.savings_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros del hogar pueden gestionar cuentas de ahorro" ON public.savings_accounts;
CREATE POLICY "Miembros del hogar pueden gestionar cuentas de ahorro"
    ON public.savings_accounts FOR ALL
    USING (public.is_household_member(household_id))
    WITH CHECK (public.is_household_member(household_id));


-- ---------------------------------------------------------------------
-- 3. ASIGNACIONES MENSUALES A CADA CUENTA (manuales)
--    kind = 'percent' -> value es un % de los ingresos totales del mes
--    kind = 'amount'  -> value es un importe fijo en euros
--    Una sola asignación por cuenta y mes.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    savings_account_id UUID REFERENCES public.savings_accounts(id) ON DELETE CASCADE NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
    value NUMERIC(12,2) NOT NULL CHECK (value >= 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (savings_account_id, year, month)
);

ALTER TABLE public.savings_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros del hogar pueden gestionar asignaciones de ahorro" ON public.savings_allocations;
CREATE POLICY "Miembros del hogar pueden gestionar asignaciones de ahorro"
    ON public.savings_allocations FOR ALL
    USING (public.is_household_member(household_id))
    WITH CHECK (public.is_household_member(household_id));


-- ---------------------------------------------------------------------
-- 4. GASTOS PAGADOS DESDE UNA CUENTA DE AHORRO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.savings_account_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    savings_account_id UUID REFERENCES public.savings_accounts(id) ON DELETE CASCADE NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.savings_account_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros del hogar pueden gestionar gastos de cuentas de ahorro" ON public.savings_account_expenses;
CREATE POLICY "Miembros del hogar pueden gestionar gastos de cuentas de ahorro"
    ON public.savings_account_expenses FOR ALL
    USING (public.is_household_member(household_id))
    WITH CHECK (public.is_household_member(household_id));


-- ---------------------------------------------------------------------
-- 5. TIEMPO REAL (solo añade las tablas si aún no están publicadas)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['savings_accounts', 'savings_allocations', 'savings_account_expenses']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- Refrescar la caché de esquema de la API
NOTIFY pgrst, 'reload schema';
