// Cron: GET/POST /api/cron/reminders con "Authorization: Bearer <CRON_SECRET>".
// Lo llama Supabase pg_cron cada minuto (ver supabase/cron.sql) o Vercel Cron (planes Pro).
import { adminClient, hasBearerSecret } from '../_lib/supabase.js';
import { vapidFromEnv, vapidProblem } from '../_lib/push.js';
import { processDueReminders } from '../_lib/reminders.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret) return res.status(500).json({ error: 'Falta CRON_SECRET.' });
  if (!hasBearerSecret(req, secret)) return res.status(401).json({ error: 'No autorizado.' });

  const db = adminClient();
  if (!db) return res.status(500).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY o VITE_SUPABASE_URL.' });
  const problem = vapidProblem();
  if (problem) return res.status(500).json({ error: problem });
  const vapid = vapidFromEnv();

  try {
    const summary = await processDueReminders({ db, vapid });
    return res.status(200).json(summary);
  } catch (err) {
    console.error('cron reminders', err.message);
    return res.status(500).json({ error: 'Error procesando avisos.' });
  }
}
