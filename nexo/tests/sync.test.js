// Motor de sincronización con IndexedDB simulado y un "servidor" que aplica el mismo contrato que
// sync_push/sync_pull (versiones, conflictos, borrado lógico; las reglas SQL reales se prueban en test:sql).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createStore, SYNC_TABLES } from '../src/data/sync.js';

let clock = Date.parse('2026-10-14T12:00:00Z');
const now = () => new Date(clock);
const tick = (ms = 1000) => { clock += ms; };

function fakeServer() {
  const rows = new Map(); // "table|id" -> row
  let online = true;
  const server = {
    rows,
    setOnline: (v) => { online = v; },
    calls: [],
    // Escribe directo "desde otro dispositivo"
    write(table, row) {
      const key = `${table}|${row.id}`;
      const prev = rows.get(key);
      rows.set(key, { ...(prev || { created_at: now().toISOString() }), ...row, version: (prev?.version || 0) + 1, updated_at: now().toISOString() });
      return rows.get(key);
    },
    supabase: {
      async rpc(name, args) {
        server.calls.push(name);
        if (!online) return { data: null, error: { message: 'Failed to fetch' } };
        if (name === 'sync_push') {
          const out = [];
          for (const ch of args.p_changes) {
            if (!SYNC_TABLES.includes(ch.table)) { out.push({ table: ch.table, id: ch.id, status: 'rejected', error: 'tabla no sincronizable' }); continue; }
            const key = `${ch.table}|${ch.id}`;
            const cur = rows.get(key);
            if (!cur) {
              if (ch.op === 'delete') { out.push({ table: ch.table, id: ch.id, status: 'applied', version: null }); continue; }
              const { user_id, version, updated_at, reminded_at, ...fields } = ch.row;
              rows.set(key, { id: ch.id, ...fields, version: 1, updated_at: now().toISOString(), created_at: fields.created_at || now().toISOString() });
              out.push({ table: ch.table, id: ch.id, status: 'applied', version: 1 });
            } else if (ch.base_version == null || ch.base_version !== cur.version) {
              out.push({ table: ch.table, id: ch.id, status: 'conflict', version: cur.version, server: cur });
            } else {
              const { user_id, version, updated_at, reminded_at, ...fields } = ch.row;
              const next = ch.op === 'delete' ? { ...cur, deleted_at: now().toISOString() } : { ...cur, ...fields };
              rows.set(key, { ...next, version: cur.version + 1, updated_at: now().toISOString() });
              out.push({ table: ch.table, id: ch.id, status: 'applied', version: cur.version + 1 });
            }
          }
          return { data: out, error: null };
        }
        if (name === 'sync_pull') {
          const tables = {};
          for (const [key, row] of rows) {
            const [t] = key.split('|');
            if (row.updated_at > args.p_since) (tables[t] ??= { rows: [], more: false }).rows.push(row);
          }
          return { data: { server_time: now().toISOString(), tables }, error: null };
        }
        return { data: null, error: { message: `rpc desconocida ${name}` } };
      },
    },
  };
  return server;
}

async function freshStore(server, userId = 'u1') {
  const store = createStore({ supabase: server.supabase, userId, now, online: () => true });
  await store.start();
  return store;
}

