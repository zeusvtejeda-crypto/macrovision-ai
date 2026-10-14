// Proveedor de datos para React: un solo store sincronizado por sesión, hooks de lectura reactiva.
import React, { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { supabase } from '../supabase.js';
import { createStore } from './sync.js';

const StoreContext = createContext(null);

export function DataProvider({ session, children }) {
  const userId = session.user.id;
  // El store existe desde el primer render (lectura local síncrona); se arranca en el efecto.
  const store = useMemo(() => createStore({ supabase, userId }), [userId]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try { await supabase.rpc('ensure_defaults'); } catch {}
      await store.start();
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; void store.stop(); };
  }, [store]);

  const value = useMemo(() => ({ store, ready, userId }), [store, ready, userId]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx?.store) throw new Error('useStore fuera de DataProvider');
  return ctx.store;
}
export function useDataReady() { return useContext(StoreContext)?.ready ?? false; }

// Versión que cambia con cada evento del store: fuerza re-render de quien la use.
function useStoreVersion(store, filterTable) {
  const [v, setV] = useState(0);
  useEffect(() => store.subscribe((what, detail) => {
    if (what === 'status') return;
    if (filterTable && detail?.table && detail.table !== '*' && detail.table !== filterTable) return;
    setV((x) => x + 1);
  }), [store, filterTable]);
  return v;
}

// Filas de una tabla (sin borradas), reactivas. `select` opcional: (rows) => rows filtradas/ordenadas.
export function useRows(table, select, deps = []) {
  const store = useStore();
  const v = useStoreVersion(store, table);
  return useMemo(() => {
    const rows = store.list(table);
    return select ? select(rows) : rows;
  }, [store, table, v, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useRow(table, id) {
  const store = useStore();
  const v = useStoreVersion(store, table);
  return useMemo(() => (id ? store.get(table, id) : null), [store, table, id, v]);
}

export function useSyncStatus() {
  const store = useStore();
  return useSyncExternalStore(
    (cb) => store.subscribe((what) => { if (what === 'status' || what === 'conflict' || what === 'error') cb(); }),
    () => JSON.stringify(store.status()),
  ) && store.status();
}

// Todas las filas por id de varias tablas (para enlazar nombres de área/proyecto/cliente).
export function useLookup(table) {
  const rows = useRows(table);
  return useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])), [rows]);
}
