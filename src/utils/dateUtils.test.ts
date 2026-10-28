import { describe, it, expect } from 'vitest';
import {
  getFinancialPeriod,
  getPeriodRange,
  getPeriodList,
  getPeriodLabel,
  arePeriodsEqual,
  toISODateString,
  formatCompactDate,
} from './dateUtils';

describe('getFinancialPeriod', () => {
  it('el día de inicio pertenece al mes en curso', () => {
    expect(getFinancialPeriod('2026-06-10', 10)).toEqual({ year: 2026, month: 6 });
  });

  it('un día posterior al inicio pertenece al mes en curso', () => {
    expect(getFinancialPeriod('2026-06-30', 10)).toEqual({ year: 2026, month: 6 });
  });

  it('un día anterior al inicio pertenece al mes anterior', () => {
    expect(getFinancialPeriod('2026-06-09', 10)).toEqual({ year: 2026, month: 5 });
  });

  it('cruza el año hacia atrás en enero', () => {
    expect(getFinancialPeriod('2026-01-05', 10)).toEqual({ year: 2025, month: 12 });
  });

  it('con inicio en 1 nunca retrocede de mes', () => {
    expect(getFinancialPeriod('2026-03-01', 1)).toEqual({ year: 2026, month: 3 });
    expect(getFinancialPeriod('2026-03-31', 1)).toEqual({ year: 2026, month: 3 });
  });

  it('acepta objetos Date', () => {
    expect(getFinancialPeriod(new Date(2026, 5, 9), 10)).toEqual({ year: 2026, month: 5 });
    expect(getFinancialPeriod(new Date(2026, 5, 10), 10)).toEqual({ year: 2026, month: 6 });
  });

  it('ignora la parte horaria de un string ISO completo', () => {
    expect(getFinancialPeriod('2026-06-10T23:59:59Z', 10)).toEqual({ year: 2026, month: 6 });
    expect(getFinancialPeriod('2026-06-09T00:00:00Z', 10)).toEqual({ year: 2026, month: 5 });
  });
});

describe('getPeriodRange', () => {
  it('va del día de inicio al día anterior del mes siguiente', () => {
    const { start, end } = getPeriodRange(2026, 6, 10);
    expect(toISODateString(start)).toBe('2026-06-10');
    expect(toISODateString(end)).toBe('2026-07-09');
  });

  it('cruza el año en diciembre', () => {
    const { start, end } = getPeriodRange(2026, 12, 10);
    expect(toISODateString(start)).toBe('2026-12-10');
    expect(toISODateString(end)).toBe('2027-01-09');
  });

  it('con inicio en 1 termina el último día del mismo mes', () => {
    const { start, end } = getPeriodRange(2026, 2, 1);
    expect(toISODateString(start)).toBe('2026-02-01');
    expect(toISODateString(end)).toBe('2026-02-28');
  });

  it('con inicio en 1 y diciembre termina el 31 de diciembre del mismo año', () => {
    const { start, end } = getPeriodRange(2026, 12, 1);
    expect(toISODateString(start)).toBe('2026-12-01');
    expect(toISODateString(end)).toBe('2026-12-31');
  });

  it('el fin incluye todo el último día', () => {
    const { end } = getPeriodRange(2026, 6, 10);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });
});

describe('getPeriodList', () => {
  it('genera 6 meses atrás, el actual y 6 adelante por defecto', () => {
    const list = getPeriodList({ year: 2026, month: 6 });
    expect(list).toHaveLength(13);
    expect(list[0]).toEqual({ year: 2025, month: 12 });
    expect(list[6]).toEqual({ year: 2026, month: 6 });
    expect(list[12]).toEqual({ year: 2026, month: 12 });
  });

  it('cruza los límites de año en ambos sentidos', () => {
    const list = getPeriodList({ year: 2026, month: 1 }, 2, 2);
    expect(list).toEqual([
      { year: 2025, month: 11 },
      { year: 2025, month: 12 },
      { year: 2026, month: 1 },
      { year: 2026, month: 2 },
      { year: 2026, month: 3 },
    ]);
  });
});

describe('utilidades menores', () => {
  it('getPeriodLabel nombra el mes en español', () => {
    expect(getPeriodLabel(2026, 1)).toBe('Enero 2026');
    expect(getPeriodLabel(2026, 12)).toBe('Diciembre 2026');
  });

  it('getPeriodLabel tolera meses fuera de rango', () => {
    expect(getPeriodLabel(2026, 13)).toBe('13/2026');
  });

  it('arePeriodsEqual compara año y mes', () => {
    expect(arePeriodsEqual({ year: 2026, month: 6 }, { year: 2026, month: 6 })).toBe(true);
    expect(arePeriodsEqual({ year: 2026, month: 6 }, { year: 2025, month: 6 })).toBe(false);
  });

  it('toISODateString usa la fecha local sin desfases', () => {
    expect(toISODateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formatCompactDate abrevia día y mes', () => {
    expect(formatCompactDate('2026-05-30')).toBe('30 May');
    expect(formatCompactDate('2026-01-05')).toBe('5 Ene');
    expect(formatCompactDate('invalido')).toBe('invalido');
  });
});