describe('sincronización', () => {
  let server;
  beforeEach(() => { indexedDB = new IDBFactory(); globalThis.indexedDB = indexedDB; server = fakeServer(); clock = Date.parse('2026-10-14T12:00:00Z'); });

  it('crear → visible al instante, en cola, y aplicado en el servidor con versión 1', async () => {
    const store = await freshStore(server);
    const t = await store.save('tasks', { title: 'Comprar leche' });
    expect(store.list('tasks').map((x) => x.title)).toEqual(['Comprar leche']);
    await store.flush();
    expect(server.rows.get(`tasks|${t.id}`)).toMatchObject({ title: 'Comprar leche', version: 1 });
    expect(store.get('tasks', t.id).version).toBe(1);
    expect(store.status()).toMatchObject({ pending: 0, errors: 0, conflicts: 0 });
  });

  it('la cola sobrevive al cierre: se envía al reabrir', async () => {
    server.setOnline(false);
    const store = createStore({ supabase: server.supabase, userId: 'u1', now, online: () => false });
    await store.start();
    const t = await store.save('tasks', { title: 'Sin conexión' });
    await store.save('tasks', { id: t.id, priority: 1 }); // dos cambios → un solo registro en cola
    expect(store.status()).toMatchObject({ pending: 1, online: false });
    await store.stop();

    server.setOnline(true);
    const again = await freshStore(server); // misma cuenta, misma copia local
    expect(again.get('tasks', t.id)).toMatchObject({ title: 'Sin conexión', priority: 1 });
    await again.flush();
    expect(server.rows.get(`tasks|${t.id}`)).toMatchObject({ title: 'Sin conexión', priority: 1, version: 1 });
  });

  it('descarga cambios de otro dispositivo, incluidos borrados, sin pisar cambios locales pendientes', async () => {
    const store = await freshStore(server);
    const a = await store.save('notes', { content: 'A' });
    await store.flush();
    tick();
    server.write('notes', { id: a.id, content: 'A editada en el Mac' });
    const b = server.write('notes', { id: 'b-id', content: 'B nueva en el iPad' });
    tick();
    server.write('notes', { id: b.id, deleted_at: now().toISOString() });
    // cambio local pendiente en C mientras llega el pull
    server.setOnline(false);
    const c = await store.save('notes', { content: 'C local' });
    server.setOnline(true);
    await store.pull();
    expect(store.get('notes', a.id).content).toBe('A editada en el Mac');
    expect(store.list('notes').find((n) => n.id === b.id)).toBeUndefined(); // borrada
    expect(store.get('notes', c.id).content).toBe('C local');
    expect(store.status().lastSync).toBeTruthy();
  });

  it('conflicto: el servidor cambió mientras editaba; nada se sobrescribe hasta que yo decida', async () => {
    const store = await freshStore(server);
    const t = await store.save('tasks', { title: 'v1' });
    await store.flush();
    tick();
    server.write('tasks', { id: t.id, title: 'Cambiada en el iPad' }); // version 2
    await store.save('tasks', { id: t.id, title: 'Cambiada en el iPhone' }); // base 1
    await store.flush();
    expect(store.status().conflicts).toBe(1);
    expect(server.rows.get(`tasks|${t.id}`).title).toBe('Cambiada en el iPad');
    const [c] = await store.conflicts();
    expect(c.mine.title).toBe('Cambiada en el iPhone');
    expect(c.server.title).toBe('Cambiada en el iPad');

    await store.resolve('tasks', t.id, 'mine');
    await store.flush();
    expect(server.rows.get(`tasks|${t.id}`)).toMatchObject({ title: 'Cambiada en el iPhone', version: 3 });
    expect(store.status().conflicts).toBe(0);
  });

  it('conflicto resuelto con la versión del servidor o con una combinación', async () => {
    const store = await freshStore(server);
    const t = await store.save('tasks', { title: 'v1', notes: 'mías' });
    await store.flush();
    tick();
    server.write('tasks', { id: t.id, title: 'del servidor' });
    await store.save('tasks', { id: t.id, notes: 'editadas' });
    await store.flush();
    await store.resolve('tasks', t.id, 'server');
    expect(store.get('tasks', t.id)).toMatchObject({ title: 'del servidor', notes: 'mías' });

    tick();
    server.write('tasks', { id: t.id, title: 'otra vez servidor' });
    await store.save('tasks', { id: t.id, notes: 'de nuevo' });
    await store.flush();
    await store.resolve('tasks', t.id, { title: 'combinado', notes: 'de nuevo' });
    await store.flush();
    expect(server.rows.get(`tasks|${t.id}`)).toMatchObject({ title: 'combinado', notes: 'de nuevo' });
  });

  it('rechazos quedan visibles con su error y se pueden reintentar o descartar', async () => {
    const store = await freshStore(server);
    await store.save('tasks', { id: 'x', title: 'ok' });
    await store.flush();
    // simula un rechazo del servidor
    server.supabase.rpc = async (name, args) => (name === 'sync_push'
      ? { data: args.p_changes.map((c) => ({ table: c.table, id: c.id, status: 'rejected', error: 'valor inválido' })), error: null }
      : { data: { server_time: now().toISOString(), tables: {} }, error: null });
    await store.save('tasks', { id: 'x', status: 'raro' });
    await store.flush();
    expect(store.status()).toMatchObject({ errors: 1, pending: 0 });
    await store.discardError('tasks', 'x');
    expect(store.status()).toMatchObject({ errors: 0, pending: 0 });
  });

  it('cambio de cuenta vacía la copia local (nunca se mezclan datos)', async () => {
    const s1 = await freshStore(server, 'u1');
    await s1.save('tasks', { title: 'de u1' });
    await s1.stop();
    // u2 inicia sesión en el mismo dispositivo; su servidor (RLS) no tiene nada de u1
    const s2 = await freshStore(fakeServer(), 'u2');
    expect(s2.list('tasks')).toEqual([]);
    expect((await s2._local().all('outbox'))).toEqual([]);
  });

  it('exportar e importar conservan ids y no pisan lo más nuevo', async () => {
    const store = await freshStore(server);
    const t = await store.save('tasks', { title: 'Exportable' });
    await store.flush();
    const dump = await store.exportAll();
    expect(dump.app).toBe('nexo');
    expect(dump.tables.tasks.find((x) => x.id === t.id).title).toBe('Exportable');

    const fresh = fakeServer();
    const other = await freshStore(fresh, 'u9');
    const n = await other.importAll(dump);
    expect(n).toBeGreaterThanOrEqual(1);
    await other.flush();
    expect(fresh.rows.get(`tasks|${t.id}`)).toMatchObject({ title: 'Exportable' });
    expect(await other.importAll(dump)).toBe(0); // repetir no duplica ni pisa
    await expect(other.importAll({ foo: 1 })).rejects.toThrow('no válido');
  });

  it('sin conexión al enviar: el error queda en el estado y se reintenta al volver', async () => {
    let online = true;
    const store = createStore({ supabase: server.supabase, userId: 'u1', now, online: () => online });
    await store.start();
    online = false; server.setOnline(false);
    await store.save('tasks', { title: 'offline' });
    expect(store.status()).toMatchObject({ pending: 1, online: false });
    online = true; server.setOnline(true);
    await store.flush();
    expect(store.status()).toMatchObject({ pending: 0, online: true });
  });
});
