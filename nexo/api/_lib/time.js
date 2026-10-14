// Fecha/hora "local" del usuario a partir de su zona IANA (p. ej. America/Mexico_City).
export function safeTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return 'America/Mexico_City';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/Mexico_City';
  }
}

function zonedParts(tz, date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((x) => [x.type, x.value])
  );
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

const pad = (n) => String(n).padStart(2, '0');

export function localNow(tz, now = new Date()) {
  const p = zonedParts(tz, now);
  const weekday = new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long' }).format(now);
  return { today: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}`, weekday };
}

// Diferencia (ms) entre la hora de pared en `tz` y UTC en el instante `ts`.
function offsetMs(tz, ts) {
  const p = zonedParts(tz, new Date(ts));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

// Convierte una hora local ("YYYY-MM-DDTHH:mm" o "YYYY-MM-DD" → 09:00) en `tz` a un Date (instante UTC).
// Devuelve null si el texto no es una fecha válida.
export function zonedToUtc(local, tz, defaultTime = '09:00') {
  const m = typeof local === 'string' ? LOCAL_RE.exec(local.trim()) : null;
  if (!m) return null;
  const [dh, dm] = defaultTime.split(':');
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] ?? dh, m[5] ?? dm, m[6] ?? '0'].map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) return null;
  // Dos pasadas resuelven los cambios de horario (DST).
  let ts = wall - offsetMs(tz, wall);
  ts = wall - offsetMs(tz, ts);
  return new Date(ts);
}

// Instante → "YYYY-MM-DDTHH:mm" en la zona del usuario.
export function formatInZone(date, tz) {
  const p = zonedParts(tz, date instanceof Date ? date : new Date(date));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}
