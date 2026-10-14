import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, configured } from './supabase.js';
import { mxn, fmtDue, localToday, REMINDER_PRESETS, computeRemindAt, fmtInstant } from './format.js';
import { pushStatus, enablePush, syncPush, disablePush, sendTestPush, thisDeviceEndpoint, storedEndpoint, isIOS, PUSH_EVENT, PUSH_STORAGE_KEY } from './push.js';

const TABS = [
  ['chat', 'Chat', '💬'],
  ['tasks', 'Pendientes', '✅'],
  ['notes', 'Notas', '📝'],
  ['money', 'Finanzas', '💸'],
  ['memory', 'Memoria', '🧠'],
];
// Los queries de Supabase son perezosos: solo se ejecutan al hacer await.
async function exec(q) {
  const { error } = await q;
  if (error) alert(error.message);
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured) return setReady(true);
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <Center><h1>NEXO</h1><p>Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.</p></Center>;
  if (!ready) return <Center><p>Cargando…</p></Center>;
  if (!session) return <Auth />;
  return <Shell session={session} />;
}

function Center({ children }) {
  return <div className="center">{children}</div>;
}

function Auth() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const fn = mode === 'login' ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password, options: { emailRedirectTo: location.origin } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (mode === 'signup' && !data.session) setMsg('Revisa tu correo para confirmar la cuenta.');
  }

  return (
    <Center>
      <img src="/icons/icon.svg" alt="" width="72" height="72" />
      <h1>NEXO</h1>
      <form className="card auth" onSubmit={submit}>
        <input type="email" autoComplete="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Contraseña (mín. 8)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button disabled={busy}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</button>
        <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : 'Ya tengo cuenta'}
        </button>
        {msg && <p className="muted">{msg}</p>}
      </form>
    </Center>
  );
}

// Carga una tabla y la mantiene sincronizada (Realtime + al volver a la app).
function useTable(table, query, deps = []) {
  const [rows, setRows] = useState([]);
  const load = useCallback(async () => {
    const { data, error } = await query(supabase.from(table).select('*'));
    if (!error) setRows(data);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
    const ch = supabase.channel(`rt-${table}`).on('postgres_changes', { event: '*', schema: 'public', table }, load).subscribe();
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVis); };
  }, [load, table]);
  return [rows, load];
}

// ?tab=tasks (al abrir desde una notificación) o la última pestaña usada.
function initialTab() {
  const params = new URLSearchParams(location.search);
  const t = params.get('tab');
  if (t) history.replaceState(null, '', location.pathname);
  if (TABS.some(([id]) => id === t)) return t;
  try { return localStorage.getItem('nexo-tab') || 'chat'; } catch { return 'chat'; }
}

function Shell({ session }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { try { localStorage.setItem('nexo-tab', tab); } catch {} }, [tab]);

  useEffect(() => {
    syncPush(supabase);
    // Toque en una notificación con la app abierta → el service worker pide cambiar de pestaña.
    const onMsg = (e) => {
      if (e.data?.type !== 'nexo:open') return;
      const t = new URL(e.data.url, location.origin).searchParams.get('tab');
      if (TABS.some(([id]) => id === t)) setTab(t);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  // Cierra sesión solo en este dispositivo y deja de recibir aquí los avisos de la cuenta.
  async function logout() {
    await disablePush(supabase).catch(() => {});
    await supabase.auth.signOut({ scope: 'local' });
  }

  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand"><img src="/icons/icon.svg" alt="" width="28" height="28" /> NEXO</div>
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span className="ico">{icon}</span><span className="lbl">{label}</span>
          </button>
        ))}
        <button className="logout" onClick={logout} title={session.user.email}>
          <span className="ico">⎋</span><span className="lbl">Salir</span>
        </button>
      </nav>
      <main className="main">
        {tab === 'chat' && <Chat session={session} />}
        {tab === 'tasks' && <Tasks />}
        {tab === 'notes' && <Notes />}
        {tab === 'money' && <Money />}
        {tab === 'memory' && <Memory />}
      </main>
    </div>
  );
}

