// Motor de sincronización: lectura local inmediata, cola de cambios, envío con control de versiones,
// descarga incremental, conflictos explícitos y estado visible.
//
//   const store = createStore({ supabase, userId })
//   await store.start()                      // abre la copia local, descarga cambios, escucha Realtime
//   store.list('tasks')                      // lectura síncrona desde memoria (filtra borrados)
//   await store.save('tasks', { id?, ...})   // crea/edita (optimista) y encola
//   await store.remove('tasks', id)          // borrado lógico
//   store.subscribe(fn)                      // cambios en datos/estado
//   store.status()                           // { online, persistent, pending, errors, conflicts, lastSync, syncing }
//   store.conflicts(), store.resolve(table, id, 'mine' | 'server' | rowObject)
//   store.exportAll(), store.importAll(json)
import { openLocal, requestPersistence } from './local.js';

export const SYNC_TABLES = ['settings', 'areas', 'clients', 'goals', 'projects', 'attachments', 'contacts', 'subjects', 'events', 'meetings', 'tasks',
  'inbox_items', 'notes', 'agreements', 'content_items', 'resources', 'grades', 'accounts', 'transactions', 'recurring_items',
  'budgets', 'habits', 'habit_logs', 'daily_reviews', 'weekly_reviews', 'priorities', 'memories'];
const PULL_ONLY = ['chat_messages', 'action_log'];
const READONLY = new Set(['user_id', 'version', 'updated_at', 'search', 'reminded_at', 'remind_attempts', 'reminder_status', 'ics_token']);

export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
}));

