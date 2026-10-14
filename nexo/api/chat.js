// Vercel Serverless Function: POST /api/chat
// Requiere: Authorization: Bearer <access_token de Supabase>, body { message, timeZone }
import { createClient } from '@supabase/supabase-js';
import { buildSystem, runAgent, makeClient, Anthropic } from './_lib/agent.js';
import { localNow, safeTimeZone } from './_lib/time.js';

const HISTORY_LIMIT = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon, ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = process.env;
  if (!url || !anon || !ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Servidor sin configurar (variables de entorno).' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Inicia sesión.' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return res.status(400).json({ error: 'Mensaje vacío.' });
  const tz = safeTimeZone(body.timeZone);

  // Cliente con el JWT del usuario: toda consulta pasa por RLS.
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await db.auth.getUser(token);
  if (authError || !userData?.user) return res.status(401).json({ error: 'Sesión inválida o expirada.' });

  try {
    const [{ data: memories = [] }, { data: past = [] }] = await Promise.all([
      db.from('memories').select('content').order('created_at', { ascending: true }).limit(50),
      db.from('chat_messages').select('role,content').order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
    ]);

    const { error: insErr } = await db.from('chat_messages').insert({ role: 'user', content: message });
    if (insErr) throw new Error(insErr.message);

    const history = trimHistory([...(past || []).reverse(), { role: 'user', content: message }]);
    const now = localNow(tz);
    const { text, actions } = await runAgent({
      client: makeClient(),
      model: ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      db,
      system: buildSystem({ ...now, tz, memories: memories || [] }),
      history,
      today: now.today,
    });

    await db.from('chat_messages').insert({ role: 'assistant', content: text });
    return res.status(200).json({ reply: text, actions });
  } catch (err) {
    console.error('chat error', err?.status || '', err?.message);
    if (err instanceof Anthropic.AuthenticationError) return res.status(502).json({ error: 'API key de Claude inválida.' });
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Límite de Claude alcanzado; intenta en un momento.' });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Error de Claude (${err.status}).` });
    return res.status(500).json({ error: 'Error interno.' });
  }
}

// La API exige que el primer mensaje sea del usuario y alterna roles.
export function trimHistory(list) {
  const out = [];
  for (const m of list) {
    if (!m?.content || (m.role !== 'user' && m.role !== 'assistant')) continue;
    if (!out.length && m.role !== 'user') continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1] = { ...m, content: `${out[out.length - 1].content}\n${m.content}` };
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

function safeJson(s) {
  try { return JSON.parse(s); } catch { return {}; }
}
