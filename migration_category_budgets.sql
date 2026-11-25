-- =====================================================================
-- MIGRACIÓN: AJUSTE MENSUAL DEL PRESUPUESTO POR CATEGORÍA
-- Ejecutar en el editor SQL de Supabase. Es idempotente y no modifica datos existentes.
--
-- El presupuesto base de cada categoría sigue en expense_categories.budget_limit.
-- Esta tabla guarda solo los ajustes puntuales de un mes: si un mes no tiene fila,
-- la app usa el presupuesto base de la categoría.
--
-- Requiere la función public.is_household_member (ya creada por migration_security_fixes.sql).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.category_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.expense_categories(id) ON DELETE CASCADE NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (category_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_category_budgets_household ON public.category_budgets (household_id, year, month);

ALTER TABLE public.category_budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros del hogar pueden gestionar presupuestos de categoría" ON public.category_budgets;
CREATE POLICY "Miembros del hogar pueden gestionar presupuestos de categoría"
    ON public.category_budgets FOR ALL
    USING (public.is_household_member(household_id))
    WITH CHECK (public.is_household_member(household_id));

-- Tiempo real (solo añade la tabla si aún no está publicada)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'category_budgets'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.category_budgets;
    END IF;
END $$;

-- Refrescar la caché de esquema de la API
NOTIFY pgrst, 'reload schema';
