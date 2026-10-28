/**
 * Utilidades para series recurrentes (ingresos y gastos que se repiten cada mes).
 * Cada fila recurrente pertenece a una serie identificada por recurrence_group_id; las filas
 * antiguas sin grupo se siguen emparejando por descripción.
 */

interface SeriesRow {
  description?: string | null;
  recurrence_group_id?: string | null;
}

export function normalizeDescription(description: string | null | undefined): string {
  return (description || '').trim().toLowerCase();
}

/** Dos filas son de la misma serie si comparten grupo o, en su defecto, la descripción. */
export function isSameSeries(a: SeriesRow, b: SeriesRow): boolean {
  if (a.recurrence_group_id && b.recurrence_group_id && a.recurrence_group_id === b.recurrence_group_id) {
    return true;
  }
  return normalizeDescription(a.description) === normalizeDescription(b.description);
}

/** Día del mes (1-31) de una fecha YYYY-MM-DD, o null si no es válida. */
export function getDayOfMonth(date: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '');
  if (!match) return null;
  const day = parseInt(match[3], 10);
  return day >= 1 && day <= 31 ? day : null;
}
