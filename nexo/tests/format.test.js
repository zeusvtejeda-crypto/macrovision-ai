import { describe, it, expect } from 'vitest';
import { computeRemindAt } from '../src/format.js';

const now = new Date('2026-10-14T12:00:00');

describe('computeRemindAt (formulario de tareas)', () => {
  it('presets relativos a la fecha límite', () => {
    const due = '2026-10-15T18:00';
    const base = new Date(due).getTime();
    expect(computeRemindAt('none', due, '', now)).toBeNull();
    expect(computeRemindAt('at', due, '', now)).toBe(new Date(base).toISOString());
    expect(computeRemindAt('10m', due, '', now)).toBe(new Date(base - 600e3).toISOString());
    expect(computeRemindAt('1h', due, '', now)).toBe(new Date(base - 3600e3).toISOString());
    expect(computeRemindAt('1d', due, '', now)).toBe(new Date(base - 86400e3).toISOString());
  });

  it('hora personalizada sin fecha límite', () => {
    expect(computeRemindAt('custom', '', '2026-10-14T20:00', now)).toBe(new Date('2026-10-14T20:00').toISOString());
  });

  it('errores claros', () => {
    expect(() => computeRemindAt('1h', '', '', now)).toThrow('fecha y hora límite');
    expect(() => computeRemindAt('custom', '', '', now)).toThrow('Elige');
    expect(() => computeRemindAt('1d', '2026-10-15T09:00', '', now)).toThrow('ya pasó');
  });
});
