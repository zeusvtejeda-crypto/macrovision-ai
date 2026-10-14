// Recorre todas las rutas de NEXO en Chromium real (iPhone, iPad y Mac) con datos simulados:
// sin errores de JS, con contenido pintado, sin desborde horizontal, y capturas opcionales.
// Requiere un build con VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=x.
// Uso: node scripts/ui-smoke.mjs [carpeta-capturas]
import { spawn } from 'node:child_process';
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PORT = 4181;
const ORIGIN = `http://localhost:${PORT}`;
const shots = process.argv[2];
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const fail = (m) => { console.error('FALLÓ:', m); preview.kill(); process.exit(1); };

const A = '00000000-0000-0000-0000-00000000000a';
const now = new Date();
const iso = (d) => d.toISOString();
const day = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const base = (extra) => ({ user_id: A, created_at: iso(now), updated_at: iso(now), deleted_at: null, version: 1, ...extra });
const ID = (n) => `${n}0000000-0000-4000-8000-000000000000`.slice(0, 36);

const tables = {
  settings: [base({ id: ID(1), time_zone: 'America/Mazatlan', currency: 'MXN', locale: 'es-MX', prefs: {} })],
  areas: [base({ id: ID(2), name: 'Vida personal', kind: 'personal', color: '#06b6d4', icon: '🏠', sort: 1 }), base({ id: ID(3), name: 'VILLEDA', kind: 'work', color: '#6366f1', icon: '💼', sort: 2 }), base({ id: ID(4), name: 'Estudios', kind: 'study', color: '#f59e0b', icon: '🎓', sort: 3 })],
  clients: [base({ id: ID(5), name: 'Isoval', kind: 'client', status: 'active', area_id: ID(3), services: ['redes', 'video'], brand_kit: { colors: [{ name: 'Azul', hex: '#1e40af' }] }, socials: {}, important_dates: [], logo_attachment_ids: [] })],
  projects: [base({ id: ID(6), name: 'Campaña Isoval Q4', area_id: ID(3), client_id: ID(5), status: 'active', due_on: day(20) })],
  goals: [base({ id: ID(7), title: 'Terminar el semestre con 9', area_id: ID(4), success_criteria: 'Promedio ≥ 9 en todas las materias', status: 'active' })],
  tasks: [
    base({ id: ID(8), title: 'Enviar propuesta a Isoval', project_id: ID(6), client_id: ID(5), area_id: ID(3), priority: 1, status: 'pending', done: false, due_at: `${day(0)}T18:00`, kind: 'task', tags: [], depends_on: [], origin: 'manual' }),
    base({ id: ID(9), title: 'Tarea de cálculo', area_id: ID(4), priority: 2, status: 'in_progress', done: false, planned_on: day(1), kind: 'deliverable', tags: [], depends_on: [], origin: 'manual' }),
    base({ id: ID('a'), title: 'Vencida: pagar luz', area_id: ID(2), priority: 2, status: 'pending', done: false, due_at: `${day(-2)}T09:00`, kind: 'task', tags: [], depends_on: [], origin: 'chat', remind_at: iso(now), reminded_at: iso(now), reminder_status: 'sent' }),
  ],
  events: [base({ id: ID('b'), title: 'Clase de física', kind: 'event', starts_at: iso(new Date(now.getTime() + 3600e3)), ends_at: iso(new Date(now.getTime() + 7200e3)), all_day: false, source: 'nexo' })],
  meetings: [base({ id: ID('c'), title: 'Kickoff Isoval', client_id: ID(5), project_id: ID(6), starts_at: iso(new Date(now.getTime() + 86400e3)), status: 'planned', agenda: ['Objetivos'], questions: [], contact_ids: [], attendees: [] })],
  agreements: [base({ id: ID('d'), meeting_id: ID('c'), client_id: ID(5), kind: 'agreement', text: 'Enviar propuesta el viernes', owner: 'Zeus', status: 'open', fingerprint: 'x' })],
  contacts: [base({ id: ID('e'), name: 'Ana López', client_id: ID(5), email: 'ana@isoval.mx', phone: '311 123 4567', tags: [], next_followup_on: day(3) })],
  notes: [base({ id: ID('f'), title: 'Idea de reel', content: 'Antes/después con transición rápida.', tags: ['isoval'], kind: 'idea', client_id: ID(5) })],
  resources: [base({ id: ID(10), title: 'Hábitos atómicos', author: 'James Clear', kind: 'book', read_status: 'reading', scope: 'none', tags: ['hábitos'], key_ideas: ['Votos de identidad'], applications: [], summary: 'Pequeños cambios, grandes resultados.' })],
  inbox_items: [base({ id: ID(11), kind: 'text', raw_text: 'Comprar materiales para el set', status: 'pending', source: 'app' })],
  subjects: [base({ id: ID(12), name: 'Cálculo II', code: 'MAT202', schedule: [{ weekday: 1, start: '07:00', end: '09:00', room: 'B3' }], archived: false })],
  grades: [base({ id: ID(13), subject_id: ID(12), name: 'Parcial 1', score: 88, max_score: 100, weight: 30 })],
  accounts: [base({ id: ID(14), name: 'BBVA', kind: 'bank', scope: 'personal', currency: 'MXN', opening_balance: 5000, archived: false })],
  transactions: [base({ id: ID(15), kind: 'expense', amount: 450, category: 'gasolina', occurred_on: day(0), scope: 'personal', status: 'paid', account_id: ID(14), currency: 'MXN' }), base({ id: ID(16), kind: 'income', amount: 12000, category: 'servicios', occurred_on: day(5), scope: 'business', status: 'pending', client_id: ID(5), currency: 'MXN', due_on: day(5) })],
  recurring_items: [base({ id: ID(17), name: 'Adobe', kind: 'subscription', amount: 599, currency: 'MXN', scope: 'business', category: 'software', cadence: { freq: 'monthly', interval: 1 }, next_on: day(7), active: true })],
  budgets: [base({ id: ID(18), scope: 'personal', category: 'gasolina', month: `${day(0).slice(0, 7)}-01`, amount: 2000, currency: 'MXN' })],
  habits: [base({ id: ID(19), name: 'Leer 20 min', frequency: { per: 'day', times: 1 }, active: true, sort: 0 })],
  habit_logs: [base({ id: ID('1a'), habit_id: ID(19), logged_on: day(0), value: 1 })],
  daily_reviews: [],
  weekly_reviews: [],
  priorities: [],
  memories: [base({ id: ID('1b'), content: 'Prefiero respuestas breves', kind: 'preference', source: 'confirmed', origin: 'ui' })],
  content_items: [base({ id: ID('1c'), client_id: ID(5), topic: 'Reel antes/después', format: 'reel', channel: 'instagram', publish_on: day(4), status: 'draft', resources: [] })],
  attachments: [],
  chat_messages: [base({ id: ID('1d'), role: 'user', content: 'Hola' }), base({ id: ID('1e'), role: 'assistant', content: 'Hola, ¿en qué te ayudo?' })],
  action_log: [base({ id: ID('1f'), actor: 'chat', tool: 'crear_tarea', summary: 'Creó la tarea "Vencida: pagar luz"', target_table: 'tasks', target_id: ID('a'), op: 'insert', reversible: true })],
};

