import { describe, it, expect, beforeEach } from 'vitest';
import cron from '../api/cron/reminders.js';
import pushTest from '../api/push/test.js';
import { hasBearerSecret } from '../api/_lib/supabase.js';

function mockRes() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
const call = async (h, req) => { const res = mockRes(); await h({ headers: {}, ...req }, res); return res; };

describe('/api/cron/reminders', () => {
  beforeEach(() => {
    Object.assign(process.env, {
      CRON_SECRET: 's3cr3t', VITE_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srv',
      VITE_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.co',
    });
  });

  it('405 para otros métodos', async () => expect((await call(cron, { method: 'PUT' })).statusCode).toBe(405));
  it('401 sin secreto o con secreto incorrecto', async () => {
    expect((await call(cron, { method: 'POST' })).statusCode).toBe(401);
    expect((await call(cron, { method: 'POST', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    expect((await call(cron, { method: 'GET', headers: { authorization: 'Bearer s3cr3t-extra' } })).statusCode).toBe(401);
  });
  it('500 si falta CRON_SECRET (falla cerrado)', async () => {
    delete process.env.CRON_SECRET;
    expect((await call(cron, { method: 'POST', headers: { authorization: 'Bearer ' } })).statusCode).toBe(500);
  });
  it('500 si faltan service role o VAPID', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await call(cron, { method: 'POST', headers: { authorization: 'Bearer s3cr3t' } })).statusCode).toBe(500);
  });
});

describe('/api/push/test', () => {
  beforeEach(() => {
    Object.assign(process.env, {
      VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_SUBJECT: 'mailto:a@b.co',
    });
  });
  it('solo POST', async () => expect((await call(pushTest, { method: 'GET' })).statusCode).toBe(405));
  it('exige sesión', async () => expect((await call(pushTest, { method: 'POST' })).statusCode).toBe(401));
  it('500 sin VAPID', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await call(pushTest, { method: 'POST', headers: { authorization: 'Bearer x' } })).statusCode).toBe(500);
  });
});

describe('hasBearerSecret', () => {
  it('compara exacto', () => {
    expect(hasBearerSecret({ headers: { authorization: 'Bearer abc' } }, 'abc')).toBe(true);
    expect(hasBearerSecret({ headers: { authorization: 'bearer abc' } }, 'abc')).toBe(true);
    expect(hasBearerSecret({ headers: { authorization: 'Bearer ab' } }, 'abc')).toBe(false);
    expect(hasBearerSecret({ headers: {} }, '')).toBe(false);
  });
});
