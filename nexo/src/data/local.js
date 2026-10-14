// Copia local de los datos (IndexedDB) + cola de cambios pendientes + conflictos.
// Si IndexedDB no está disponible (modo privado, cuota), se usa memoria: la app sigue funcionando
// pero sin persistencia local (se avisa en el indicador de sincronización).
import { openDB } from 'idb';

const DB_NAME = 'nexo';
const DB_VERSION = 1;

function memoryStore() {
  const stores = { rows: new Map(), outbox: new Map(), conflicts: new Map(), meta: new Map() };
  const key = (s, k) => (Array.isArray(k) ? k.join('|') : k);
  return {
    persistent: false,
    async get(s, k) { return stores[s].get(key(s, k)) ?? null; },
    async put(s, v, k) { stores[s].set(key(s, k ?? keyOf(s, v)), v); },
    async del(s, k) { stores[s].delete(key(s, k)); },
    async all(s, pred) { return [...stores[s].values()].filter(pred || (() => true)); },
    async clear(s) { stores[s].clear(); },
  };
}

function keyOf(store, v) {
  if (store === 'rows' || store === 'conflicts') return [v.table, v.id];
  if (store === 'outbox') return v.key;
  return v.key;
}

export async function openLocal() {
  if (typeof indexedDB === 'undefined') return memoryStore();
  try {
    const db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        const rows = d.createObjectStore('rows', { keyPath: ['table', 'id'] });
        rows.createIndex('table', 'table');
        d.createObjectStore('outbox', { keyPath: 'key' }).createIndex('table', 'table');
        d.createObjectStore('conflicts', { keyPath: ['table', 'id'] });
        d.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    return {
      persistent: true,
      async get(s, k) { return (await db.get(s, k)) ?? null; },
      async put(s, v) { await db.put(s, v); },
      async del(s, k) { await db.delete(s, k); },
      async all(s, pred) {
        const items = await db.getAll(s);
        return pred ? items.filter(pred) : items;
      },
      async byTable(s, table) { return db.getAllFromIndex(s, 'table', table); },
      async clear(s) { await db.clear(s); },
      async wipe() { await Promise.all(['rows', 'outbox', 'conflicts', 'meta'].map((s) => db.clear(s))); },
    };
  } catch {
    return memoryStore();
  }
}

// Pide al navegador que no borre la copia local por falta de espacio o inactividad.
export async function requestPersistence() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
