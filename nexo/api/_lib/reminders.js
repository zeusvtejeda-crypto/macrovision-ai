import { sendToSubscriptions, reminderPayload } from './push.js';

export const MAX_ATTEMPTS = 5;

// Toma los avisos vencidos (de todos los usuarios) y los envía por Web Push.
// `db` es un cliente Supabase con service_role (solo servidor).
export async function processDueReminders({ db, vapid, sender, agent, allowEndpoint, maxRows = 100 }) {
  const summary = { claimed: 0, delivered: 0, noDevices: 0, rejected: 0, retried: 0, abandoned: 0, removedSubscriptions: 0 };

  const { data: claimed, error } = await db.rpc('claim_due_reminders', { max_rows: maxRows });
  if (error) throw new Error(`claim_due_reminders: ${error.message}`);
  summary.claimed = claimed?.length || 0;
  if (!summary.claimed) return summary;

  const userIds = [...new Set(claimed.map((t) => t.user_id))];
  const { data: subs, error: subErr } = await db
    .from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth').in('user_id', userIds);
  if (subErr) {
    await release(db, claimed.map((t) => t.task_id));
    throw new Error(`push_subscriptions: ${subErr.message}`);
  }
  const byUser = new Map();
  for (const s of subs || []) byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]);

  const gone = new Set();
  const ok = new Set();
  const toRetry = [];

  await Promise.all(claimed.map(async (task) => {
    const userSubs = (byUser.get(task.user_id) || []).filter((s) => !gone.has(s.id));
    if (!userSubs.length) { summary.noDevices++; return; }
    const r = await sendToSubscriptions(userSubs, reminderPayload(task), { vapid, sender, agent, allowEndpoint });
    r.gone.forEach((id) => gone.add(id));
    r.delivered.forEach((id) => ok.add(id));
    if (r.delivered.length) summary.delivered++;
    else if (r.failed.length && task.attempts < MAX_ATTEMPTS) toRetry.push(task.task_id);
    else if (r.failed.length) summary.abandoned++;
    else if (r.invalid.length) summary.rejected++; // p. ej. VAPID mal configurado: reintentar no ayuda
    else summary.noDevices++;
  }));

  if (toRetry.length) {
    await release(db, toRetry);
    summary.retried = toRetry.length;
  }
  if (gone.size) {
    const { error: delErr } = await db.from('push_subscriptions').delete().in('id', [...gone]);
    if (!delErr) summary.removedSubscriptions = gone.size;
  }
  if (ok.size) {
    await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).in('id', [...ok]);
  }
  return summary;
}

// Re-arma el aviso para que el siguiente ciclo del cron lo intente de nuevo.
async function release(db, taskIds) {
  const { error } = await db.from('tasks').update({ reminded_at: null }).in('id', taskIds);
  if (error) console.error('no se pudo re-armar avisos', error.message);
}
