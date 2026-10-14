import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { supabase, configured } from './supabase.js';
import { DataProvider, useDataReady, useStore, useSyncStatus, useRows } from './data/provider.jsx';
import { useRoute, Link, navigate } from './router.jsx';
import { modules, lazyRoute } from './modules/index.js';
import { ROUTE_MODULE, MORE_ENTRIES } from './modules/manifest.js';
import { Toaster, Empty, Page } from './ui.jsx';
import { disablePush, syncPush } from './push.js';
import * as legacy from './legacy.jsx';

const NAV = [
  ['/', 'Inicio', '🏠'],
  ['/asistente', 'Asistente', '💬'],
  ['/agenda', 'Agenda', '📅'],
  ['/proyectos', 'Proyectos', '📁'],
  ['/biblioteca', 'Biblioteca', '📚'],
  ['/mas', 'Más', '⋯'],
];
const MAIN_MODULES = ['home', 'assistant', 'agenda', 'projects', 'library'];

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured) return setReady(true);
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <legacy.Center><h1>NEXO</h1><p>Falta configurar <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.</p></legacy.Center>;
  if (!ready) return <legacy.Center><p>Cargando…</p></legacy.Center>;
  if (!session) return <legacy.Auth />;
  return (
    <DataProvider session={session}>
      <Shell session={session} />
      <Toaster />
    </DataProvider>
  );
}

// Pantallas de la versión 1 que siguen activas hasta que exista el módulo nuevo.
const LEGACY = {
  assistant: () => <legacy.Chat />,
  tasks: () => <legacy.Tasks />,
  notes: () => <legacy.Notes />,
  finance: () => <legacy.Money />,
  memory: () => <legacy.Memory />,
  settings: () => <><legacy.Memory /><legacy.PushCard /><legacy.SiriCard /></>,
};

// Número en el icono de la app (iOS 16.4+ instalada, macOS Sonoma+): tareas vencidas o de hoy.
function useAppBadge() {
  const tasks = useRows('tasks', (rows) => rows.filter((t) => !t.done && (t.due_at || t.planned_on)));
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    const today = new Date(); const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0'), d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    const n = tasks.filter((t) => (t.due_at && t.due_at.slice(0, 10) <= todayStr) || t.planned_on === todayStr).length;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }, [tasks]);
}

function Shell({ session }) {
  const route = useRoute();
  const dataReady = useDataReady();
  const store = useStore();
  useAppBadge();

  useEffect(() => {
    syncPush(supabase);
    // Toque en una notificación con la app abierta → el service worker pide ir a una ruta.
    const onMsg = (e) => {
      if (e.data?.type !== 'nexo:open') return;
      const u = new URL(e.data.url, location.origin);
      navigate(u.pathname + u.search);
    };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  // Atajos de teclado (Mac): ⌘K captura rápida · ⌘J asistente · ⌘1-6 pestañas
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if (e.key === 'k' && !e.shiftKey) { e.preventDefault(); navigate('/bandeja?nuevo=1'); }
      else if (e.key === 'j') { e.preventDefault(); navigate('/asistente'); }
      else if (/^[1-6]$/.test(e.key) && !inField) { e.preventDefault(); navigate(NAV[Number(e.key) - 1][0]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function logout() {
    await disablePush(supabase).catch(() => {});
    await store.forget().catch(() => {});
    await supabase.auth.signOut({ scope: 'local' });
  }

  const moduleName = ROUTE_MODULE[route.name];
  const current = route.path === '/' ? '/' : NAV.find(([to]) => to !== '/' && route.path.startsWith(to))?.[0] || (MAIN_MODULES.includes(moduleName) ? '/' : '/mas');

  return (
    <div className="shell">
      <nav className="nav" aria-label="Principal">
        <div className="brand"><img src="/icons/icon.svg" alt="" width="28" height="28" /> NEXO <SyncDot /></div>
        {NAV.map(([to, label, icon]) => (
          <Link key={to} to={to} className={current === to ? 'active' : ''} aria-current={current === to ? 'page' : undefined}>
            <span className="ico" aria-hidden>{icon}</span><span className="lbl">{label}</span>
          </Link>
        ))}
        <button className="logout" onClick={logout} title={session.user.email}>
          <span className="ico" aria-hidden>⎋</span><span className="lbl">Salir</span>
        </button>
      </nav>
      <main className="main">
        <SyncBanner />
        {!dataReady && <p className="muted small">Cargando tus datos…</p>}
        <Suspense fallback={<p className="muted small">Cargando…</p>}>
          <Screen route={route} />
        </Suspense>
      </main>
    </div>
  );
}

function Screen({ route }) {
  const moduleName = ROUTE_MODULE[route.name];
  const mod = useMemo(() => modules.find((m) => m.name === moduleName), [moduleName]);
  const Comp = useMemo(() => (mod ? lazyRoute(mod.loader, route.name) : null), [mod, route.name]);
  if (Comp) return <Comp params={route.params} query={route.query} />;
  if (route.name === 'more') return <More />;
  const Legacy = LEGACY[moduleName];
  if (Legacy) return <Legacy />;
  if (route.name === 'notFound') return <Page title="No encontrado"><Empty icon="🧭" title="Esa página no existe" action={<Link to="/" className="btn">Ir a Inicio</Link>} /></Page>;
  return <Page title="Próximamente"><Empty icon="🚧" title="Este módulo está en construcción" hint="Mientras tanto, puedes usar el asistente." action={<Link to="/asistente" className="btn">Abrir asistente</Link>} /></Page>;
}

function More() {
  return (
    <Page title="Más">
      <ul className="list more">
        {MORE_ENTRIES.map(([to, label, icon]) => (
          <li key={to} className="li"><Link to={to} className="li-link"><span className="ico" aria-hidden>{icon}</span><span className="grow">{label}</span><span className="muted">›</span></Link></li>
        ))}
      </ul>
    </Page>
  );
}

function SyncDot() {
  const s = useSyncStatus();
  const tone = !s.online ? 'offline' : s.errors || s.conflicts ? 'warn' : s.pending || s.syncing ? 'busy' : 'ok';
  const label = !s.online ? 'Sin conexión: los cambios se guardan aquí y se envían al volver'
    : s.conflicts ? 'Hay cambios en conflicto' : s.errors ? 'Hay cambios rechazados'
    : s.pending ? `${s.pending} cambio(s) pendiente(s)` : s.syncing ? 'Sincronizando' : 'Sincronizado';
  return <Link to="/ajustes#sync" className={`syncdot ${tone}`} title={label} aria-label={label} />;
}

function SyncBanner() {
  const s = useSyncStatus();
  if (!s.conflicts && !s.errors && s.online) return null;
  return (
    <div className={`banner ${!s.online ? 'offline' : 'warn'}`} role="status">
      {!s.online && <span>Sin conexión. Puedes seguir trabajando: {s.pending ? `${s.pending} cambio(s) se enviarán al volver.` : 'todo está guardado en este dispositivo.'}</span>}
      {s.online && s.conflicts > 0 && <span>{s.conflicts} cambio(s) en conflicto con otro dispositivo. <Link to="/ajustes#sync">Revisar</Link></span>}
      {s.online && !s.conflicts && s.errors > 0 && <span>{s.errors} cambio(s) rechazado(s) por el servidor. <Link to="/ajustes#sync">Ver detalle</Link></span>}
    </div>
  );
}
