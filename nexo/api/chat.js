// Vercel Serverless Function: POST /api/chat
// Requiere: Authorization: Bearer <access_token de Supabase>, body { message, timeZone }
import { userClient, parseBody } from './_lib/supabase.js';
import { converse, claudeError } from './_lib/converse.js';
import { safeTimeZone } from './_lib/time.js';

export { trimHistory } from './_lib/converse.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'Servidor sin configurar (variables de entorno).' });

  const body = parseBody(req);
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return res.status(400).json({ error: 'Mensaje vacío.' });
  const tz = safeTimeZone(body.timeZone);

  const auth = await userClient(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });

  try {
    const { text, actions } = await converse({ db: auth.db, message, tz });
    return res.status(200).json({ reply: text, actions });
  } catch (err) {
    console.error('chat error', err?.status || '', err?.message);
    const { status, error } = claudeError(err);
    return res.status(status).json({ error });
  }
}
