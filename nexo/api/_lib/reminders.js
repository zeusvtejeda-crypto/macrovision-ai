import { sendToSubscriptions, reminderPayload } from './push.js';

export const MAX_ATTEMPTS = 5;

// Toma los avisos vencidos (de todos los usuarios) y los envía por Web Push.
// `db` es un cliente Supabase con service_role (solo servidor).
// Cada tarea reclamada termina con reminder_status: sent | no_devices | rejected | failed,
// o se re-arma (reminded_at = null) para reintentar en el siguiente minuto.
export async function processDueReminders({ db, vapid, sender, agent, allowEndpoint, maxRows = 100, now = new Date() }) {
  const summary = { claimed: 0, delivered: 0, noDevices: 0, rejected: 0, retried: 0, abandoned: 0, removedSubscriptions: 0 };

  const { data: claimed, error } = await db.rpc('claim_due_reminders', { max_rows: maxRows });
  if (error) throw new Error(`claim_due_reminders: ${error.message}`);
  summary.claimed = claimed?.length || 0;
  if (!summary.claimed) return summary;

  const userIds = [...new Set(claimed.map((t) => t.user_id))];
  const { data: subs, error: subErr } = await db
    .from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds).is('gone_at', null);
  if (subErr) {
    await release(db, claimed.map((t) => t.task_id));
    throw new Error(`push_subscriptions: ${subErr.message}`);
  }
  const byUser = new Map();
  for (const s of subs || []) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  const gone = new Set();
  const ok = new Set();
  const toRetry = [];
  const status = { sent: [], no_devices: [], rejected: [], failed: [] };

  await Promise.all(claimed.map(async (task) => {
    const userSubs = (byUser.get(task.user_id) || []).filter((s) => !gone.has(s.id));
    if (!userSubs.length) { summary.noDevices++; status.no_devices.push(task.task_id); return; }
    const r = await sendToSubscriptions(userSubs, reminderPayload(task, now), { vapid, sender, agent, allowEndpoint });
    r.gone.forEach((id) => gone.add(id));
    r.delivered.forEach((id) => ok.add(id));
    if (r.delivered.length) { summary.delivered++; status.sent.push(task.task_id); }
    else if (r.failed.length && task.attempts < MAX_ATTEMPTS) toRetry.push(task.task_id);
    else if (r.failed.length) { summary.abandoned++; status.failed.push(task.task_id); }
    else if (r.invalid.length) { summary.rejected++; status.rejected.push(task.task_id); } // p. ej. VAPID mal configurado
    else { summary.noDevices++; status.no_devices.push(task.task_id); } // todas las suscripciones caducaron
  }));

  if (toRetry.length) {
    await release(db, toRetry);
    summary.retried = toRetry.length;
  }
  await Promise.all(Object.entries(status).filter(([, ids]) => ids.length).map(async ([st, ids]) => {
    const { error: e } = await db.from('tasks').update({ reminder_status: st }).in('id', ids);
    if (e) console.error('no se pudo guardar reminder_status', st, e.message);
  }));
  if (gone.size) { // se marcan (no se borran): la app re-registra si fue una rotación
    const { error: goneErr } = await db.from('push_subscriptions').update({ gone_at: now.toISOString() }).in('id', [...gone]);
    if (!goneErr) summary.removedSubscriptions = gone.size;
  }
  if (ok.size) {
    await db.from('push_subscriptions').update({ last_success_at: now.toISOString() }).in('id', [...ok]);
  }
  return summary;
}

// Re-arma el aviso para que el siguiente ciclo del cron lo intente de nuevo.
async function release(db, taskIds) {
  const { error } = await db.from('tasks').update({ reminded_at: null }).in('id', taskIds);
  if (error) console.error('no se pudo re-armar avisos', error.message);
}
