/**
 * Utilidades de fecha para el ciclo financiero del hogar
 */

export interface FinancialPeriod {
  year: number;
  month: number; // 1 a 12
}

/**
 * Obtiene el período financiero al que pertenece una fecha física dada,
 * basado en el día de inicio de ciclo de facturación del hogar.
 * 
 * Si el día de inicio es 10:
 * - Del 10 de junio al 9 de julio pertence a "Junio".
 * - Del 1 al 9 de junio pertenece a "Mayo".
 */
export function getFinancialPeriod(date: Date | string, billingCycleStartDay: number): FinancialPeriod {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  // Usamos métodos UTC o locales. Para evitar problemas de zona horaria al registrar
  // fechas puras de la base de datos "YYYY-MM-DD", realizamos el parsing con cuidado.
  let year = d.getFullYear();
  let month = d.getMonth() + 1; // 0-indexed -> 1-indexed
  const day = d.getDate();

  if (isNaN(year) || isNaN(month)) {
    // Fallback por si hay error de parsing
    const today = new Date();
    year = today.getFullYear();
    month = today.getMonth() + 1;
  }

  if (day < billingCycleStartDay) {
    // Si el día es menor al día de inicio de facturación, pertenece al mes anterior
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }

  return { year, month };
}

/**
 * Obtiene el rango de fechas físicas (inicio y fin) de un período financiero dado.
 * 
 * Si billingCycleStartDay = 10, y el período es Junio 2026:
 * - Inicio: 2026-06-10
 * - Fin: 2026-07-09
 */
export function getPeriodRange(year: number, month: number, billingCycleStartDay: number): { start: Date; end: Date } {
  // El inicio es el día X del mes especificado
  const start = new Date(year, month - 1, billingCycleStartDay, 0, 0, 0, 0);
  
  // El fin es el día X-1 del mes siguiente
  let endMonth = month;
  let endYear = year;
  
  if (endMonth === 12) {
    endMonth = 1;
    endYear += 1;
  } else {
    endMonth += 1;
  }

  // Si el día de inicio es 1, el día anterior es el último día del mes actual
  let endDay = billingCycleStartDay - 1;
  let finalEndMonth = endMonth - 1;
  let finalEndYear = endYear;

  if (endDay === 0) {
    // Si startDay era 1, entonces va del 1 al último día de ese mismo mes
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    endDay = lastDayOfMonth;
    finalEndMonth = month - 1;
  }

  const end = new Date(finalEndYear, finalEndMonth, endDay, 23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Formatea un número de mes a su nombre en español
 */
export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function getPeriodLabel(year: number, month: number): string {
  if (month < 1 || month > 12) return `${month}/${year}`;
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * Obtiene una lista de períodos financieros consecutivos.
 * Útil para la navegación de meses (historial y futuros).
 */
export function getPeriodList(currentPeriod: FinancialPeriod, monthsBehind = 6, monthsAhead = 6): FinancialPeriod[] {
  const list: FinancialPeriod[] = [];
  
  // Generar meses pasados
  for (let i = monthsBehind; i > 0; i--) {
    let m = currentPeriod.month - i;
    let y = currentPeriod.year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    list.push({ year: y, month: m });
  }

  // Agregar mes actual
  list.push({ ...currentPeriod });

  // Generar meses futuros
  for (let i = 1; i <= monthsAhead; i++) {
    let m = currentPeriod.month + i;
    let y = currentPeriod.year;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    list.push({ year: y, month: m });
  }

  return list;
}

/**
 * Compara si dos períodos financieros son iguales
 */
export function arePeriodsEqual(p1: FinancialPeriod, p2: FinancialPeriod): boolean {
  return p1.year === p2.year && p1.month === p2.month;
}

/**
 * Convierte un objeto de fecha Date a string ISO YYYY-MM-DD sin problemas de huso horario local
 */
export function toISODateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formatea una fecha física para mostrarla en listas compactas (ej. "30 de Mayo" o "30 May")
 */
export function formatCompactDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  
  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  
  const shortMonths = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${day} ${shortMonths[monthIdx]}`;
}
