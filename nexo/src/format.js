export const mxn = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

export function fmtDue(due) {
  if (!due) return '';
  const [d, t] = due.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const label = new Date(y, m - 1, day).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  return t ? `${label} · ${t.slice(0, 5)}` : label;
}

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const REMINDER_PRESETS = [
  ['none', 'Sin aviso'],
  ['at', 'Aviso a la hora'],
  ['10m', '10 min antes'],
  ['1h', '1 h antes'],
  ['1d', '1 día antes'],
  ['custom', 'Aviso en otra hora…'],
];
const OFFSETS = { at: 0, '10m': 10 * 60e3, '1h': 3600e3, '1d': 86400e3 };

// Calcula el instante del aviso (ISO UTC) a partir de horas locales del navegador
// ("YYYY-MM-DDTHH:mm" de <input type="datetime-local">). Lanza Error con mensaje para el usuario.
export function computeRemindAt(preset, due, custom, now = new Date()) {
  if (!preset || preset === 'none') return null;
  let at;
  if (preset === 'custom') {
    if (!custom) throw new Error('Elige la hora del aviso.');
    at = new Date(custom);
  } else {
    if (!due) throw new Error('Pon fecha y hora límite para usar ese aviso.');
    at = new Date(new Date(due).getTime() - OFFSETS[preset]);
  }
  if (Number.isNaN(at.getTime())) throw new Error('Hora de aviso inválida.');
  if (at.getTime() < now.getTime() - 60e3) throw new Error('La hora del aviso ya pasó.');
  return at.toISOString();
}

export function fmtInstant(iso) {
  return new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
