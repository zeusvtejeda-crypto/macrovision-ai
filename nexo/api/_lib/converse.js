// Una vuelta de conversación con NEXO: lee memoria/historial, ejecuta el agente y guarda el chat.
// Lo usan /api/chat (JWT del usuario) y /api/shortcut (cliente acotado al usuario del token).
import { buildSystem, runAgent, makeClient, Anthropic, DeadlineError } from './agent.js';
import { localNow } from './time.js';

const HISTORY_LIMIT = 20;

export async function converse({ db, message, tz, channel = 'app', client = makeClient(), model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', deadlineAt = null }) {
  const [{ data: memories = [] }, { data: past = [] }, { count: pushDevices }] = await Promise.all([
    db.from('memories').select('content').order('created_at', { ascending: true }).limit(50),
    db.from('chat_messages').select('role,content').order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
    db.from('push_subscriptions').select('id', { count: 'exact', head: true }).is('gone_at', null),
  ]);

  const { error: insErr } = await db.from('chat_messages').insert({ role: 'user', content: message });
  if (insErr) throw new Error(insErr.message);

  const history = trimHistory([...(past || []).reverse(), { role: 'user', content: message }]);
  const now = localNow(tz);
  const { text, actions } = await runAgent({
    client,
    model,
    db,
    system: buildSystem({ ...now, tz, memories: memories || [], pushDevices: pushDevices || 0, channel }),
    history,
    today: now.today,
    tz,
    channel,
    deadlineAt,
  });

  await db.from('chat_messages').insert({ role: 'assistant', content: text });
  return { text, actions };
}

// Error de Claude → respuesta HTTP sin detalles internos.
export function claudeError(err) {
  if (err instanceof DeadlineError) return { status: 504, error: 'Tardé demasiado y me detuve. Intenta con una petición más corta.' };
  if (err instanceof Anthropic.AuthenticationError) return { status: 502, error: 'API key de Claude inválida.' };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, error: 'Límite de Claude alcanzado; intenta en un momento.' };
  if (err instanceof Anthropic.APIError) return { status: 502, error: `Error de Claude (${err.status}).` };
  return { status: 500, error: 'Error interno.' };
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
