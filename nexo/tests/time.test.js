import { describe, it, expect } from 'vitest';
import { zonedToUtc, formatInZone, localNow } from '../api/_lib/time.js';

describe('zonedToUtc', () => {
  it('CDMX es UTC-6 todo el año (sin horario de verano desde 2022)', () => {
    expect(zonedToUtc('2026-10-15T09:00', 'America/Mexico_City').toISOString()).toBe('2026-10-15T15:00:00.000Z');
    expect(zonedToUtc('2026-07-01T23:30', 'America/Mexico_City').toISOString()).toBe('2026-07-02T05:30:00.000Z');
  });

  it('respeta el horario de verano (Nueva York, Madrid)', () => {
    expect(zonedToUtc('2026-03-07T12:00', 'America/New_York').toISOString()).toBe('2026-03-07T17:00:00.000Z'); // EST
    expect(zonedToUtc('2026-03-09T12:00', 'America/New_York').toISOString()).toBe('2026-03-09T16:00:00.000Z'); // EDT
    expect(zonedToUtc('2026-11-01T00:30', 'America/New_York').toISOString()).toBe('2026-11-01T04:30:00.000Z'); // antes del cambio
    expect(zonedToUtc('2026-11-01T12:00', 'America/New_York').toISOString()).toBe('2026-11-01T17:00:00.000Z'); // después
    expect(zonedToUtc('2026-08-01T10:00', 'Europe/Madrid').toISOString()).toBe('2026-08-01T08:00:00.000Z');
  });

  it('hora inexistente (salto de primavera) se resuelve sin fallar', () => {
    const d = zonedToUtc('2026-03-08T02:30', 'America/New_York');
    expect(d).toBeInstanceOf(Date);
    expect(['2026-03-08T06:30:00.000Z', '2026-03-08T07:30:00.000Z']).toContain(d.toISOString());
  });

  it('solo fecha → 09:00 local; fechas inválidas → null', () => {
    expect(zonedToUtc('2026-10-15', 'America/Mexico_City').toISOString()).toBe('2026-10-15T15:00:00.000Z');
    for (const bad of ['2026-02-30T10:00', '2026-13-01', '2026-10-15T24:00', 'mañana', '', null, '2026-10-15T09:00Z']) {
      expect(zonedToUtc(bad, 'America/Mexico_City')).toBeNull();
    }
  });

  it('formatInZone es la inversa', () => {
    for (const tz of ['America/Mexico_City', 'America/New_York', 'Asia/Tokyo', 'America/Tijuana']) {
      expect(formatInZone(zonedToUtc('2026-12-31T23:59', tz), tz)).toBe('2026-12-31T23:59');
    }
  });

  it('localNow sigue funcionando', () => {
    expect(localNow('America/Mexico_City', new Date('2026-10-15T03:30:00Z'))).toMatchObject({ today: '2026-10-14', time: '21:30' });
  });
});
