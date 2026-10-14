// Ajustes por cuenta (zona horaria, moneda, preferencias de notificaciones), con valores por defecto.
import { useMemo } from 'react';
import { useRows, useStore } from './provider.jsx';

export const DEFAULT_SETTINGS = { time_zone: 'America/Mazatlan', currency: 'MXN', locale: 'es-MX', prefs: {} };

export function useSettings() {
  const rows = useRows('settings');
  return useMemo(() => ({ ...DEFAULT_SETTINGS, ...(rows[0] || {}), prefs: { ...(rows[0]?.prefs || {}) } }), [rows]);
}

export function useUpdateSettings() {
  const store = useStore();
  const rows = useRows('settings');
  return async (patch) => {
    const cur = rows[0];
    if (cur) return store.save('settings', { id: cur.id, ...patch });
    return store.save('settings', { ...DEFAULT_SETTINGS, ...patch });
  };
}

// 'YYYY-MM-DD' de hoy en la zona configurada.
export function todayIn(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
