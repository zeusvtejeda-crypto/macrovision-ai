// Fecha/hora "local" del usuario a partir de su zona IANA (p. ej. America/Mexico_City).
export function safeTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/Mexico_City';
  }
}

export function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const weekday = new Intl.DateTimeFormat('es-MX', { timeZone: tz, weekday: 'long' }).format(now);
  return { today, time: `${parts.hour}:${parts.minute}`, weekday };
}
