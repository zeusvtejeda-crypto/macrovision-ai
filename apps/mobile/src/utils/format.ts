const LOCALE = 'es-MX';

export function formatDate(date: Date | string, pattern: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  // Simple pattern handling without external deps
  if (pattern === 'yyyy') return String(d.getFullYear());

  if (pattern === 'EEE') {
    return d.toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '');
  }

  if (pattern === 'EEE d MMM') {
    const weekday = d.toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '');
    const day = d.getDate();
    const month = d.toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
    return `${weekday} ${day} ${month}`;
  }

  if (pattern === 'd MMM') {
    const day = d.getDate();
    const month = d.toLocaleDateString(LOCALE, { month: 'short' }).replace('.', '');
    return `${day} ${month}`;
  }

  if (pattern === 'dd/MM/yyyy') {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  if (pattern === 'HH:mm') {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  return d.toLocaleDateString(LOCALE);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function isToday(date: Date | string): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function formatCalories(value: number): string {
  return `${Math.round(value)} kcal`;
}

export function formatMacro(value: number, unit = 'g'): string {
  return `${Math.round(value)}${unit}`;
}

export function formatWeight(kg: number, unit: 'kg' | 'lbs' = 'kg'): string {
  if (unit === 'lbs') return `${(kg * 2.20462).toFixed(1)} lbs`;
  return `${kg.toFixed(1)} kg`;
}

export function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}