function Chat({ session }) {
  const [msgs, reload] = useTable('chat_messages', (q) => q.order('created_at', { ascending: true }).limit(200));
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, pending]);

  async function send(e) {
    e.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    setText(''); setError(''); setPending(message);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || session.access_token}` },
        body: JSON.stringify({ message, timeZone: TZ }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Error ${r.status}`);
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Sin conexión con el servidor.' : err.message);
      setText(message);
    } finally {
      setPending(null);
      reload();
    }
  }

  return (
    <section className="chat">
      <div className="messages">
        {!msgs.length && !pending && (
          <div className="muted hint">
            Prueba: “Crea una tarea comprar cuadernos para mañana”, “Gasté 200 en gasolina”, “¿Qué tengo pendiente esta semana?”
          </div>
        )}
        {msgs.map((m) => <div key={m.id} className={`bubble ${m.role}`}>{m.content}</div>)}
        {pending && <><div className="bubble user">{pending}</div><div className="bubble assistant muted">Pensando…</div></>}
        <div ref={end} />
      </div>
      {error && <p className="error">{error}</p>}
      <form className="composer" onSubmit={send}>
        <textarea rows={1} value={text} placeholder="Escríbele a NEXO…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e); }} />
        <button disabled={!text.trim() || !!pending}>Enviar</button>
      </form>
    </section>
  );
}

function Tasks() {
  const [show, setShow] = useState('pending');
  const [rows] = useTable('tasks', (q) => q.order('done').order('due_at', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }));
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [category, setCategory] = useState('personal');
  const [preset, setPreset] = useState('none');
  const [custom, setCustom] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    let remind_at;
    try { remind_at = computeRemindAt(preset, due, custom); } catch (err) { return alert(err.message); }
    const row = { title: title.trim(), due_at: due || null, category };
    if (remind_at) row.remind_at = remind_at;
    const { error } = await supabase.from('tasks').insert(row);
    if (error) return alert(error.message);
    setTitle(''); setDue(''); setPreset('none'); setCustom('');
  }
  const toggle = (t) => exec(supabase.from('tasks').update({ done: !t.done, done_at: t.done ? null : new Date().toISOString() }).eq('id', t.id));
  const remove = (t) => confirm(`¿Eliminar “${t.title}”?`) && exec(supabase.from('tasks').delete().eq('id', t.id));
  const today = localToday();
  const list = rows.filter((t) => (show === 'pending' ? !t.done : t.done));

  return (
    <section>
      <h2>Pendientes</h2>
      <PushCard />
      <form className="card row" onSubmit={add}>
        <input placeholder="Nueva tarea" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {['personal', 'escuela', 'trabajo', 'salud', 'finanzas', 'otro'].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Aviso">
          {REMINDER_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {preset === 'custom' && <input type="datetime-local" aria-label="Hora del aviso" value={custom} onChange={(e) => setCustom(e.target.value)} />}
        <button>Agregar</button>
      </form>
      <div className="seg">
        <button className={show === 'pending' ? 'active' : ''} onClick={() => setShow('pending')}>Pendientes</button>
        <button className={show === 'done' ? 'active' : ''} onClick={() => setShow('done')}>Completadas</button>
      </div>
      <ul className="list">
        {list.map((t) => (
          <li key={t.id} className={t.done ? 'done' : ''}>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label="Completar" />
            <div className="grow">
              <div>{t.title}</div>
              <div className={`muted small ${!t.done && t.due_at && t.due_at.slice(0, 10) < today ? 'overdue' : ''}`}>
                {t.category}{t.due_at ? ` · ${fmtDue(t.due_at)}` : ''}
                {t.remind_at && <ReminderBadge task={t} />}
              </div>
            </div>
            <button className="icon" onClick={() => remove(t)} aria-label="Eliminar">✕</button>
          </li>
        ))}
        {!list.length && <li className="muted">Nada por aquí.</li>}
      </ul>
    </section>
  );
}

function Notes() {
  const [q, setQ] = useState('');
  const [rows] = useTable('notes', (x) => x.order('created_at', { ascending: false }).limit(200));
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!content.trim()) return;
    const { error } = await supabase.from('notes').insert({ title: title.trim() || null, content: content.trim() });
    if (error) return alert(error.message);
    setTitle(''); setContent('');
  }
  const needle = q.toLowerCase();
  const list = rows.filter((n) => !needle || `${n.title || ''} ${n.content}`.toLowerCase().includes(needle));

  return (
    <section>
      <h2>Notas</h2>
      <form className="card col" onSubmit={add}>
        <input placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea rows={3} placeholder="Escribe una nota o idea…" value={content} onChange={(e) => setContent(e.target.value)} />
        <button>Guardar</button>
      </form>
      <input className="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid">
        {list.map((n) => (
          <article key={n.id} className="card note">
            {n.title && <h3>{n.title}</h3>}
            <p>{n.content}</p>
            <div className="muted small">
              {new Date(n.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}
              <button className="icon" onClick={() => confirm('¿Eliminar nota?') && exec(supabase.from('notes').delete().eq('id', n.id))}>✕</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Money() {
  const [month, setMonth] = useState(localToday().slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const [rows] = useTable('transactions', (q) => q.gte('occurred_on', `${month}-01`).lte('occurred_on', `${month}-${last}`).order('occurred_on', { ascending: false }), [month]);
  const [form, setForm] = useState({ kind: 'expense', amount: '', category: '', description: '' });

  async function add(e) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!(amount > 0) || !form.category.trim()) return;
    const { error } = await supabase.from('transactions').insert({ ...form, amount, category: form.category.trim().toLowerCase(), occurred_on: localToday() });
    if (error) return alert(error.message);
    setForm({ ...form, amount: '', description: '' });
  }
  const gastos = rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + Number(r.amount), 0);
  const ingresos = rows.filter((r) => r.kind === 'income').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <section>
      <h2>Finanzas</h2>
      <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      <div className="stats">
        <div className="card"><div className="muted small">Ingresos</div><b className="pos">{mxn(ingresos)}</b></div>
        <div className="card"><div className="muted small">Gastos</div><b className="neg">{mxn(gastos)}</b></div>
        <div className="card"><div className="muted small">Balance</div><b>{mxn(ingresos - gastos)}</b></div>
      </div>
      <form className="card row" onSubmit={add}>
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="expense">Gasto</option><option value="income">Ingreso</option>
        </select>
        <input type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="Monto" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input placeholder="Categoría" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button>Agregar</button>
      </form>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="grow">
              <div>{r.description || r.category}</div>
              <div className="muted small">{r.category} · {r.occurred_on}</div>
            </div>
            <b className={r.kind === 'expense' ? 'neg' : 'pos'}>{r.kind === 'expense' ? '−' : '+'}{mxn(r.amount)}</b>
            <button className="icon" onClick={() => confirm('¿Eliminar movimiento?') && exec(supabase.from('transactions').delete().eq('id', r.id))}>✕</button>
          </li>
        ))}
        {!rows.length && <li className="muted">Sin movimientos este mes.</li>}
      </ul>
    </section>
  );
}

