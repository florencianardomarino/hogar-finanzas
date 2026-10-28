-- =====================================================================
-- MIGRACIÓN: recurrentes y conciliación con columnas reales
-- Ejecutar en el editor SQL de Supabase. Es idempotente: se puede volver a
-- ejecutar sin riesgo (por ejemplo, para limpiar filas que una versión vieja
-- de la app haya creado con marcadores invisibles antes del despliegue).
--
-- Antes la app guardaba estado como caracteres invisibles al final del texto:
--   U+200B en ingresos  -> ingreso recurrente
--   U+200C en gastos    -> gasto marcado como debitado
--   U+200D en gastos    -> gasto marcado como pendiente
-- Ahora:
--   incomes.is_recurring, incomes.recurrence_group_id
--   expenses.recurrence_group_id, expenses.reconciled (NULL = automático por fecha)
--
-- La migración no borra ni cambia importes, fechas ni meses. Solo convierte los
-- marcadores en columnas y limpia la descripción.
-- =====================================================================

BEGIN;

ALTER TABLE public.incomes
    ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS recurrence_group_id UUID;

ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS recurrence_group_id UUID,
    ADD COLUMN IF NOT EXISTS reconciled BOOLEAN;

-- 1. Marcadores -> columnas (primero se leen, después se limpia la descripción)
UPDATE public.incomes
SET is_recurring = true
WHERE description LIKE '%' || chr(8203);

UPDATE public.expenses
SET reconciled = CASE
        WHEN description LIKE '%' || chr(8204) THEN true
        WHEN description LIKE '%' || chr(8205) THEN false
        ELSE reconciled
    END
WHERE description LIKE '%' || chr(8204) OR description LIKE '%' || chr(8205);

UPDATE public.incomes
SET description = regexp_replace(description, '[' || chr(8203) || chr(8204) || chr(8205) || ']+$', '')
WHERE description ~ ('[' || chr(8203) || chr(8204) || chr(8205) || ']+$');

UPDATE public.expenses
SET description = regexp_replace(description, '[' || chr(8203) || chr(8204) || chr(8205) || ']+$', '')
WHERE description ~ ('[' || chr(8203) || chr(8204) || chr(8205) || ']+$');

-- 2. Agrupar las series recurrentes existentes.
--    Mismo criterio que usaba la app: mismo hogar y misma descripción (sin distinguir
--    mayúsculas ni espacios); en gastos, además la misma categoría.
WITH income_series AS (
    SELECT m.household_id, lower(btrim(i.description)) AS key, gen_random_uuid() AS gid
    FROM public.incomes i
    JOIN public.months m ON m.id = i.month_id
    WHERE i.is_recurring AND i.recurrence_group_id IS NULL
    GROUP BY m.household_id, lower(btrim(i.description))
)
UPDATE public.incomes i
SET recurrence_group_id = s.gid
FROM public.months m, income_series s
WHERE m.id = i.month_id
  AND i.is_recurring
  AND i.recurrence_group_id IS NULL
  AND s.household_id = m.household_id
  AND s.key = lower(btrim(i.description));

WITH expense_series AS (
    SELECT m.household_id, lower(btrim(e.description)) AS key, e.category_id, gen_random_uuid() AS gid
    FROM public.expenses e
    JOIN public.months m ON m.id = e.month_id
    WHERE e.is_recurring AND e.recurrence_group_id IS NULL AND e.installment_id IS NULL
    GROUP BY m.household_id, lower(btrim(e.description)), e.category_id
)
UPDATE public.expenses e
SET recurrence_group_id = s.gid
FROM public.months m, expense_series s
WHERE m.id = e.month_id
  AND e.is_recurring
  AND e.recurrence_group_id IS NULL
  AND e.installment_id IS NULL
  AND s.household_id = m.household_id
  AND s.key = lower(btrim(e.description))
  AND s.category_id IS NOT DISTINCT FROM e.category_id;

CREATE INDEX IF NOT EXISTS idx_incomes_recurrence_group ON public.incomes (recurrence_group_id);
CREATE INDEX IF NOT EXISTS idx_expenses_recurrence_group ON public.expenses (recurrence_group_id);

COMMIT;
