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
