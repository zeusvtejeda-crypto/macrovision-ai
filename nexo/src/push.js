// Web Push en el navegador: permisos, suscripción y registro en Supabase.
// Regla: solo se suscribe cuando el usuario pulsa "Activar avisos". Al abrir la app (syncPush)
// únicamente se mantiene lo que el usuario activó; nunca se reactiva algo que desactivó o quitó.
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const LS_KEY = 'nexo-push-endpoint'; // endpoint que el usuario activó en este dispositivo

export const PUSH_EVENT = 'nexo:push-changed';
const changed = () => window.dispatchEvent(new Event(PUSH_EVENT));

function stored() {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}
function setStored(endpoint) {
  try { endpoint ? localStorage.setItem(LS_KEY, endpoint) : localStorage.removeItem(LS_KEY); } catch {}
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

// Nombre legible para la lista de dispositivos (iPadOS se presenta como Mac en el user agent).
export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  if (/Macintosh/.test(ua)) return `Mac · ${browser}`;
  if (/Android/.test(ua)) return `Android · ${browser}`;
  if (/Windows/.test(ua)) return `Windows · ${browser}`;
  return browser;
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
  let timer;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('El service worker no respondió.')), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function subscribe(reg) {
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) });
}

async function save(supabase, sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: deviceLabel(),
  });
  if (error) throw new Error(error.message === 'invalid push endpoint' ? 'Este navegador usa un servicio push no compatible.' : error.message);
}

async function serverHas(supabase, endpoint) {
  const { data, error } = await supabase.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function removeRow(supabase, endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw new Error(error.message);
}

// Llamar directo desde un toque/clic: Safari solo pide permiso dentro de un gesto del usuario.
export async function enablePush(supabase) {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub)) { await sub.unsubscribe(); sub = null; } // cambiaron las claves VAPID
    if (!sub) sub = await subscribe(reg);
    await save(supabase, sub);
    setStored(sub.endpoint);
    return 'granted';
  } finally {
    changed();
  }
}

// Al abrir la app. Devuelve true si este dispositivo queda con avisos activos.
export async function syncPush(supabase) {
  if (pushStatus() !== 'granted') return false;
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    let mine = stored();

    // Activado con una versión anterior (sin marca local): se adopta si el servidor lo tiene.
    if (!mine && sub && (await serverHas(supabase, sub.endpoint))) { setStored(sub.endpoint); mine = sub.endpoint; }
    if (!mine) return false; // el usuario no activó avisos en este dispositivo

    const stillWanted = await serverHas(supabase, mine);
    if (sub && sub.endpoint === mine && sameKey(sub)) {
      if (stillWanted) return true;
      // Se quitó desde otro dispositivo o el servicio push la dio por caducada: respetarlo.
      await sub.unsubscribe().catch(() => {});
      setStored(null);
      return false;
    }
    if (!stillWanted) { // ya no se quiere y además cambió: limpiar sin volver a suscribir
      if (sub) await sub.unsubscribe().catch(() => {});
      setStored(null);
      return false;
    }
    // El navegador rotó la suscripción, la perdió o cambiaron las claves: reemplazarla.
    if (sub && !sameKey(sub)) { await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await subscribe(reg);
    await save(supabase, sub);
    if (sub.endpoint !== mine) await removeRow(supabase, mine).catch(() => {});
    setStored(sub.endpoint);
    return true;
  } catch {
    return false;
  } finally {
    changed();
  }
}

export async function thisDeviceEndpoint() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint || null;
}

// Desactivar en este dispositivo (también al cerrar sesión).
export async function disablePush(supabase) {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    const sub = await reg?.pushManager?.getSubscription();
    const endpoint = sub?.endpoint || stored();
    if (endpoint) await removeRow(supabase, endpoint);
    if (sub) await sub.unsubscribe();
    setStored(null);
  } finally {
    changed();
  }
}

export async function sendTestPush(supabase) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token}` } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
  return body;
}
