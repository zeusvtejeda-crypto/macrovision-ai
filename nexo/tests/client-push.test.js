// src/push.js con un navegador y un Supabase simulados.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import webpush from 'web-push';
import { fakeDb } from './fakeDb.js';

const KEY = webpush.generateVAPIDKeys().publicKey;
const OTHER_KEY = webpush.generateVAPIDKeys().publicKey;
const b64 = (s) => Uint8Array.from(Buffer.from(s, 'base64url'));

let seq = 0;
function fakeBrowser({ permission = 'granted', askResult = 'granted', ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' } = {}) {
  const state = { sub: null, subscribeCalls: 0, permission };
  const makeSub = (key) => {
    const endpoint = `https://web.push.apple.com/dev${++seq}`;
    const sub = {
      endpoint,
      options: { applicationServerKey: b64(key).buffer },
      toJSON: () => ({ endpoint, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } }),
      unsubscribe: async () => { if (state.sub === sub) state.sub = null; return true; },
    };
    return sub;
  };
  const pushManager = {
    getSubscription: async () => state.sub,
    subscribe: async ({ applicationServerKey }) => {
      state.subscribeCalls++;
      state.sub = makeSub(Buffer.from(applicationServerKey).toString('base64url'));
      return state.sub;
    },
  };
  const reg = { pushManager };
  const store = new Map();
  Object.assign(globalThis, {
    window: globalThis,
    PushManager: function PushManager() {},
    Notification: { get permission() { return state.permission; }, requestPermission: async () => (state.permission = askResult) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    dispatchEvent: () => true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: ua, platform: 'iPhone', maxTouchPoints: 5, serviceWorker: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) } },
  });
  state.rotate = (key = KEY) => { state.sub = makeSub(key); };
  return state;
}

function fakeSupabase(store, userId = 'u1') {
  return fakeDb(store, userId, {
    rpc: {
      register_push_subscription: ({ p_endpoint, p_user_agent }, st) => {
        st.push_subscriptions ??= [];
        const existing = st.push_subscriptions.find((r) => r.endpoint === p_endpoint);
        if (existing) Object.assign(existing, { user_id: userId, user_agent: p_user_agent });
        else st.push_subscriptions.push({ id: `s${++seq}`, user_id: userId, endpoint: p_endpoint, user_agent: p_user_agent });
        return 'ok';
      },
    },
  });
}

async function load(key = KEY) {
  vi.resetModules();
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', key);
  return import('../src/push.js');
}

