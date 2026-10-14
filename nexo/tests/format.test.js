import { describe, it, expect } from 'vitest';
import { computeRemindAt } from '../src/format.js';

// vite.config.js fija TZ=America/Mexico_City (UTC-6): una hora local tratada como UTC fallaría aquí.
const now = new Date('2026-10-14T18:00:00Z'); // 12:00 en CDMX

describe('computeRemindAt (formulario de tareas)', () => {
  it('corre en la zona esperada', () => {
    expect(new Date('2026-10-15T18:00').toISOString()).toBe('2026-10-16T00:00:00.000Z');
  });

  it('presets relativos a la fecha límite (instantes literales)', () => {
    const due = '2026-10-15T18:00'; // 18:00 CDMX = 00:00Z del 16
    expect(computeRemindAt('none', due, '', now)).toBeNull();
    expect(computeRemindAt('at', due, '', now)).toBe('2026-10-16T00:00:00.000Z');
    expect(computeRemindAt('10m', due, '', now)).toBe('2026-10-15T23:50:00.000Z');
    expect(computeRemindAt('1h', due, '', now)).toBe('2026-10-15T23:00:00.000Z');
    expect(computeRemindAt('1d', due, '', now)).toBe('2026-10-15T00:00:00.000Z');
  });

  it('hora personalizada sin fecha límite', () => {
    expect(computeRemindAt('custom', '', '2026-10-14T20:00', now)).toBe('2026-10-15T02:00:00.000Z');
  });

  it('errores claros', () => {
    expect(() => computeRemindAt('1h', '', '', now)).toThrow('fecha y hora límite');
    expect(() => computeRemindAt('custom', '', '', now)).toThrow('Elige');
    expect(() => computeRemindAt('1d', '2026-10-15T09:00', '', now)).toThrow('ya pasó');
  });
});
