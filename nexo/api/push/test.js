// POST /api/push/test — envía una notificación de prueba a los dispositivos del usuario.
import { userClient } from '../_lib/supabase.js';
import { sendToSubscriptions, vapidFromEnv, vapidProblem } from '../_lib/push.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const problem = vapidProblem();
  if (problem) return res.status(500).json({ error: `Servidor mal configurado: ${problem}` });
  const vapid = vapidFromEnv();
  const auth = await userClient(req);
  if (auth.error) return res.status(auth.status).json({ error: auth.error });
  const { db } = auth;

  const { data: subs, error } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').is('gone_at', null);
  if (error) return res.status(500).json({ error: 'No se pudieron leer tus dispositivos.' });
  if (!subs.length) return res.status(409).json({ error: 'No hay dispositivos con avisos activos.' });

  const r = await sendToSubscriptions(subs, {
    title: '✅ NEXO', body: 'Las notificaciones funcionan en este dispositivo.', tag: 'nexo-test', url: '/?tab=tasks',
  }, { vapid, ttl: 600 });
  if (r.gone.length) await db.rpc('mark_push_gone', { p_ids: r.gone });
  return res.status(200).json({ total: subs.length, delivered: r.delivered.length, removed: r.gone.length, failed: r.failed.length + r.invalid.length });
}