function Memory() {
  const [rows] = useTable('memories', (q) => q.order('created_at', { ascending: false }));
  const [text, setText] = useState('');
  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const { error } = await supabase.from('memories').insert({ content: text.trim() });
    if (error) return alert(error.message);
    setText('');
  }
  return (
    <section>
      <h2>Memoria</h2>
      <p className="muted">NEXO lee esto en cada conversación.</p>
      <form className="card row" onSubmit={add}>
        <input placeholder="Ej. Prefiero respuestas breves" value={text} onChange={(e) => setText(e.target.value)} />
        <button>Guardar</button>
      </form>
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="grow">{r.content}</div>
            <button className="icon" onClick={() => exec(supabase.from('memories').delete().eq('id', r.id))}>✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Estado y control de notificaciones de este dispositivo.
function PushCard() {
  const [status, setStatus] = useState(pushStatus);
  const [subscribed, setSubscribed] = useState(false);
  const [thisEndpoint, setThisEndpoint] = useState(null);
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    setStatus(pushStatus());
    const [{ data }, endpoint] = await Promise.all([
      supabase.from('push_subscriptions').select('id,endpoint,user_agent,created_at').is('gone_at', null).order('created_at', { ascending: false }),
      thisDeviceEndpoint().catch(() => null),
    ]);
    setDevices(data || []);
    setThisEndpoint(endpoint);
    setSubscribed(Boolean(endpoint && (data || []).some((d) => d.endpoint === endpoint)));
  }, []);
  useEffect(() => {
    refresh();
    const onVis = () => document.visibilityState === 'visible' && refresh();
    const onStorage = (e) => e.key === PUSH_STORAGE_KEY && refresh(); // cambios hechos en otra ventana
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [refresh]);

  async function run(fn) {
    setBusy(true); setMsg('');
    try { await fn(); } catch (err) { setMsg(err.message); } finally { setBusy(false); refresh(); }
  }
  const enable = () => run(async () => {
    const r = await enablePush(supabase);
    if (r === 'denied') setMsg('Permiso denegado. Actívalo en Ajustes del sistema → Notificaciones → NEXO.');
    else if (r === 'granted') setMsg('Avisos activados en este dispositivo.');
  });
  const test = () => run(async () => {
    const r = await sendTestPush(supabase);
    setMsg(`Prueba enviada a ${r.delivered} de ${r.total} dispositivo(s).`);
  });
  const disable = () => run(() => disablePush(supabase));
  const removeDevice = (d) => run(async () => {
    const here = await thisDeviceEndpoint().catch(() => null);
    if (d.endpoint === here || d.endpoint === storedEndpoint()) await disablePush(supabase); // es este dispositivo
    const { error } = await supabase.from('push_subscriptions').delete().eq('id', d.id); // por si rotó: borra esta fila
    if (error) throw error;
  });

  let body;
  if (status === 'needs-install') {
    body = <p>Para recibir avisos en {isIOS() ? 'iPhone/iPad' : 'este dispositivo'}: Safari → Compartir → <b>Añadir a pantalla de inicio</b>, abre NEXO desde el icono y activa los avisos aquí.</p>;
  } else if (status === 'unsupported') {
    body = <p>Este navegador no admite notificaciones push.</p>;
  } else if (status === 'missing-key') {
    body = <p>El servidor no tiene configurada la clave VAPID (<code>VITE_VAPID_PUBLIC_KEY</code>).</p>;
  } else if (status === 'denied') {
    body = <p>Las notificaciones están bloqueadas. Actívalas en Ajustes → Notificaciones → NEXO{isIOS() ? '' : ' (o en los permisos del sitio)'} y vuelve a abrir la app.</p>;
  } else if (status === 'granted' && subscribed) {
    body = (
      <div className="row tight">
        <span className="grow">🔔 Avisos activos en este dispositivo</span>
        <button disabled={busy} onClick={test}>Probar</button>
        <button disabled={busy} className="ghost" onClick={disable}>Desactivar</button>
      </div>
    );
  } else {
    body = (
      <div className="row tight">
        <span className="grow">Recibe un aviso a la hora que elijas, aunque NEXO esté cerrado.</span>
        <button disabled={busy} onClick={enable}>Activar avisos</button>
      </div>
    );
  }

  return (
    <div className="card push">
      {body}
      {msg && <p className="muted small">{msg}</p>}
      {devices.length > 0 && (
        <details>
          <summary className="muted small">{devices.length} dispositivo(s) con avisos</summary>
          <ul className="devices">
            {devices.map((d) => (
              <li key={d.id} className="small">
                <span className="grow">{deviceName(d.user_agent)} · desde {new Date(d.created_at).toLocaleDateString('es-MX')}{d.endpoint === thisEndpoint ? ' (este)' : ''}</span>
                <button className="icon" disabled={busy} onClick={() => removeDevice(d)} aria-label="Quitar dispositivo">✕</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// Estado del aviso de una tarea (reminder_status lo escribe el servidor).
const REMINDER_LABELS = {
  sent: ['✅', 'Aviso enviado'],
  no_devices: ['⚠️', 'No se entregó: no había dispositivos con avisos activos'],
  rejected: ['⚠️', 'No se entregó: el servicio push lo rechazó'],
  failed: ['⚠️', 'No se entregó: el servicio push falló'],
  expired: ['⌛', 'No se envió: venció hace más de 12 h'],
  missed: ['⌛', 'No se envió: la tarea se reabrió cuando la hora del aviso ya había pasado'],
  unknown: ['❔', 'Estado desconocido: pudo no haber llegado'],
};
const RETRYABLE = new Set(['no_devices', 'rejected', 'failed', 'expired', 'missed', 'unknown']);
function ReminderBadge({ task }) {
  let icon, label;
  if (!task.reminded_at && task.done) [icon, label] = ['🔕', 'Sin aviso: tarea completada'];
  else if (!task.reminded_at) [icon, label] = ['🔔', 'Aviso programado'];
  else [icon, label] = REMINDER_LABELS[task.reminder_status] || ['⏳', 'Enviando aviso'];
  // Reintentar = reprogramar a "ahora": el trigger re-arma el aviso y el cron lo envía en ≤1 min.
  const retry = () => exec(supabase.from('tasks').update({ remind_at: new Date().toISOString() }).eq('id', task.id));
  return (
    <span className="bell" title={label} aria-label={label}>
      {' '}· {icon} {fmtInstant(task.remind_at)}
      {!task.done && RETRYABLE.has(task.reminder_status) && <button className="link small" onClick={retry}>Reintentar</button>}
    </span>
  );
}

function deviceName(ua = '') {
  if (!/Mozilla\//.test(ua)) return ua || 'Dispositivo'; // ya es un nombre legible (deviceLabel)
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Navegador';
}