describe('cliente push', () => {
  let browser, store, db, push;
  beforeEach(async () => {
    browser = fakeBrowser();
    store = { push_subscriptions: [] };
    db = fakeSupabase(store);
    push = await load();
  });

  it('activar suscribe, registra con nombre legible y queda activo', async () => {
    browser.permission = 'default';
    expect(await push.enablePush(db)).toBe('granted');
    expect(store.push_subscriptions).toHaveLength(1);
    expect(store.push_subscriptions[0]).toMatchObject({ endpoint: browser.sub.endpoint, user_agent: 'iPhone' });
    expect(await push.syncPush(db)).toBe(true);
    expect(browser.subscribeCalls).toBe(1);
  });

  it('permiso denegado → no suscribe', async () => {
    browser = fakeBrowser({ permission: 'default', askResult: 'denied' });
    push = await load();
    expect(await push.enablePush(db)).toBe('denied');
    expect(browser.subscribeCalls).toBe(0);
    expect(store.push_subscriptions).toHaveLength(0);
  });

  it('abrir la app sin haber activado nunca NO suscribe aunque haya permiso', async () => {
    expect(await push.syncPush(db)).toBe(false);
    expect(browser.subscribeCalls).toBe(0);
    expect(store.push_subscriptions).toHaveLength(0);
  });

  it('Desactivar se respeta al volver a abrir la app', async () => {
    await push.enablePush(db);
    await push.disablePush(db);
    expect(store.push_subscriptions).toHaveLength(0);
    expect(browser.sub).toBeNull();
    push = await load(); // reabrir
    expect(await push.syncPush(db)).toBe(false);
    expect(browser.subscribeCalls).toBe(1);
    expect(store.push_subscriptions).toHaveLength(0);
  });

  it('Quitar este dispositivo desde otro equipo se respeta al reabrir', async () => {
    await push.enablePush(db);
    store.push_subscriptions.length = 0; // borrado desde el Mac (o limpiado por 410)
    push = await load();
    expect(await push.syncPush(db)).toBe(false);
    expect(browser.sub).toBeNull(); // se desuscribe localmente
    expect(store.push_subscriptions).toHaveLength(0);
    expect(browser.subscribeCalls).toBe(1);
  });

  it('si el navegador rotó la suscripción, se reemplaza en el servidor', async () => {
    await push.enablePush(db);
    const old = browser.sub.endpoint;
    browser.rotate();
    expect(await push.syncPush(db)).toBe(true);
    expect(store.push_subscriptions.map((r) => r.endpoint)).toEqual([browser.sub.endpoint]);
    expect(browser.sub.endpoint).not.toBe(old);
  });

  const markGone = () => store.push_subscriptions.forEach((r) => { r.gone_at = '2026-10-14T00:00:00Z'; });

  it('rotación cuando el cron YA marcó la fila vieja como caducada (410): se registra la nueva (no se apaga)', async () => {
    await push.enablePush(db);
    browser.rotate();                       // el SW re-suscribió (pushsubscriptionchange)
    markGone();                             // el cron recibió 410 en el endpoint viejo
    push = await load();
    expect(await push.syncPush(db)).toBe(true);
    expect(store.push_subscriptions.map((r) => r.endpoint)).toEqual([browser.sub.endpoint]);
    expect(await push.syncPush(db)).toBe(true); // estable en la siguiente apertura
  });

  it('el navegador perdió la suscripción y el servicio la dio por caducada: se vuelve a suscribir', async () => {
    await push.enablePush(db);
    browser.sub = null;
    markGone();
    expect(await push.syncPush(db)).toBe(true);
    expect(browser.subscribeCalls).toBe(2);
    expect(store.push_subscriptions.filter((r) => !r.gone_at)).toHaveLength(1);
  });

  it('el servicio dio por caducada la misma suscripción que tiene el navegador: se renueva', async () => {
    await push.enablePush(db);
    const old = browser.sub.endpoint;
    markGone();
    expect(await push.syncPush(db)).toBe(true);
    expect(browser.sub.endpoint).not.toBe(old);
    expect(store.push_subscriptions.map((r) => [r.endpoint, Boolean(r.gone_at)])).toEqual([[browser.sub.endpoint, false]]);
  });

  for (const [name, change] of [
    ['rotó', (b) => b.rotate()],
    ['se perdió', (b) => { b.sub = null; }],
    ['cambiaron las claves VAPID', (b) => b.rotate(OTHER_KEY)],
  ]) {
    it(`quitado desde otro equipo y además la suscripción ${name}: NO se reactiva`, async () => {
      await push.enablePush(db);
      store.push_subscriptions.length = 0; // Quitar desde el Mac
      change(browser);
      push = await load();
      expect(await push.syncPush(db)).toBe(false);
      expect(store.push_subscriptions).toHaveLength(0);
      expect(browser.sub).toBeNull();
      expect(browser.subscribeCalls).toBe(1);
    });
  }

  it('cerrar sesión sin red igual cancela la suscripción local', async () => {
    await push.enablePush(db);
    const offline = fakeSupabase(store);
    const from = offline.from.bind(offline);
    offline.from = (t) => { const q = from(t); q.delete = () => ({ eq: async () => ({ error: { message: 'Failed to fetch' } }) }); return q; };
    await expect(push.disablePush(offline)).rejects.toThrow('Failed to fetch');
    expect(browser.sub).toBeNull();
    push = await load();
    expect(await push.syncPush(db)).toBe(false); // y no se reactiva al reabrir
  });

  it('si cambiaron las claves VAPID, se vuelve a suscribir con la nueva', async () => {
    await push.enablePush(db);
    browser.rotate(OTHER_KEY); // suscripción con clave vieja
    expect(await push.syncPush(db)).toBe(true);
    expect(Buffer.from(browser.sub.options.applicationServerKey).toString('base64url')).toBe(KEY);
    expect(store.push_subscriptions).toHaveLength(1);
  });

  it('adopta una suscripción activada con la versión anterior (sin marca local)', async () => {
    browser.rotate();
    store.push_subscriptions.push({ id: 'legacy', user_id: 'u1', endpoint: browser.sub.endpoint });
    expect(await push.syncPush(db)).toBe(true);
    push = await load();
    store.push_subscriptions.length = 0;
    expect(await push.syncPush(db)).toBe(false); // y desde ahí respeta su eliminación
  });

  it('cerrar sesión (disablePush) borra la fila y desuscribe', async () => {
    await push.enablePush(db);
    await push.disablePush(db);
    expect(store.push_subscriptions).toHaveLength(0);
    expect(browser.sub).toBeNull();
  });

  it('estados y nombres de dispositivo', async () => {
    expect(push.pushStatus()).toBe('granted');
    expect(push.deviceLabel()).toBe('iPhone');
    fakeBrowser({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    Object.assign(navigator, { platform: 'MacIntel', maxTouchPoints: 5 });
    expect(push.deviceLabel()).toBe('iPad');
    navigator.maxTouchPoints = 0;
    expect(push.deviceLabel()).toBe('Mac · Safari');
    delete globalThis.PushManager;
    navigator.maxTouchPoints = 5;
    expect(push.pushStatus()).toBe('needs-install');
    push = await load('');
    globalThis.PushManager = function () {};
    expect(push.pushStatus()).toBe('missing-key');
  });
});
