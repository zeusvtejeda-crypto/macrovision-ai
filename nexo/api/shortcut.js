// POST /api/shortcut — entrada para Siri y la app Atajos de Apple.
//   Authorization: Bearer nexo_…   (token personal creado en NEXO → Ajustes → Siri y Atajos)
//   Cuerpo JSON: { "texto": "...", "accion": "chat" | "nota" | "tarea" | "captura", "zona": "America/Mazatlan" }
//   (también acepta el texto plano como cuerpo)
// Responde texto plano listo para "Leer texto" / "Mostrar resultado"; JSON si Accept: application/json.
import { adminClient } from './_lib/supabase.js';
import { bearerToken, hashToken, scopedClient } from './_lib/tokens.js';
import { converse, claudeError } from './_lib/converse.js';
import { makeClient } from './_lib/agent.js';
import { executeTool, ToolInputError } from './_lib/tools.js';
import { localNow, safeTimeZone } from './_lib/time.js';
import { waitUntil } from '@vercel/functions';

export const PER_MINUTE = 20;
export const PER_DAY = 300;
export const PER_USER_DAY = 500; // suma de todos los tokens de la cuenta
// Atajos corta "Obtener contenido de URL" tras un tiempo no documentado (~25 s según usuarios):
// si Claude tarda más, se responde antes y la respuesta completa queda en el chat de NEXO.
export const SIRI_DEADLINE_MS = 20000;
export const LATE_REPLY = 'Me está tomando más tiempo de lo normal. Te dejo la respuesta en el chat de NEXO.';
// Tope total del trabajo en segundo plano, por debajo de maxDuration (60 s) para alcanzar a guardar en el chat.
export const SIRI_TOTAL_MS = 50000;
const LIMIT_MESSAGES = {
  minute: 'Demasiadas solicitudes por minuto. Espera un momento.',
  token_day: 'Este token llegó a su límite diario (300 solicitudes). Se reinicia a las 00:00 UTC (18:00 en el centro de México).',
  account_day: 'Tu cuenta llegó a su límite diario de Siri (500 solicitudes entre todos tus tokens). Se reinicia a las 00:00 UTC.',
};
const plain = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase(); // "Acción" → "accion"

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

  const { data: rows, error } = await admin.rpc('use_api_token', { p_hash: hashToken(token), p_per_minute: PER_MINUTE, p_per_day: PER_DAY, p_per_user_day: PER_USER_DAY });
  if (error) { console.error('use_api_token', error.message); return reply(500, 'No pude validar el token.'); }
  const tok = rows?.[0];
  if (!tok) return reply(401, 'Ese token no existe, venció o fue revocado. Crea uno nuevo en NEXO → Ajustes y pégalo en el atajo.');
  if (!tok.allowed) return reply(429, LIMIT_MESSAGES[tok.reason] || 'Demasiadas solicitudes. Intenta más tarde.');

  // Claves sin distinguir mayúsculas/espacios (se escriben a mano en Atajos).
  const body = Object.fromEntries(Object.entries(readBody(req)).map(([k, v]) => [plain(k), v]));
  const key = ['texto', 'text', 'mensaje', 'message'].find((k) => k in body);
  if (!key) return reply(400, 'El atajo no envió el campo "texto". Revisa el cuerpo JSON de Obtener contenido de URL.');
  const text = typeof body[key] === 'string' ? body[key].trim().slice(0, 2000) : '';
  if (!text) return reply(400, 'No escuché nada. Inténtalo de nuevo.');
  const accion = plain(body.accion ?? 'chat') || 'chat';
  if (!['chat', 'nota', 'tarea', 'captura'].includes(accion)) return reply(400, `Acción desconocida: "${accion}". Usa nota, tarea, captura o déjala vacía.`);
  const tz = safeTimeZone(body.zona || tok.time_zone);
  const db = scopedClient(admin, tok.user_id);

  try {
    if (accion === 'nota') {
      await executeTool('guardar_nota', { contenido: text }, { db, today: localNow(tz).today, tz });
      return reply(200, 'Listo, guardé la nota.', { accion });
    }
    if (accion === 'captura') { // a la bandeja de entrada, para clasificar después
      const isUrl = /^https?:\/\/\S+$/i.test(text);
      const { error } = await db.from('inbox_items').insert({ kind: isUrl ? 'link' : 'text', raw_text: isUrl ? null : text, url: isUrl ? text : null, source: 'siri' });
      if (error) throw new Error(error.message);
      return reply(200, 'Listo, lo guardé en tu bandeja de entrada.', { accion });
    }
    if (accion === 'tarea') {
      await executeTool('crear_tarea', { titulo: text }, { db, today: localNow(tz).today, tz });
      return reply(200, `Listo, agregué «${text.slice(0, 80)}» a tus pendientes.`, { accion });
    }
    if (!process.env.ANTHROPIC_API_KEY && !deps.client) return reply(500, 'Falta la API key de Claude en el servidor.');
    const started = Date.now();
    const client = deps.client || makeClient({ maxRetries: 1, timeout: SIRI_TOTAL_MS });
    const work = converse({ db, message: text, tz, channel: 'siri', client, deadlineAt: started + (deps.totalMs ?? SIRI_TOTAL_MS) })
      .then((r) => ({ r }), (e) => ({ e }));
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ late: true }), deps.deadlineMs ?? SIRI_DEADLINE_MS); });
    const out = await Promise.race([work, late]);
    clearTimeout(timer);
    if (out.late) {
      // La función sigue viva hasta terminar y guardar la respuesta en el chat.
      (deps.waitUntil || waitUntil)(work.then(async (o) => {
        if (!o.e) return;
        console.error('shortcut tardío', o.e?.status || '', o.e?.message);
        // Lo prometido: que en el chat quede al menos el motivo.
        await db.from('chat_messages').insert({ role: 'assistant', content: `No pude completar tu solicitud de Siri: ${claudeError(o.e).error}` });
      }));
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
