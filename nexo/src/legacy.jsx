// Pantallas de la versión 1 (chat, pendientes, notas, finanzas, memoria, avisos, Siri).
// Se conservan tal cual mientras los módulos nuevos las sustituyen; usan Supabase directo.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase.js';
import { mxn, fmtDue, localToday, REMINDER_PRESETS, computeRemindAt, fmtInstant } from './format.js';
import { createApiToken } from './tokens.js';
import { pushStatus, enablePush, syncPush, disablePush, sendTestPush, thisDeviceEndpoint, storedEndpoint, isIOS, PUSH_EVENT, PUSH_STORAGE_KEY } from './push.js';

// Los queries de Supabase son perezosos: solo se ejecutan al hacer await.
async function exec(q) {
  const { error } = await q;
  if (error) alert(error.message);
}

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function Center({ children }) {
  return <div className="center">{children}</div>;
}

export function Auth() {
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
export function useTable(table, query, deps = []) {
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

export function Chat({ session }) {
  // Los 200 más recientes (incluye lo dicho por Siri), en orden cronológico.
  const [latest, reload] = useTable('chat_messages', (q) => q.order('created_at', { ascending: false }).limit(200));
  const msgs = useMemo(() => [...latest].reverse(), [latest]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(null); // { text, sentAt }
  const [error, setError] = useState('');
  const end = useRef(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, pending]);
  // Con Realtime, el mensaje enviado llega desde la base antes de que termine la petición: no pintarlo dos veces.
  const since = (m) => pending && new Date(m.created_at).getTime() >= pending.sentAt - 5000;
  const echoed = Boolean(pending && msgs.some((m) => m.role === 'user' && m.content === pending.text && since(m)));
  const answered = Boolean(pending && msgs.some((m) => m.role === 'assistant' && since(m)));

  async function send(e) {
    e.preventDefault();
    const message = text.trim();
    if (!message || pending) return;
    setText(''); setError(''); setPending({ text: message, sentAt: Date.now() });
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
        {pending && !echoed && <div className="bubble user">{pending.text}</div>}
        {pending && !answered && <div className="bubble assistant muted">Pensando…</div>}
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

export function Tasks() {
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

export function Notes() {
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

export function Money() {
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

export function Memory() {
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
export function PushCard() {
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
export function ReminderBadge({ task }) {
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

// Siri y Atajos: tokens personales + instrucciones para crear el atajo.
export function SiriCard() {
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('Atajo NEXO');
  const [fresh, setFresh] = useState(null); // token recién creado (se muestra una sola vez)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const endpoint = `${location.origin}/api/shortcut`;

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('api_tokens').select('id,name,prefix,created_at,last_used_at,expires_at').order('created_at', { ascending: false });
    if (!error) setTokens(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { setFresh(await createApiToken(supabase, name)); await load(); } catch (err) { setMsg(err.message); } finally { setBusy(false); }
  }
  async function revoke(t) {
    if (!confirm(`¿Revocar el token “${t.name}”? El atajo que lo use dejará de funcionar en TODOS tus dispositivos (iCloud lo sincroniza).`)) return;
    const { error } = await supabase.from('api_tokens').delete().eq('id', t.id);
    if (error) setMsg(error.message);
    load();
  }
  const header = fresh ? `Bearer ${fresh}` : null;

  return (
    <section className="siri">
      <h2>Siri y Atajos</h2>
      <p className="muted">
        Háblale a NEXO con “Oye Siri, NEXO”, el Botón de acción o la app Atajos. Crea <b>un token por atajo</b>: el atajo (con su token)
        se sincroniza por iCloud a tu iPhone, iPad y Mac. Caduca en un año.
      </p>

      <form className="card row" onSubmit={create}>
        <input aria-label="Nombre del token" placeholder="Nombre (p. ej. iPhone)" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <button disabled={busy || !name.trim()}>Crear token</button>
      </form>
      {msg && <p className="error">{msg}</p>}

      {fresh && (
        <div className="card fresh">
          <p><b>Copia tu token ahora:</b> no se volverá a mostrar. Trátalo como una contraseña. Abajo, en el paso 3, está el valor completo del encabezado para copiarlo de una vez.</p>
          <CopyField label="Token" value={fresh} />
          <button className="ghost" onClick={() => setFresh(null)}>Ya lo copié</button>
        </div>
      )}

      {tokens.length > 0 && (
        <ul className="list">
          {tokens.map((t) => (
            <li key={t.id}>
              <div className="grow">
                <div>{t.name} <span className="muted small">({t.prefix}…)</span></div>
                <div className="muted small">
                  creado {new Date(t.created_at).toLocaleDateString('es-MX')}
                  {t.last_used_at ? ` · último uso ${fmtInstant(t.last_used_at)}` : ' · sin usar'}
                  {t.expires_at && (new Date(t.expires_at) < new Date() ? ' · vencido' : ` · vence ${new Date(t.expires_at).toLocaleDateString('es-MX')}`)}
                </div>
              </div>
              <button className="ghost" onClick={() => revoke(t)}>Revocar</button>
            </li>
          ))}
        </ul>
      )}

      <details className="card howto" open={Boolean(fresh)}>
        <summary><b>Cómo crear el atajo “NEXO”</b> (iPhone, iPad o Mac)</summary>
        <ol>
          <li>Abre la app <b>Atajos</b> → <b>+</b> (nuevo atajo) y llámalo <b>NEXO</b>.</li>
          <li>Agrega la acción <b>Dictar texto</b>. Idioma: Español (México); Dejar de escuchar: <i>Después de la pausa</i>.
            Requiere el Dictado activado (Configuración → General → Teclado → Dictado).</li>
          <li>Agrega <b>Obtener contenido de URL</b> y pon esta URL:
            <CopyField label="URL" value={endpoint} />
            Toca <b>Mostrar más</b>:
            <ul>
              <li><b>Método</b>: POST</li>
              <li><b>Encabezados</b> → nuevo encabezado: Clave <code>Authorization</code>, Valor:
                {header
                  ? <CopyField label="Valor del encabezado" value={header} />
                  : <span className="muted"> <code>Bearer </code> seguido de tu token (crea uno arriba para copiar aquí el valor completo).</span>}
              </li>
              <li><b>Solicitar cuerpo</b> (así se llama en español de México; en España, <i>Cuerpo de la solicitud</i>): <b>JSON</b> →
                nuevo campo → <b>Texto</b>: Clave <code>texto</code>, Valor: toca <b>Seleccionar variable</b> y elige <b>Texto dictado</b>.</li>
            </ul>
          </li>
          <li>Agrega <b>Leer texto</b> (Siri responde en voz alta) o <b>Mostrar contenido</b> (en iOS 18: <i>Mostrar resultado</i>), con <b>Contenido de URL</b>.</li>
          <li>Ejecútalo una vez con el iPhone desbloqueado y permite la conexión (<b>Permitir siempre</b>). Para usarlo bloqueado: Detalles del atajo → Privacidad → <b>Permitir ejecución en dispositivo bloqueado</b>.</li>
          <li>Listo: di <b>“Oye Siri, NEXO”</b>. También puedes ponerlo en Configuración → <b>Botón de acción</b> → Atajo (iPhone 15 Pro y posteriores) o como control en el Centro de control.</li>
        </ol>
        <p className="muted small">
          <b>Sin Claude (más rápido y gratis):</b> agrega al JSON otro campo de texto <code>accion</code> = <code>nota</code> (guarda lo dictado como nota)
          o <code>tarea</code> (lo agrega a Pendientes). <b>Desde otras apps:</b> en Detalles activa <i>Mostrar en la hoja de compartir</i> y usa
          <i>Entrada de atajo</i> en lugar de <i>Texto dictado</i>. <b>En Mac</b> el atajo llega por iCloud: Detalles → <i>Fijar en la barra de menús</i>
          o <i>Agregar función rápida de teclado</i>. Si Claude tarda más de ~20 s, Siri te avisa y la respuesta queda en el Chat.
        </p>
      </details>
    </section>
  );
}

export function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { window.prompt('Copia manualmente:', value); }
  }
  return (
    <div className="copy">
      <code aria-label={label}>{value}</code>
      <button type="button" className="ghost" onClick={copy}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
    </div>
  );
}

