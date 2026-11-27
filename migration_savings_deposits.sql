-- =====================================================================
-- MIGRACIÓN: INGRESOS A AHORROS EN OTRA MONEDA (ej. dólares -> euros)
-- Ejecutar UNA VEZ en el editor SQL de Supabase (es idempotente).
-- Cada fila es un ingreso puntual al fondo de ahorros. Se guardan el
-- importe original, la cotización usada y los euros resultantes.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.savings_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12), -- período de facturación al que pertenece
    description TEXT NOT NULL DEFAULT '',
    original_amount NUMERIC(12,2) NOT NULL CHECK (original_amount > 0),
    original_currency TEXT NOT NULL DEFAULT 'USD',
    exchange_rate NUMERIC(14,6) NOT NULL CHECK (exchange_rate > 0), -- euros por cada unidad de la moneda original
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),                -- importe en euros
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_savings_deposits_household ON public.savings_deposits(household_id, year, month);

ALTER TABLE public.savings_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Miembros del hogar pueden gestionar ingresos a ahorros" ON public.savings_deposits;
CREATE POLICY "Miembros del hogar pueden gestionar ingresos a ahorros"
    ON public.savings_deposits FOR ALL
    USING (public.is_household_member(household_id))
    WITH CHECK (public.is_household_member(household_id));

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_deposits;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
