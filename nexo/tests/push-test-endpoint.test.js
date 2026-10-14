// Contrato de /api/push/test que usa la UI: { total, delivered, removed, failed }.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import webpush from 'web-push';
import { fakeDb } from './fakeDb.js';

const state = { db: null, sent: [] };
vi.mock('../api/_lib/supabase.js', async (orig) => ({
  ...(await orig()),
  userClient: async (req) => (req.headers.authorization ? { db: state.db, user: { id: 'A' } } : { status: 401, error: 'Inicia sesión.' }),
}));
vi.mock('web-push', async (orig) => {
  const real = (await orig()).default;
  return {
    default: {
      ...real,
      sendNotification: async (sub, body) => {
        state.sent.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
        if (sub.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      },
    },
  };
});
const { default: handler } = await import('../api/push/test.js');

const keys = webpush.generateVAPIDKeys();
const res = () => { const r = { statusCode: 0 }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
const sub = (id, user, path) => ({ id, user_id: user, endpoint: `https://fcm.googleapis.com/fcm/send/${path}`, p256dh: 'k', auth: 'a' });

describe('/api/push/test', () => {
  beforeEach(() => {
    Object.assign(process.env, { VITE_VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:yo@ejemplo.com' });
    state.sent = [];
  });

  it('envía solo a los dispositivos del usuario y limpia los caducados', async () => {
    const store = { push_subscriptions: [sub('a1', 'A', 'ok'), sub('a2', 'A', 'gone'), sub('b1', 'B', 'otro')] };
    state.db = fakeDb(store, 'A');
    const r = res();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' } }, r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ total: 2, delivered: 1, removed: 1, failed: 0 });
    expect(state.sent.map((s) => s.endpoint.split('/').pop()).sort()).toEqual(['gone', 'ok']);
    expect(state.sent[0].body).toMatchObject({ title: '✅ NEXO', tag: 'nexo-test' });
    expect(store.push_subscriptions.map((s) => s.id)).toEqual(['a1', 'b1']);
  });

  it('409 si no hay dispositivos', async () => {
    state.db = fakeDb({ push_subscriptions: [] }, 'A');
    const r = res();
    await handler({ method: 'POST', headers: { authorization: 'Bearer t' } }, r);
    expect(r.statusCode).toBe(409);
  });
});
