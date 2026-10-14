import { describe, it, expect, beforeEach } from 'vitest';
import { newToken, sha256Hex, tokenPrefix } from '../src/tokens.js';
import { TOKEN_RE, bearerToken, hashToken, scopedClient } from '../api/_lib/tokens.js';
import handler, { toSpeech, PER_MINUTE } from '../api/shortcut.js';
import { executeTool } from '../api/_lib/tools.js';
import { fakeDb } from './fakeDb.js';

describe('tokens', () => {
  it('el navegador genera tokens válidos y el hash coincide con el del servidor', async () => {
    const t = newToken();
    expect(t).toMatch(TOKEN_RE);
    expect(tokenPrefix(t)).toMatch(/^nexo_[A-Za-z0-9_-]{4}$/);
    expect(await sha256Hex(t)).toBe(hashToken(t));
    expect(newToken()).not.toBe(t);
  });
  it('bearerToken solo acepta el formato exacto', () => {
    const t = newToken();
    expect(bearerToken({ headers: { authorization: `Bearer ${t}` } })).toBe(t);
    expect(bearerToken({ headers: { authorization: `bearer ${t} ` } })).toBe(t);
    for (const bad of ['', 'Bearer', `Bearer ${t}x`, 'Bearer nexo_corto', `Basic ${t}`.replace('Basic ', 'Basic:'), 'Bearer eyJhbGciOi.jwt.sig']) {
      expect(bearerToken({ headers: { authorization: bad } })).toBeNull();
    }
  });
});

describe('scopedClient (sustituye a la RLS en Siri)', () => {
  const store = () => ({
    tasks: [{ id: 'a1', user_id: 'A', title: 'de A', done: false }, { id: 'b1', user_id: 'B', title: 'de B', done: false }],
    notes: [{ id: 'nb', user_id: 'B', title: null, content: 'secreto de B', created_at: '2026-01-01' }],
  });

  it('lee, edita y borra solo filas del usuario; inserta siempre con su user_id', async () => {
    const st = store();
    const db = scopedClient(fakeDb(st, null, { admin: true }), 'A');
    expect((await db.from('tasks').select('*')).data.map((r) => r.id)).toEqual(['a1']);
    await db.from('tasks').update({ done: true, user_id: 'A' }).eq('id', 'b1');
    expect(st.tasks[1].done).toBe(false);
    await db.from('tasks').update({ user_id: 'B' }).eq('id', 'a1');
    expect(st.tasks[0].user_id).toBe('A'); // no se puede reasignar
    await db.from('tasks').delete().eq('id', 'b1');
    expect(st.tasks.map((r) => r.id)).toContain('b1');
    await db.from('tasks').insert({ title: 'nueva', user_id: 'B' });
    expect(st.tasks.at(-1)).toMatchObject({ title: 'nueva', user_id: 'A' });
    expect(() => db.from('api_tokens')).toThrow('no permitida');
    expect(db.rpc).toBeUndefined();
  });

  it('las herramientas del agente no ven ni tocan datos de otra cuenta', async () => {
    const st = store();
    const db = scopedClient(fakeDb(st, null, { admin: true }), 'A');
    const ctx = { db, today: '2026-10-14', tz: 'America/Mexico_City' };
    expect((await executeTool('buscar_notas', { texto: 'secreto' }, ctx)).total).toBe(0);
    expect((await executeTool('completar_tarea', { id: 'b1' }, ctx)).ok).toBe(false);
    expect((await executeTool('listar_tareas', {}, ctx)).tareas.map((t) => t.id)).toEqual(['a1']);
  });
});

