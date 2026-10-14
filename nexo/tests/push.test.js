import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import https from 'node:https';
import { createECDH, randomBytes, createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import webpush from 'web-push';
import ece from 'http_ece';
import { isPushEndpoint, vapidFromEnv, sendToSubscriptions, reminderPayload, formatLocalStamp } from '../api/_lib/push.js';
import { processDueReminders } from '../api/_lib/reminders.js';
import { fakeDb } from './fakeDb.js';

describe('isPushEndpoint', () => {
  it('acepta servicios de push reales', () => {
    for (const u of [
      'https://fcm.googleapis.com/fcm/send/abc:APA91',
      'https://web.push.apple.com/QGuQyavXutnMHT2Xaa',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAA',
      'https://jmt17.google.com/fcm/send/abc', // Chrome Beta/Canary
    ]) expect(isPushEndpoint(u), u).toBe(true);
  });
  it('rechaza todo lo demás (SSRF)', () => {
    for (const u of [
      'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com/',
      'https://fcm.googleapis.com@evil.com/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
      'https://169.254.169.254/latest', 'https://localhost/x', 'https://push.apple.com.evil.com/x', 'https://evilpush.apple.com.attacker.net/',
      'javascript:alert(1)', '', null, `https://fcm.googleapis.com/${'a'.repeat(1100)}`,
    ]) expect(isPushEndpoint(u), String(u).slice(0, 60)).toBe(false);
  });
});

describe('vapidFromEnv', () => {
  const keys = webpush.generateVAPIDKeys();
  const base = { VITE_VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'mailto:yo@ejemplo.com' };

  it('exige las tres variables con formato válido (y tolera saltos de línea al pegar)', () => {
    expect(vapidFromEnv(base)).toEqual({ ...keys, subject: 'mailto:yo@ejemplo.com' });
    expect(vapidFromEnv({ ...base, VITE_VAPID_PUBLIC_KEY: `${keys.publicKey}\n` })?.publicKey).toBe(keys.publicKey);
    expect(vapidFromEnv({ ...base, VAPID_PRIVATE_KEY: '' })).toBeNull();
    expect(vapidFromEnv({ ...base, VAPID_PRIVATE_KEY: 'priv' })).toBeNull();
    expect(vapidFromEnv({ ...base, VITE_VAPID_PUBLIC_KEY: keys.privateKey })).toBeNull();
  });

  it('rechaza sujetos que Apple no acepta', () => {
    expect(vapidFromEnv({ ...base, VAPID_SUBJECT: 'https://nexo.vercel.app' })).not.toBeNull();
    for (const bad of ['mailto: yo@ejemplo.com', 'mailto:yo@localhost', 'mailto:yo@mac.local', 'https://localhost:3000',
      'https://127.0.0.1', 'mailto:tu-correo@example.com', 'http://nexo.app', 'yo@ejemplo.com', 'mailto:yo@ejemplo']) {
      expect(vapidFromEnv({ ...base, VAPID_SUBJECT: bad }), bad).toBeNull();
    }
  });
});

describe('payload', () => {
  it('formatea la fecha local sin desplazarla', () => {
    expect(formatLocalStamp('2026-10-15T09:05:00')).toMatch(/15.*oct.*· 09:05/);
    expect(formatLocalStamp('2026-10-15')).not.toContain('·');
    const p = reminderPayload({ task_id: 't1', title: 'Pagar luz', due_at: '2026-10-15T18:00:00' });
    expect(p).toMatchObject({ title: '⏰ Pagar luz', tag: 'task-t1', url: '/?tab=tasks' });
    expect(p.body).toMatch(/^Vence /);
    expect(reminderPayload({ task_id: 't2', title: 'x' }).body).toBe('Recordatorio de NEXO');
  });
  it('indica el retraso cuando el aviso sale tarde', () => {
    const now = new Date('2026-10-14T18:00:00Z');
    expect(reminderPayload({ task_id: 't', title: 'x', remind_at: '2026-10-14T17:58:00Z' }, now).body).toBe('Recordatorio de NEXO');
    expect(reminderPayload({ task_id: 't', title: 'x', remind_at: '2026-10-14T17:35:00Z' }, now).body).toContain('25 min de retraso');
    expect(reminderPayload({ task_id: 't', title: 'x', remind_at: '2026-10-14T13:00:00Z' }, now).body).toContain('5 h de retraso');
  });
});

describe('sendToSubscriptions (clasificación)', () => {
  const vapid = { subject: 'mailto:a@b.co', ...webpush.generateVAPIDKeys() };
  const sub = (id) => ({ id, endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, p256dh: 'k', auth: 'a' });
  const fail = (statusCode) => Object.assign(new Error('x'), { statusCode });

  it('separa entregados, caducados, temporales y rechazados', async () => {
    const codes = { ok: null, g404: 404, g410: 410, t500: 500, t429: 429, i400: 400, i403: 403 };
    const sender = { sendNotification: async ({ endpoint }) => { const c = codes[endpoint.split('/').pop()]; if (c) throw fail(c); } };
    const r = await sendToSubscriptions([...Object.keys(codes).map(sub), { id: 'bad', endpoint: 'https://evil.com/x' }], { title: 't' }, { vapid, sender });
    expect(r.delivered).toEqual(['ok']);
    expect(r.gone.sort()).toEqual(['bad', 'g404', 'g410']);
    expect(r.failed.sort()).toEqual(['t429', 't500']);
    expect(r.invalid.sort()).toEqual(['i400', 'i403']);
  });
});

// ---- Punta a punta: cifrado RFC 8291 + VAPID RFC 8292 contra un "servicio de push" HTTPS local ----
describe('Web Push real (servidor HTTPS local)', () => {
  let server, origin, received = [], agent;
  const vapid = { subject: 'mailto:nexo@ejemplo.com', ...webpush.generateVAPIDKeys() };

  function newDevice(path) {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const authSecret = randomBytes(16);
    return {
      ecdh, authSecret,
      sub: { endpoint: `${origin}/push/${path}`, p256dh: ecdh.getPublicKey('base64url'), auth: authSecret.toString('base64url') },
    };
  }

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexo-tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '1',
      '-subj', '/CN=localhost', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
    server = https.createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
        res.statusCode = req.url.includes('/gone') ? 410 : 201;
        res.end();
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    origin = `https://localhost:${server.address().port}`;
    agent = new https.Agent({ rejectUnauthorized: false });
  });
  afterAll(() => server?.close());

  function decrypt(req, device) {
    return JSON.parse(ece.decrypt(req.body, { version: 'aes128gcm', privateKey: device.ecdh, authSecret: device.authSecret }).toString());
  }

  function checkVapid(req) {
    const m = /^vapid t=([^,]+),\s*k=(.+)$/.exec(req.headers.authorization);
    expect(m, 'cabecera VAPID').not.toBeNull();
    const [h, p, sig] = m[1].split('.');
    expect(m[2]).toBe(vapid.publicKey);
    const raw = Buffer.from(vapid.publicKey, 'base64url');
    const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } });
    expect(verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))).toBe(true);
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(claims.aud).toBe(origin);
    expect(claims.sub).toBe(vapid.subject);
    expect(claims.exp * 1000 - Date.now()).toBeLessThanOrEqual(24 * 3600e3);
  }

  it('entrega un aviso cifrado que el dispositivo puede descifrar', async () => {
    received = [];
    const dev = newDevice('d1');
    const r = await sendToSubscriptions([{ id: 's1', ...dev.sub }], { title: '⏰ Pagar luz', body: 'Vence hoy' },
      { vapid, agent, allowEndpoint: () => true });
    expect(r.delivered).toEqual(['s1']);
    const req = received[0];
    expect(req.headers['content-encoding']).toBe('aes128gcm');
    expect(req.headers.urgency).toBe('high');
    expect(Number(req.headers.ttl)).toBeGreaterThan(0);
    checkVapid(req);
    expect(decrypt(req, dev)).toEqual({ title: '⏰ Pagar luz', body: 'Vence hoy' });
  });

  it('cron: reclama avisos vencidos, envía solo a los dispositivos del dueño y limpia los caducados', async () => {
    received = [];
    const a1 = newDevice('a1'), a2 = newDevice('gone-a2'), b1 = newDevice('b1');
    const store = {
      push_subscriptions: [
        { id: 'sa1', user_id: 'A', ...a1.sub }, { id: 'sa2', user_id: 'A', ...a2.sub }, { id: 'sb1', user_id: 'B', ...b1.sub },
      ],
      tasks: [{ id: 'tA', user_id: 'A', reminded_at: '2026-10-14T15:00:00Z' }],
    };
    const db = fakeDb(store, null, {
      admin: true,
      rpc: { claim_due_reminders: () => [{ task_id: 'tA', user_id: 'A', title: 'Dentista', due_at: '2026-10-14T10:00:00', attempts: 1 }] },
    });
    const summary = await processDueReminders({ db, vapid, agent, allowEndpoint: () => true });
    expect(summary).toMatchObject({ claimed: 1, delivered: 1, removedSubscriptions: 1, retried: 0 });
    expect(store.tasks[0].reminder_status).toBe('sent');
    expect(received.map((r) => r.url).sort()).toEqual(['/push/a1', '/push/gone-a2']); // B no recibe nada
    expect(decrypt(received.find((r) => r.url === '/push/a1'), a1)).toMatchObject({ title: '⏰ Dentista', tag: 'task-tA' });
    expect(store.push_subscriptions.map((s) => s.id)).toEqual(['sa1', 'sb1']);
    expect(store.push_subscriptions[0].last_success_at).toBeTruthy();
  });
});

