// Vercel Serverless Function: POST /api/chat
// Requiere: Authorization: Bearer <access_token de Supabase>, body { message, timeZone }
import { userClient, parseBody } from './_lib/supabase.js';
import { buildSystem, runAgent, makeClient, Anthropic } from './_lib/agent.js';
import { localNow, safeTimeZone } from './_lib/time.js';

const HISTORY_LIMIT = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = process.env;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Servidor sin configurar (variables de entorno).' });

  const body = parseBody(req);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return res.status(400).json({ error: 'Mensaje vacío.' });
  const tz = safeTimeZone(body.timeZone);

  const auth = await userClient(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { db } = auth;

  try {
    const [{ data: memories = [] }, { data: past = [] }, { count: pushDevices }] = await Promise.all([
      db.from('memories').select('content').order('created_at', { ascending: true }).limit(50),
      db.from('chat_messages').select('role,content').order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
      db.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    ]);

    const { error: insErr } = await db.from('chat_messages').insert({ role: 'user', content: message });
    if (insErr) throw new Error(insErr.message);

    const history = trimHistory([...(past || []).reverse(), { role: 'user', content: message }]);
    const now = localNow(tz);
    const { text, actions } = await runAgent({
      client: makeClient(),
      model: ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      db,
      system: buildSystem({ ...now, tz, memories: memories || [], pushDevices: pushDevices || 0 }),
      history,
      today: now.today,
      tz,
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
