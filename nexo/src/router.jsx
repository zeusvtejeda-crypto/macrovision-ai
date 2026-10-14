// Enrutador mínimo con historial del navegador: enlaces internos (/tareas/:id), botón atrás,
// restauración de la última ruta al reabrir la app instalada.
import { useEffect, useState } from 'react';

const LAST_ROUTE_KEY = 'nexo-last-route';

export const ROUTES = [
  ['/', 'home'],
  ['/asistente', 'assistant'],
  ['/agenda', 'agenda'],
  ['/proyectos', 'projects'],
  ['/proyectos/:id', 'project'],
  ['/tareas', 'tasks'],
  ['/tareas/:id', 'task'],
  ['/bandeja', 'inbox'],
  ['/bandeja/:id', 'inboxItem'],
  ['/biblioteca', 'library'],
  ['/biblioteca/:id', 'resource'],
  ['/notas', 'notes'],
  ['/notas/:id', 'note'],
  ['/clientes', 'clients'],
  ['/clientes/:id', 'client'],
  ['/contactos', 'contacts'],
  ['/contactos/:id', 'contact'],
  ['/reuniones', 'meetings'],
  ['/reuniones/:id', 'meeting'],
  ['/contenido', 'content'],
  ['/estudios', 'study'],
  ['/estudios/:id', 'subject'],
  ['/finanzas', 'finance'],
  ['/habitos', 'habits'],
  ['/revision', 'review'],
  ['/objetivos', 'goals'],
  ['/objetivos/:id', 'goal'],
  ['/memoria', 'memory'],
  ['/historial', 'history'],
  ['/ajustes', 'settings'],
  ['/mas', 'more'],
];

export function matchRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const [pattern, name] of ROUTES) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = re.exec(path);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), path };
  }
  return { name: 'notFound', params: {}, path };
}

// Pestañas antiguas (?tab=) y ruta guardada → ruta nueva.
const TAB_TO_PATH = { chat: '/asistente', tasks: '/tareas', notes: '/notas', money: '/finanzas', memory: '/memoria', settings: '/ajustes' };
export function initialPath() {
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab');
  if (tab && TAB_TO_PATH[tab]) return TAB_TO_PATH[tab];
  if (location.pathname !== '/' ) return location.pathname + location.search;
  try {
    const saved = localStorage.getItem(LAST_ROUTE_KEY);
    if (saved && matchRoute(saved).name !== 'notFound') return saved;
  } catch {}
  return '/';
}

export function navigate(path, { replace = false } = {}) {
  if (path === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  window.dispatchEvent(new Event('nexo:navigate'));
}

export function useRoute() {
  const [path, setPath] = useState(() => {
    const p = initialPath();
    if (p !== location.pathname + location.search) history.replaceState(null, '', p);
    return p;
  });
  useEffect(() => {
    const onChange = () => setPath(location.pathname + location.search);
    window.addEventListener('popstate', onChange);
    window.addEventListener('nexo:navigate', onChange);
    return () => { window.removeEventListener('popstate', onChange); window.removeEventListener('nexo:navigate', onChange); };
  }, []);
  useEffect(() => { try { localStorage.setItem(LAST_ROUTE_KEY, path); } catch {} }, [path]);
  return { ...matchRoute(path.split('?')[0]), query: new URLSearchParams(path.split('?')[1] || '') };
}

// <Link to="/tareas/123">: navegación interna sin recargar; ⌘-clic abre normal.
export function Link({ to, children, className, ...rest }) {
  const onClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={onClick} className={className} {...rest}>{children}</a>;
}

// Enlace a un registro cualquiera (lo usan el asistente y las tarjetas).
export const recordPath = (table, id) => ({
  tasks: `/tareas/${id}`, projects: `/proyectos/${id}`, clients: `/clientes/${id}`, contacts: `/contactos/${id}`, meetings: `/reuniones/${id}`,
  resources: `/biblioteca/${id}`, notes: `/notas/${id}`, inbox_items: `/bandeja/${id}`, goals: `/objetivos/${id}`, subjects: `/estudios/${id}`,
  events: '/agenda', transactions: '/finanzas', habits: '/habitos', content_items: '/contenido', memories: '/memoria', agreements: `/reuniones`,
}[table] || '/');
