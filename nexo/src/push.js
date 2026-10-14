// Web Push en el navegador: permisos, suscripción y registro en Supabase.
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

// 'unsupported' | 'needs-install' | 'missing-key' | 'denied' | 'default' | 'granted'
export function pushStatus() {
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApi) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (!VAPID_KEY) return 'missing-key';
  return Notification.permission;
}

export function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(sub) {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k);
  const b = urlBase64ToUint8Array(VAPID_KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration(timeoutMs = 8000) {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) await navigator.serviceWorker.register('/sw.js');
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error('El service worker no respondió.')), timeoutMs)),
  ]);
}

async function currentSubscription(reg, create) {
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub)) { await sub.unsubscribe(); sub = null; } // cambiaron las claves VAPID
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) });
  }
  return sub;
}

async function save(supabase, sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent,
  });
  if (error) throw new Error(error.message);
}

// Llamar directo desde un toque/clic: Safari solo pide permiso dentro de un gesto del usuario.
export async function enablePush(supabase) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  const reg = await registration();
  const sub = await currentSubscription(reg, true);
  await save(supabase, sub);
  return 'granted';
}

// Al abrir la app: re-registra la suscripción (rotaciones, cambio de cuenta, claves nuevas).
export async function syncPush(supabase) {
  if (pushStatus() !== 'granted') return false;
  try {
    const reg = await registration();
    const sub = await currentSubscription(reg, true);
    if (sub) await save(supabase, sub);
    return Boolean(sub);
  } catch {
    return false;
  }
}

export async function thisDeviceEndpoint() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint || null;
}

export async function disablePush(supabase) {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

// Al cerrar sesión: este dispositivo deja de recibir avisos de la cuenta.
export async function forgetDevice(supabase) {
  const endpoint = await thisDeviceEndpoint().catch(() => null);
  if (endpoint) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
}

export async function sendTestPush(supabase) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
  return body;
}
