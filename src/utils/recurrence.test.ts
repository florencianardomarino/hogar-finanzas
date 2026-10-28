import { describe, it, expect } from 'vitest';
import { isSameSeries, normalizeDescription, getDayOfMonth } from './recurrence';

describe('normalizeDescription', () => {
  it('recorta espacios y pasa a minúsculas', () => {
    expect(normalizeDescription('  Sueldo ')).toBe('sueldo');
  });

  it('tolera null y undefined', () => {
    expect(normalizeDescription(null)).toBe('');
    expect(normalizeDescription(undefined)).toBe('');
  });
});

describe('isSameSeries', () => {
  it('coincide por grupo aunque la descripción haya cambiado', () => {
    expect(isSameSeries(
      { description: 'Alquiler', recurrence_group_id: 'g1' },
      { description: 'Alquiler mayo', recurrence_group_id: 'g1' },
    )).toBe(true);
  });

  it('sin grupo coincide por descripción normalizada', () => {
    expect(isSameSeries({ description: 'Sueldo' }, { description: ' sueldo ' })).toBe(true);
  });

  it('grupos distintos con descripción distinta no coinciden', () => {
    expect(isSameSeries(
      { description: 'A', recurrence_group_id: 'g1' },
      { description: 'B', recurrence_group_id: 'g2' },
    )).toBe(false);
  });

  it('grupos distintos con la misma descripción siguen considerándose la misma serie', () => {
    expect(isSameSeries(
      { description: 'Sueldo', recurrence_group_id: 'g1' },
      { description: 'Sueldo', recurrence_group_id: 'g2' },
    )).toBe(true);
  });
});

describe('getDayOfMonth', () => {
  it('extrae el día de YYYY-MM-DD', () => {
    expect(getDayOfMonth('2026-07-31')).toBe(31);
    expect(getDayOfMonth('2026-07-05T10:00:00Z')).toBe(5);
  });

  it('devuelve null si la fecha es inválida o falta', () => {
    expect(getDayOfMonth('invalida')).toBeNull();
    expect(getDayOfMonth(undefined)).toBeNull();
    expect(getDayOfMonth('2026-07-00')).toBeNull();
  });
});