describe('processDueReminders (reintentos)', () => {
  const vapid = { subject: 'mailto:a@b.co', ...webpush.generateVAPIDKeys() };
  const sub = { id: 's1', user_id: 'A', endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'k', auth: 'a' };
  const claim = (attempts) => ({ claim_due_reminders: () => [{ task_id: 't1', user_id: 'A', title: 'x', attempts }] });
  const down = { sendNotification: async () => { throw Object.assign(new Error('503'), { statusCode: 503 }); } };

  it('error temporal → re-arma el aviso para el siguiente minuto', async () => {
    const store = { push_subscriptions: [sub], tasks: [{ id: 't1', user_id: 'A', reminded_at: 'x' }] };
    const s = await processDueReminders({ db: fakeDb(store, null, { admin: true, rpc: claim(1) }), vapid, sender: down });
    expect(s).toMatchObject({ claimed: 1, delivered: 0, retried: 1 });
    expect(store.tasks[0].reminded_at).toBeNull();
  });

  it('tras 5 intentos se abandona', async () => {
    const store = { push_subscriptions: [sub], tasks: [{ id: 't1', user_id: 'A', reminded_at: 'x' }] };
    const s = await processDueReminders({ db: fakeDb(store, null, { admin: true, rpc: claim(5) }), vapid, sender: down });
    expect(s).toMatchObject({ retried: 0, abandoned: 1 });
    expect(store.tasks[0].reminded_at).toBe('x');
    expect(store.tasks[0].reminder_status).toBe('failed');
  });

  it('sin dispositivos → no reintenta; sin avisos → no consulta nada', async () => {
    const store = { push_subscriptions: [], tasks: [{ id: 't1', user_id: 'A', reminded_at: 'x' }] };
    expect(await processDueReminders({ db: fakeDb(store, null, { admin: true, rpc: claim(1) }), vapid, sender: down }))
      .toMatchObject({ noDevices: 1, retried: 0 });
    expect(store.tasks[0].reminder_status).toBe('no_devices');
    expect(await processDueReminders({ db: fakeDb({}, null, { admin: true, rpc: { claim_due_reminders: () => [] } }), vapid }))
      .toMatchObject({ claimed: 0 });
  });

  it('rechazo del servicio (p. ej. VAPID inválido) → rejected, sin reintentos', async () => {
    const store = { push_subscriptions: [sub], tasks: [{ id: 't1', user_id: 'A', reminded_at: 'x' }] };
    const forbidden = { sendNotification: async () => { throw Object.assign(new Error('403'), { statusCode: 403 }); } };
    expect(await processDueReminders({ db: fakeDb(store, null, { admin: true, rpc: claim(1) }), vapid, sender: forbidden }))
      .toMatchObject({ rejected: 1, retried: 0 });
    expect(store.tasks[0].reminder_status).toBe('rejected');
  });

  it('propaga error del claim', async () => {
    await expect(processDueReminders({ db: fakeDb({}, null, { admin: true }), vapid })).rejects.toThrow('claim_due_reminders');
  });
});
