import webpush from 'web-push';

// Solo enviamos a servicios de push reales (evita que una suscripción falsa convierta
// el servidor en un proxy hacia URLs arbitrarias). Debe coincidir con is_push_endpoint() en SQL.
// jmt17.google.com: Chrome Beta/Dev/Canary y Chromium sin marca.
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'android.googleapis.com', 'jmt17.google.com', 'updates.push.services.mozilla.com']);
const SUFFIX_HOSTS = ['.push.apple.com', '.notify.windows.com'];

export function isPushEndpoint(url) {
  if (typeof url !== 'string' || url.length >= 1024) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s) && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host));
}

// Problema de configuración VAPID (texto para el log/respuesta) o null si todo está bien.
// Se recortan espacios y saltos de línea: es fácil pegarlos en Vercel.
export function vapidProblem(env = process.env) {
  const publicKey = (env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (env.VAPID_SUBJECT || '').trim();
  if (!publicKey || !privateKey || !subject) return 'Faltan VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY o VAPID_SUBJECT.';
  if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) return 'VITE_VAPID_PUBLIC_KEY no tiene formato válido (genérala con npm run secrets).';
  if (!/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return 'VAPID_PRIVATE_KEY no tiene formato válido (genérala con npm run secrets).';
  if (!validSubject(subject)) return 'VAPID_SUBJECT inválido: usa mailto:tu@correo.com o https://tu-dominio (público, no localhost ni example.com).';
  return null;
}

// Devuelve { publicKey, privateKey, subject } o null si la configuración no es válida.
export function vapidFromEnv(env = process.env) {
  if (vapidProblem(env)) return null;
  return {
    publicKey: (env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY).trim(),
    privateKey: env.VAPID_PRIVATE_KEY.trim(),
    subject: env.VAPID_SUBJECT.trim(),
  };
}

// Apple responde 403 BadJwtToken si el sujeto no es un mailto:/https: público y bien formado.
// Se valida con el mismo parser (URL) que usa web-push.
function validSubject(subject) {
  let u;
  try { u = new URL(subject); } catch { return false; }
  let host;
  if (u.protocol === 'https:') {
    if (u.username || u.password) return false;
    host = u.hostname;
  } else if (u.protocol === 'mailto:') {
    const m = /^[^\s@/?#]+@([^\s@/?#]+)$/.exec(decodeURIComponent(u.pathname));
    host = m?.[1];
  } else return false;
  host = (host || '').toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9-]+$/.test(l) || l.startsWith('-') || l.endsWith('-'))) return false;
  if (labels.every((l) => /^\d+$/.test(l))) return false; // IP
  if (/(^|\.)example\.(com|net|org)$/.test(host)) return false; // dominios reservados de ejemplo (RFC 2606)
  return !/(^|\.)(localhost|local|test|invalid|example|internal)$/.test(host);
}

// Envía `payload` a cada suscripción. No lanza: clasifica resultados.
//   delivered: ids entregados · gone: ids a borrar (404/410 o endpoint no permitido)
//   failed: ids con error temporal (429/5xx/red) · invalid: ids rechazados por datos (400/403/413)
export async function sendToSubscriptions(subs, payload, {
  vapid, sender = webpush, ttl = 12 * 3600, urgency = 'high', allowEndpoint = isPushEndpoint, agent, timeout = 10000,
} = {}) {
  const out = { delivered: [], gone: [], failed: [], invalid: [] };
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (s) => {
    if (!allowEndpoint(s.endpoint)) { out.gone.push(s.id); return; }
    try {
      await sender.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: ttl, urgency, timeout, vapidDetails: vapid, ...(agent ? { agent } : {}) }
      );
      out.delivered.push(s.id);
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) out.gone.push(s.id);
      else if (code === 400 || code === 403 || code === 413) { out.invalid.push(s.id); console.warn('push rechazado', code, err?.body); }
      else { out.failed.push(s.id); console.warn('push falló', code || err?.code || err?.message); }
    }
  }));
  return out;
}

// "2026-10-15T09:00:00" (hora local sin zona) → "mié 15 oct · 09:00"
export function formatLocalStamp(local) {
  if (!local) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(local));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)));
  const day = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return m[4] ? `${day} · ${m[4]}:${m[5]}` : day;
}

export function reminderPayload(task, now = new Date()) {
  const title = String(task.title || 'Recordatorio').slice(0, 120);
  const lateMin = task.remind_at ? Math.round((now - new Date(task.remind_at)) / 60000) : 0;
  const late = lateMin >= 10 ? ` (aviso con ${lateMin >= 120 ? `${Math.round(lateMin / 60)} h` : `${lateMin} min`} de retraso)` : '';
  return {
    title: `⏰ ${title}`,
    body: (task.due_at ? `Vence ${formatLocalStamp(task.due_at)}` : 'Recordatorio de NEXO') + late,
    tag: `task-${task.task_id ?? task.id}`,
    url: '/?tab=tasks',
  };
}