export function createStore({ supabase, userId, now = () => new Date(), online = () => (typeof navigator === 'undefined' ? true : navigator.onLine) }) {
  let local = null;
  const mem = new Map(); // table -> Map(id -> row)   (caché en memoria para lecturas síncronas)
  const listeners = new Set();
  const state = { online: online(), persistent: false, pending: 0, errors: 0, conflicts: 0, lastSync: null, syncing: false, lastError: null };
  let flushing = null;
  let pullTimer = null;
  let channel = null;
  let stopped = false;

  const emit = (what = 'change', detail = {}) => { for (const fn of listeners) { try { fn(what, detail); } catch {} } };
  const tableMap = (t) => { if (!mem.has(t)) mem.set(t, new Map()); return mem.get(t); };

  async function refreshCounters() {
    const out = await local.all('outbox');
    state.pending = out.filter((o) => !o.error).length;
    state.errors = out.filter((o) => o.error).length;
    state.conflicts = (await local.all('conflicts')).length;
  }

  async function loadMemory() {
    const rows = await local.all('rows');
    mem.clear();
    for (const r of rows) tableMap(r.table).set(r.id, r.row);
  }

  async function putLocal(table, row) {
    if (stopped) return; // tras cerrar sesión nada vuelve a escribirse en la copia local
    tableMap(table).set(row.id, row);
    await local.put('rows', { table, id: row.id, row });
  }

  // ---------- lectura ----------
  function list(table, { includeDeleted = false } = {}) {
    const rows = [...tableMap(table).values()];
    return includeDeleted ? rows : rows.filter((r) => !r.deleted_at);
  }
  function get(table, id) { return tableMap(table).get(id) || null; }

  // ---------- escritura optimista ----------
  async function save(table, patch, { actor = 'ui' } = {}) {
    if (!SYNC_TABLES.includes(table)) throw new Error(`Tabla no sincronizable: ${table}`);
    const id = patch.id || uuid();
    const prev = get(table, id);
    const nowIso = now().toISOString();
    const row = { ...(prev || { id, created_at: nowIso, version: 0 }), ...patch, id, updated_at: nowIso };
    await putLocal(table, row);
    const fields = {};
    for (const [k, v] of Object.entries(prev ? patch : row)) if (!READONLY.has(k) && k !== 'id') fields[k] = v;
    await enqueue({ table, id, op: 'upsert', base_version: prev ? prev.version || null : null, row: fields, actor });
    emit('change', { table, id });
    void flush();
    return row;
  }

  async function remove(table, id, { actor = 'ui' } = {}) {
    const prev = get(table, id);
    if (!prev) return;
    const row = { ...prev, deleted_at: now().toISOString() };
    await putLocal(table, row);
    await enqueue({ table, id, op: 'delete', base_version: prev.version || null, row: {}, actor });
    emit('change', { table, id });
    void flush();
  }

  // Un solo registro pendiente por fila: los cambios sucesivos se fusionan (la versión base es la del primero).
  async function enqueue(op) {
    const key = `${op.table}|${op.id}`;
    const existing = await local.get('outbox', key);
    let merged = op;
    if (existing && !existing.error) {
      if (existing.op === 'upsert' && op.op === 'upsert') merged = { ...existing, row: { ...existing.row, ...op.row } };
      else if (op.op === 'delete') merged = { ...existing, op: 'delete', row: {} };
      else merged = { ...existing, ...op, base_version: existing.base_version };
    }
    await local.put('outbox', { ...merged, key, table: op.table, queued_at: now().toISOString(), error: null });
    await refreshCounters();
    emit('status');
  }

  // ---------- envío ----------
  async function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      if (stopped || !online()) { state.online = online(); emit('status'); return; }
      const ops = (await local.all('outbox')).filter((o) => !o.error).sort((a, b) => a.queued_at.localeCompare(b.queued_at));
      if (!ops.length) return;
      state.syncing = true; emit('status');
      try {
        const changes = ops.map((o) => ({ table: o.table, id: o.id, op: o.op, base_version: o.base_version, row: o.row }));
        const { data, error } = await supabase.rpc('sync_push', { p_changes: changes });
        if (error) throw new Error(error.message);
        for (const r of data || []) {
          const key = `${r.table}|${r.id}`;
          const op = ops.find((o) => o.key === key);
          if (!op) continue;
          if (r.status === 'applied') {
            await local.del('outbox', key);
            const cur = get(r.table, r.id);
            if (cur) await putLocal(r.table, { ...cur, version: r.version ?? cur.version });
          } else if (r.status === 'conflict') {
            await local.del('outbox', key);
            await local.put('conflicts', { table: r.table, id: r.id, mine: get(r.table, r.id), server: r.server, op: op.op, at: now().toISOString() });
            emit('conflict', { table: r.table, id: r.id });
          } else {
            await local.put('outbox', { ...op, error: r.error || 'rechazado' });
            emit('error', { table: r.table, id: r.id, error: r.error });
          }
        }
        state.lastError = null;
        state.online = true;
      } catch (err) {
        state.lastError = err.message;
        state.online = online();
      } finally {
        state.syncing = false;
        await refreshCounters();
        emit('status');
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }

  // ---------- descarga incremental ----------
  async function pull({ full = false } = {}) {
    if (stopped || !online()) return;
    const meta = await local.get('meta', 'last_pull');
    let since = full ? '1970-01-01T00:00:00Z' : meta?.value || '1970-01-01T00:00:00Z';
    const pendingKeys = new Set((await local.all('outbox')).map((o) => o.key));
    state.syncing = true; emit('status');
    try {
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase.rpc('sync_pull', { p_since: since });
        if (error) throw new Error(error.message);
        let more = false;
        let maxUpdated = since;
        for (const [table, { rows, more: m }] of Object.entries(data.tables || {})) {
          more ||= m;
          for (const row of rows) {
            if (row.updated_at > maxUpdated) maxUpdated = row.updated_at;
            if (pendingKeys.has(`${table}|${row.id}`)) continue; // cambio local pendiente: lo resuelve el envío
            await putLocal(table, row);
          }
        }
        since = more ? maxUpdated : data.server_time;
        if (!more) break;
      }
      await local.put('meta', { key: 'last_pull', value: since });
      state.lastSync = since;
      state.lastError = null;
      state.online = true;
      emit('change', { table: '*' });
    } catch (err) {
      state.lastError = err.message;
      state.online = online();
    } finally {
      state.syncing = false;
      emit('status');
    }
  }

  const schedulePull = (ms = 400) => { clearTimeout(pullTimer); pullTimer = setTimeout(() => { void pull(); }, ms); };

  // ---------- conflictos ----------
  async function conflicts() { return local.all('conflicts'); }
  async function resolve(table, id, choice) {
    const c = await local.get('conflicts', [table, id]);
    if (!c) return;
    await local.del('conflicts', [table, id]);
    if (choice === 'server') {
      await putLocal(table, c.server);
    } else {
      const base = c.server?.version ?? null;
      const row = choice === 'mine' ? c.mine : { ...c.server, ...choice, id };
      await putLocal(table, { ...row, version: base });
      const fields = {};
      for (const [k, v] of Object.entries(row)) if (!READONLY.has(k) && k !== 'id') fields[k] = v;
      await enqueue({ table, id, op: c.op === 'delete' && choice === 'mine' ? 'delete' : 'upsert', base_version: base, row: fields });
    }
    await refreshCounters();
    emit('change', { table, id });
    void flush();
  }

  async function retryErrors() {
    for (const o of await local.all('outbox')) if (o.error) await local.put('outbox', { ...o, error: null });
    await refreshCounters();
    void flush();
  }
  async function discardError(table, id) {
    await local.del('outbox', `${table}|${id}`);
    await refreshCounters();
    emit('status');
    schedulePull(0);
  }

  // ---------- exportar / importar ----------
  async function exportAll() {
    await pull({ full: true });
    const out = {};
    for (const t of [...SYNC_TABLES, ...PULL_ONLY]) out[t] = list(t, { includeDeleted: true });
    return { app: 'nexo', format: 1, exported_at: now().toISOString(), tables: out };
  }
  async function importAll(json) {
    if (json?.app !== 'nexo' || !json.tables) throw new Error('Archivo de exportación no válido');
    let n = 0;
    for (const t of SYNC_TABLES) {
      for (const row of json.tables[t] || []) {
        if (!row?.id) continue;
        const prev = get(t, row.id);
        if (prev && prev.updated_at >= row.updated_at) continue; // ya tenemos algo igual o más nuevo
        await save(t, { ...row, version: undefined });
        n++;
      }
    }
    return n;
  }

  // ---------- ciclo de vida ----------
  async function start() {
    local = await openLocal();
    state.persistent = local.persistent;
    const owner = await local.get('meta', 'user');
    if (owner && owner.value !== userId) await local.wipe?.(); // cambio de cuenta: nunca mezclar datos
    await local.put('meta', { key: 'user', value: userId });
    await loadMemory();
    await refreshCounters();
    emit('change', { table: '*' });
    void requestPersistence();
    await pull();
    await flush();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisible);
    }
    if (supabase.channel) {
      channel = supabase.channel('nexo-sync');
      for (const t of [...SYNC_TABLES, ...PULL_ONLY]) channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => schedulePull());
      channel.subscribe();
    }
    pullTimer = setTimeout(function tick() { void pull(); pullTimer = setTimeout(tick, 60000); }, 60000);
  }
  const onOnline = () => { state.online = true; emit('status'); void flush().then(() => pull()); };
  const onVisible = () => { if (document.visibilityState === 'visible') { void flush().then(() => pull()); } };
  // Espera a que termine cualquier envío en curso: así un cierre de sesión no deja escrituras tardías.
  async function stop() {
    stopped = true;
    clearTimeout(pullTimer);
    if (typeof window !== 'undefined') { window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); }
    if (channel) supabase.removeChannel?.(channel);
    try { await flushing; } catch {}
  }
  async function forget() { await stop(); await local?.wipe?.(); mem.clear(); }

  return {
    start, stop, forget, list, get, save, remove, flush, pull, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    status: () => ({ ...state }), conflicts, resolve, retryErrors, discardError, exportAll, importAll, uuid,
    _local: () => local,
  };
}
