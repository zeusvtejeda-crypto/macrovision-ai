// POST /api/shortcut — entrada para Siri y la app Atajos de Apple.
//   Authorization: Bearer nexo_…   (token personal creado en NEXO → Ajustes → Siri y Atajos)
//   Cuerpo JSON: { "texto": "...", "accion": "chat" | "nota" | "tarea", "zona": "America/Mexico_City" }
//   (también acepta el texto plano como cuerpo)
// Responde texto plano listo para "Leer texto" / "Mostrar resultado"; JSON si Accept: application/json.
import { adminClient } from './_lib/supabase.js';
import { bearerToken, hashToken, scopedClient } from './_lib/tokens.js';
import { converse, claudeError } from './_lib/converse.js';
import { executeTool, ToolInputError } from './_lib/tools.js';
import { localNow, safeTimeZone } from './_lib/time.js';
import { waitUntil } from '@vercel/functions';

export const PER_MINUTE = 20;
export const PER_DAY = 300;
// Atajos corta "Obtener contenido de URL" tras un tiempo no documentado (~25 s según usuarios):
// si Claude tarda más, se responde antes y la respuesta completa queda en el chat de NEXO.
export const SIRI_DEADLINE_MS = 20000;
export const LATE_REPLY = 'Me está tomando más tiempo de lo normal. Te dejo la respuesta en el chat de NEXO.';

// Vercel da objeto (JSON/formulario), string (text/plain) o Buffer (sin Content-Type o binario).
function readBody(req) {
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { const j = JSON.parse(b); if (j && typeof j === 'object') return j; } catch {}
    return { texto: b };
  }
  return {};
}

// Para voz: sin markdown, sin URLs, sin espacios de más.
export function toSpeech(text) {
  return String(text || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

export default async function handler(req, res, deps = {}) {
  const json = /application\/json/i.test(req.headers?.accept || '');
  const reply = (status, text, extra = {}) => {
    if (json) return res.status(status).json({ respuesta: text, ...extra });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(status).send(text);
  };

  if (req.method !== 'POST') return reply(405, 'Usa POST.');
  const token = bearerToken(req);
  if (!token) return reply(401, 'Falta el token de NEXO o no es válido. Revisa el encabezado Authorization del atajo.');

  const admin = deps.admin || adminClient();
  if (!admin) return reply(500, 'El servidor de NEXO no está configurado.');

  const { data: rows, error } = await admin.rpc('use_api_token', { p_hash: hashToken(token), p_per_minute: PER_MINUTE, p_per_day: PER_DAY });
  if (error) { console.error('use_api_token', error.message); return reply(500, 'No pude validar el token.'); }
  const tok = rows?.[0];
  if (!tok) return reply(401, 'Ese token no existe o fue revocado. Crea uno nuevo en NEXO → Ajustes.');
  if (!tok.allowed) return reply(429, 'Demasiadas solicitudes con este token. Intenta en un momento.');

  const body = readBody(req);
  const raw = body.texto ?? body.text ?? body.mensaje ?? body.message;
  const text = typeof raw === 'string' ? raw.trim().slice(0, 2000) : '';
  if (!text) return reply(400, 'No escuché nada. Inténtalo de nuevo.');
  const accion = ['nota', 'tarea'].includes(body.accion) ? body.accion : 'chat';
  const tz = safeTimeZone(body.zona || tok.time_zone);
  const db = scopedClient(admin, tok.user_id);

  try {
    if (accion === 'nota') {
      await executeTool('guardar_nota', { contenido: text }, { db, today: localNow(tz).today, tz });
      return reply(200, 'Listo, guardé la nota.', { accion });
    }
    if (accion === 'tarea') {
      await executeTool('crear_tarea', { titulo: text }, { db, today: localNow(tz).today, tz });
      return reply(200, `Listo, agregué «${text.slice(0, 80)}» a tus pendientes.`, { accion });
    }
    if (!process.env.ANTHROPIC_API_KEY && !deps.client) return reply(500, 'Falta la API key de Claude en el servidor.');
    const work = converse({ db, message: text, tz, channel: 'siri', ...(deps.client ? { client: deps.client } : {}) })
      .then((r) => ({ r }), (e) => ({ e }));
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ late: true }), deps.deadlineMs ?? SIRI_DEADLINE_MS); });
    const out = await Promise.race([work, late]);
    clearTimeout(timer);
    if (out.late) {
      // La función sigue viva hasta terminar y guardar la respuesta en el chat.
      (deps.waitUntil || waitUntil)(work.then((o) => { if (o.e) console.error('shortcut tardío', o.e?.status || '', o.e?.message); }));
      return reply(200, LATE_REPLY, { accion, pendiente: true });
    }
    if (out.e) throw out.e;
    return reply(200, toSpeech(out.r.text) || 'Listo.', { accion, actions: out.r.actions });
  } catch (err) {
    if (err instanceof ToolInputError) return reply(400, err.message);
    console.error('shortcut error', err?.status || '', err?.message);
    const { status, error: msg } = claudeError(err);
    return reply(status, msg);
  }
}