const ROUTES = ['/', '/asistente', '/agenda', '/proyectos', `/proyectos/${ID(6)}`, '/objetivos', `/objetivos/${ID(7)}`, '/tareas', `/tareas/${ID(8)}`, '/bandeja', `/bandeja/${ID(11)}`,
  '/biblioteca', `/biblioteca/${ID(10)}`, '/notas', `/notas/${ID('f')}`, '/clientes', `/clientes/${ID(5)}`, '/contenido', '/contactos', `/contactos/${ID('e')}`,
  '/reuniones', `/reuniones/${ID('c')}`, '/estudios', `/estudios/${ID(12)}`, '/finanzas', '/habitos', '/revision', '/memoria', '/historial', '/ajustes', '/mas'];

try {
  for (let i = 0; i < 50; i++) { try { await fetch(ORIGIN); break; } catch { await new Promise((r) => setTimeout(r, 200)); } }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: A, email: 'zeus@ejemplo.com', aud: 'authenticated', role: 'authenticated' };
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: A, exp, role: 'authenticated', aud: 'authenticated' })}.sig`;
  const session = { access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };

  const browser = await chromium.launch({ channel: 'chromium' });
  let failures = 0;
  for (const [name, opts] of [['iphone', devices['iPhone 13']], ['ipad', devices['iPad Pro 11']], ['mac', { viewport: { width: 1280, height: 800 } }]]) {
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block' });
    await ctx.addInitScript(([s]) => { localStorage.setItem('sb-demo-auth-token', s); localStorage.removeItem('nexo-last-route'); }, [JSON.stringify(session)]);
    await ctx.route('https://demo.supabase.co/**', (route) => {
      const url = route.request().url();
      if (url.includes('/rest/v1/rpc/sync_pull')) return route.fulfill({ json: { server_time: new Date().toISOString(), tables: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, { rows, more: false }])) } });
      if (url.includes('/rest/v1/rpc/sync_push')) return route.fulfill({ json: [] });
      if (url.includes('/rest/v1/rpc/search_all')) return route.fulfill({ json: [] });
      if (url.includes('/rest/v1/rpc/')) return route.fulfill({ json: {} });
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
      if (url.includes('/rest/v1/')) return route.fulfill({ json: [] });
      return route.fulfill({ status: 404, body: '' });
    });
    await ctx.route(`${ORIGIN}/api/**`, (route) => route.fulfill({ status: 503, json: { error: 'simulado' } }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|503|Failed to load resource/.test(m.text())) errors.push(m.text()); });
    for (const r of ROUTES) {
      errors.length = 0;
      await page.goto(`${ORIGIN}${r}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      const info = await page.evaluate(() => ({
        text: document.querySelector('main')?.innerText?.trim().length || 0,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        construction: /en construcción|Próximamente/.test(document.querySelector('main')?.innerText || ''),
        notFound: /no existe/.test(document.querySelector('main')?.innerText || ''),
      }));
      const problems = [];
      if (errors.length) problems.push(`errores JS: ${errors.slice(0, 2).join(' | ').slice(0, 300)}`);
      if (info.text < 20) problems.push('sin contenido');
      if (info.overflow) problems.push('desborde horizontal');
      if (info.construction) problems.push('módulo en construcción');
      if (info.notFound) problems.push('ruta no encontrada');
      if (problems.length) { failures++; console.log(`✗ ${name} ${r}: ${problems.join('; ')}`); }
      else console.log(`ok ${name} ${r}`);
      if (shots) await page.screenshot({ path: `${shots}/${name}${r.replace(/\//g, '_') || '_home'}.png`, fullPage: true }).catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  if (failures) fail(`${failures} ruta(s) con problemas`);
  console.log('RECORRIDO DE UI OK');
} finally {
  preview.kill();
}