describe('/api/shortcut', () => {
  const token = newToken();
  let st, calls, tokenRow;
  const admin = () => fakeDb(st, null, {
    admin: true,
    rpc: {
      use_api_token: ({ p_hash }) => {
        calls.push(p_hash);
        if (p_hash !== hashToken(token) || !tokenRow) return [];
        tokenRow.count++;
        const allowed = tokenRow.count <= PER_MINUTE;
        return [{ user_id: 'A', time_zone: 'America/Mexico_City', allowed, reason: allowed ? null : tokenRow.reason || 'minute' }];
      },
    },
  });
  const res = () => {
    const r = { statusCode: 0, headers: {} };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.send = (b) => { r.body = b; return r; };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
    return r;
  };
  const call = async (req, deps = {}) => {
    const r = res();
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token}` }, ...req }, r, { admin: admin(), ...deps });
    return r;
  };

  beforeEach(() => {
    st = { tasks: [], notes: [{ id: 'nb', user_id: 'B', content: 'de B' }], memories: [], chat_messages: [], push_subscriptions: [] };
    calls = [];
    tokenRow = { count: 0 };
  });

  it('rechaza método, token ausente, mal formado, desconocido o revocado', async () => {
    expect((await call({ method: 'GET' })).statusCode).toBe(405);
    expect((await call({ headers: {} })).statusCode).toBe(401);
    expect((await call({ headers: { authorization: 'Bearer nexo_xx' } })).statusCode).toBe(401);
    expect(calls).toHaveLength(0); // ni siquiera consulta la base
    expect((await call({ headers: { authorization: `Bearer ${newToken()}` }, body: { texto: 'hola' } })).statusCode).toBe(401);
    tokenRow = null; // revocado
    const r = await call({ body: { texto: 'hola' } });
    expect(r.statusCode).toBe(401);
    expect(r.body).toMatch(/revocado/);
  });

  it('nunca envía el token en claro a la base, solo su hash', async () => {
    await call({ body: { texto: 'x', accion: 'nota' } });
    expect(calls).toEqual([hashToken(token)]);
  });

  it('límite de frecuencia → 429 con el motivo correcto', async () => {
    tokenRow.count = PER_MINUTE;
    const r1 = await call({ body: { texto: 'hola', accion: 'nota' } });
    expect(r1.statusCode).toBe(429);
    expect(r1.body).toMatch(/por minuto/);
    tokenRow = { count: PER_MINUTE, reason: 'account_day' };
    expect((await call({ body: { texto: 'hola' } })).body).toMatch(/límite diario de Siri/);
  });

  it('acepta "Acción" con acento como clave', async () => {
    const r = await call({ body: { Texto: 'Pilas', Acción: 'nota' } });
    expect(r.body).toBe('Listo, guardé la nota.');
    expect(st.notes.at(-1).content).toBe('Pilas');
  });

  it('si Claude falla después del límite, deja el motivo en el chat', async () => {
    const client = { messages: { create: async () => { await new Promise((r) => setTimeout(r, 40)); throw Object.assign(new Error('overloaded'), { status: 529 }); } } };
    client.beta = { messages: client.messages };
    const pending = [];
    const r = await call({ body: { texto: 'Organiza mi semana' } }, { client, deadlineMs: 10, waitUntil: (p) => pending.push(p) });
    expect(r.body).toMatch(/chat de NEXO/);
    await pending[0];
    expect(st.chat_messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(st.chat_messages[1].content).toMatch(/No pude completar/);
  });

  it('respeta el tope total: no inicia llamadas sin tiempo y lo explica', async () => {
    let calls = 0;
    const client = { messages: { create: async () => { calls++; return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'buscar_notas', input: {} }] }; } } };
    client.beta = { messages: client.messages };
    const r = await call({ body: { texto: 'busca' } }, { client, totalMs: 1000, deadlineMs: 5000 });
    expect(calls).toBe(0); // quedaban <3 s desde el inicio → DeadlineError antes de la primera llamada
    expect(r.statusCode).toBe(504);
    expect(r.body).toMatch(/Tardé demasiado/);
  });

  it('accion nota: guarda lo dictado para el dueño del token (texto plano)', async () => {
    const r = await call({ body: { texto: 'Comprar pilas AA', accion: 'nota' } });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/plain/);
    expect(r.body).toBe('Listo, guardé la nota.');
    expect(st.notes.at(-1)).toMatchObject({ user_id: 'A', content: 'Comprar pilas AA' });
  });

  it('accion tarea con cuerpo de texto plano y respuesta JSON si se pide', async () => {
    const r = await call({ headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, body: '{"texto":"Llamar al dentista","accion":"tarea"}' });
    expect(r.body).toMatchObject({ respuesta: expect.stringContaining('Llamar al dentista'), accion: 'tarea' });
    expect(st.tasks[0]).toMatchObject({ user_id: 'A', title: 'Llamar al dentista' });
    const plain = await call({ body: 'Texto sin JSON', headers: { authorization: `Bearer ${token}` } });
    // texto plano como cuerpo → se acepta como 'texto' y va al chat (aquí sin API key de Claude)
    expect(plain.statusCode).toBe(500);
    expect(plain.body).toMatch(/API key de Claude/);
  });

  it('sin texto → 400 con mensaje distinto si falta el campo', async () => {
    const empty = await call({ body: { texto: '   ' } });
    expect(empty.statusCode).toBe(400);
    expect(empty.body).toMatch(/No escuché/);
    const missing = await call({ body: { Txto: 'hola' } });
    expect(missing.statusCode).toBe(400);
    expect(missing.body).toMatch(/campo "texto"/);
  });

  it('acepta claves y acciones con mayúsculas/espacios; rechaza acciones desconocidas', async () => {
    const r = await call({ body: { ' Texto ': 'Pan', Accion: ' Nota ' } });
    expect(r.body).toBe('Listo, guardé la nota.');
    const bad = await call({ body: { texto: 'x', accion: 'borrar todo' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).toMatch(/Acción desconocida/);
  });

  it('chat por Siri: usa Claude con el canal de voz, guarda el chat del usuario y responde apto para voz', async () => {
    const seen = [];
    const client = {
      messages: { create: async (p) => { seen.push(p); return { stop_reason: 'end_turn', content: [{ type: 'text', text: '**Tienes 2 pendientes:** ver https://x.y' }] }; } },
    };
    client.beta = { messages: client.messages };
    const r = await call({ body: { texto: '¿Qué tengo hoy?' } }, { client });
    expect(r.statusCode).toBe(200);
    expect(r.body).toBe('Tienes 2 pendientes: ver');
    expect(seen[0].system).toMatch(/Siri/);
    expect(seen[0].max_tokens).toBeLessThanOrEqual(2048);
    expect(st.chat_messages.map((m) => [m.user_id, m.role])).toEqual([['A', 'user'], ['A', 'assistant']]);
  });

  it('si Claude tarda más que el límite de Atajos, responde ya y termina en segundo plano', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const client = { messages: { create: async () => { await gate; return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Respuesta tardía' }] }; } } };
    client.beta = { messages: client.messages };
    const pending = [];
    const r = await call({ body: { texto: 'Planea mi semana' } }, { client, deadlineMs: 20, waitUntil: (p) => pending.push(p) });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatch(/chat de NEXO/);
    expect(pending).toHaveLength(1);
    release();
    await pending[0];
    expect(st.chat_messages.map((m) => m.content)).toEqual(['Planea mi semana', 'Respuesta tardía']);
  });

  it('acepta el cuerpo como Buffer (sin Content-Type)', async () => {
    const r = await call({ body: Buffer.from(JSON.stringify({ texto: 'Leche', accion: 'tarea' })) });
    expect(r.statusCode).toBe(200);
    expect(st.tasks[0].title).toBe('Leche');
  });

  it('toSpeech limpia markdown, viñetas y URLs', () => {
    expect(toSpeech('# Hola\n- uno\n- **dos** https://a.b/c `x`')).toBe('Hola uno dos x');
  });
});
