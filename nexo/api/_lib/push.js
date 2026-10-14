import webpush from 'web-push';

// Solo enviamos a servicios de push reales (evita que una suscripción falsa convierta
// el servidor en un proxy hacia URLs arbitrarias). Debe coincidir con is_push_endpoint() en SQL.
const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com']);
const SUFFIX_HOSTS = ['.push.apple.com', '.notify.windows.com'];

export function isPushEndpoint(url) {
  if (typeof url !== 'string' || url.length >= 1024) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return EXACT_HOSTS.has(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s) && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host));
}

// Devuelve { publicKey, privateKey, subject } o null si falta configuración.
export function vapidFromEnv(env = process.env) {
  const publicKey = env.VITE_VAPID_PUBLIC_KEY || env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  const subject = env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) return null; // Apple rechaza sujetos mal formados
  return { publicKey, privateKey, subject };
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

export function reminderPayload(task) {
  const title = String(task.title || 'Recordatorio').slice(0, 120);
  return {
    title: `⏰ ${title}`,
    body: task.due_at ? `Vence ${formatLocalStamp(task.due_at)}` : 'Recordatorio de NEXO',
    tag: `task-${task.task_id ?? task.id}`,
    url: '/?tab=tasks',
  };
}
