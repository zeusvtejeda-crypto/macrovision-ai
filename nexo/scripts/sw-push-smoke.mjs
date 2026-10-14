// Prueba de humo en Chromium real: service worker + push → notificación visible, y captura de la UI.
// No usa Supabase real (las llamadas se simulan). Requiere Playwright y un build con:
//   VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=x VITE_VAPID_PUBLIC_KEY=<clave> npm run build
// Uso: node scripts/sw-push-smoke.mjs [carpeta-capturas]
import { spawn } from 'node:child_process';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PORT = 4179;
const ORIGIN = `http://localhost:${PORT}`;
const shots = process.argv[2];
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const fail = (m) => { console.error('FALLÓ:', m); preview.kill(); process.exit(1); };

try {
  for (let i = 0; i < 50; i++) { try { await fetch(ORIGIN); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: '00000000-0000-0000-0000-00000000000a', email: 'yo@ejemplo.com', aud: 'authenticated', role: 'authenticated' };
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, exp, role: 'authenticated', aud: 'authenticated' })}.sig`;
  const session = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };
  const now = new Date();
  const later = new Date(now.getTime() + 3 * 3600e3);
  const tasks = [
    { id: 't1', title: 'Pagar la luz', category: 'finanzas', due_at: later.toISOString().slice(0, 16), done: false, remind_at: new Date(later - 3600e3).toISOString(), reminded_at: null, created_at: now.toISOString() },
    { id: 't2', title: 'Entregar tarea de cálculo', category: 'escuela', due_at: null, done: false, remind_at: null, reminded_at: null, created_at: now.toISOString() },
  ];

  // channel 'chromium' = Chromium completo en modo headless (el headless-shell no tiene notificaciones).
  const browser = await chromium.launch({ channel: 'chromium' });
  for (const [name, opts] of [['iphone', devices['iPhone 13']], ['ipad', devices['iPad Pro 11']], ['mac', { viewport: { width: 1280, height: 800 } }]]) {
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'allow' });
    await ctx.grantPermissions(['notifications'], { origin: ORIGIN });
    await ctx.addInitScript(([s]) => {
      localStorage.setItem('sb-demo-auth-token', s);
      localStorage.setItem('nexo-tab', 'tasks');
    }, [JSON.stringify(session)]);
    await ctx.route('https://demo.supabase.co/**', (route) => {
      const url = route.request().url();
      if (url.includes('/rest/v1/tasks')) return route.fulfill({ json: tasks });
      if (url.includes('/rest/v1/')) return route.fulfill({ json: [] });
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
      return route.fulfill({ status: 404, body: '' });
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ORIGIN);
    await page.getByRole('heading', { name: 'Pendientes' }).waitFor({ timeout: 10000 });
    await page.getByText('Pagar la luz').waitFor();
    if (!(await page.getByText('🔔').count())) fail('no se ve el aviso programado');
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (shots) await page.screenshot({ path: `${shots}/tasks-${name}.png`, fullPage: true });
    if (errors.length) fail(`errores JS: ${errors.join(' | ')}`);

    if (name === 'mac') {
      // Entrega un push real al service worker vía DevTools y comprueba la notificación.
      const cdp = await ctx.newCDPSession(page);
      const regId = await new Promise((resolve) => {
        cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
          const r = registrations.find((x) => x.scopeURL.startsWith(ORIGIN) && !x.isDeleted);
          if (r) resolve(r.registrationId);
        });
        cdp.send('ServiceWorker.enable');
      });
      const payload = { title: '⏰ Pagar la luz', body: 'Vence hoy', tag: 'task-t1', url: '/?tab=tasks' };
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId: regId, data: JSON.stringify(payload) });
      const shown = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        for (let i = 0; i < 40; i++) {
          const ns = await reg.getNotifications();
          if (ns.length) return ns.map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url }));
          await new Promise((r) => setTimeout(r, 100));
        }
        return [];
      });
      if (!shown.length) fail('el service worker no mostró la notificación');
      const n = shown[0];
      if (n.title !== payload.title || n.body !== payload.body || n.tag !== payload.tag || n.url !== `${ORIGIN}/?tab=tasks`) fail(`notificación inesperada ${JSON.stringify(n)}`);
      console.log('ok: push → notificación', JSON.stringify(n));

      // Payload malicioso: URL externa → se reescribe al origen de la app.
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId: regId, data: JSON.stringify({ title: 'x', tag: 'evil', url: 'https://evil.com/phish' }) });
      const evil = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        for (let i = 0; i < 40; i++) {
          const n = (await reg.getNotifications({ tag: 'evil' }))[0];
          if (n) return n.data.url;
          await new Promise((r) => setTimeout(r, 100));
        }
      });
      if (evil !== `${ORIGIN}/`) fail(`URL externa no saneada: ${evil}`);
      console.log('ok: URL externa saneada →', evil);

      // Push sin datos / no-JSON → igual muestra algo (requisito de Safari).
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: ORIGIN, registrationId: regId, data: 'texto plano' });
      const plain = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.ready;
        for (let i = 0; i < 40; i++) {
          const n = (await reg.getNotifications()).find((x) => x.body === 'texto plano');
          if (n) return n.title;
          await new Promise((r) => setTimeout(r, 100));
        }
      });
      if (plain !== 'NEXO') fail('push sin JSON no mostró notificación');
      console.log('ok: push no-JSON → notificación "NEXO"');
    }
    console.log(`ok: UI ${name}`);
    await ctx.close();
  }
  await browser.close();
  console.log('PRUEBA DE HUMO OK');
} finally {
  preview.kill();
}
