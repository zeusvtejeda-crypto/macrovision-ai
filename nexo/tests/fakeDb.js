// Fake mínimo del query builder de Supabase en memoria, por usuario (simula RLS).
let seq = 0;
export function fakeDb(store = {}, userId = 'u1', { rpc = {}, admin = false } = {}) {
  return {
    calls: [],
    async rpc(name, args) {
      if (!rpc[name]) return { data: null, error: { message: `rpc ${name} no existe` } };
      return { data: await rpc[name](args, store), error: null };
    },
    from(table) {
      store[table] ??= [];
      const rows = store[table];
      const st = { op: 'select', filters: [], order: [], limit: null, single: false, payload: null };
      const q = {
        select() { if (st.op === 'select' || st.op === 'insert' || st.op === 'update') st.returning = true; return q; },
        insert(p) { st.op = 'insert'; st.payload = p; return q; },
        update(p) { st.op = 'update'; st.payload = p; return q; },
        delete() { st.op = 'delete'; return q; },
        eq(c, v) { st.filters.push((r) => r[c] === v); return q; },
        in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return q; },
        gte(c, v) { st.filters.push((r) => r[c] != null && r[c] >= v); return q; },
        lte(c, v) { st.filters.push((r) => r[c] != null && r[c] <= v); return q; },
        or(expr) {
          const parts = expr.split(',').map((p) => { const [c, , pat] = p.split('.'); return [c, pat.replaceAll('%', '').toLowerCase()]; });
          st.filters.push((r) => parts.some(([c, pat]) => (r[c] || '').toLowerCase().includes(pat)));
          return q;
        },
        order(c, o = {}) { st.order.push([c, o.ascending !== false]); return q; },
        limit(n) { st.limit = n; return q; },
        single() { st.single = true; return q; },
        maybeSingle() { st.single = true; return q; },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      function exec() {
        const mine = admin ? rows : rows.filter((r) => r.user_id === userId);
        if (st.op === 'insert') {
          const row = { id: `id${++seq}`, user_id: userId, created_at: new Date().toISOString(), done: false, ...st.payload };
          rows.push(row);
          return { data: st.single ? row : [row], error: null };
        }
        let out = mine.filter((r) => st.filters.every((f) => f(r)));
        if (st.op === 'update') { out.forEach((r) => Object.assign(r, st.payload)); return { data: out, error: null }; }
        if (st.op === 'delete') { for (const r of out) rows.splice(rows.indexOf(r), 1); return { data: null, error: null }; }
        for (const [c, asc] of st.order.reverse()) out = [...out].sort((a, b) => ((a[c] ?? '') > (b[c] ?? '') ? 1 : -1) * (asc ? 1 : -1));
        if (st.limit) out = out.slice(0, st.limit);
        return { data: st.single ? out[0] ?? null : out, error: null };
      }
      return q;
    },
  };
}
