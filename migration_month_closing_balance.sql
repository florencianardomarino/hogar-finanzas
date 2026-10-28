-- =====================================================================
-- MIGRACIÓN: saldo de cierre congelado por mes
-- Ejecutar en el editor SQL de Supabase. Es idempotente y no modifica datos existentes.
--
-- Al cerrar un mes, la app guarda su saldo final en closing_balance. A partir de
-- ahí los meses siguientes se encadenan desde ese saldo, aunque se registren
-- ajustes posteriores al cierre.
--
-- Los meses que ya estaban cerrados quedan con closing_balance NULL (se siguen
-- calculando en vivo). Para congelarlos: reabrir el mes (admin) y volver a cerrarlo.
-- =====================================================================

ALTER TABLE public.months
    ADD COLUMN IF NOT EXISTS closing_balance NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE;
