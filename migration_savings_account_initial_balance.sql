-- =====================================================================
-- MIGRACIÓN: SALDO INICIAL EN CUENTAS DE AHORRO
-- Ejecutar UNA VEZ en el editor SQL de Supabase (es idempotente).
-- Dinero que la cuenta ya tenía antes de usar la app: se suma al
-- disponible de la cuenta pero NO sale del fondo principal de ningún mes.
-- =====================================================================
ALTER TABLE public.savings_accounts
    ADD COLUMN IF NOT EXISTS initial_balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (initial_balance >= 0);

NOTIFY pgrst, 'reload schema';
