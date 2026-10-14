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

export const PER_MINUTE = 20;
export const PER_DAY = 300;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { const j = JSON.parse(req.body); if (j && typeof j === 'object') return j; } catch {}
    return { texto: req.body };
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
    const { text: answer, actions } = await converse({ db, message: text, tz, channel: 'siri', ...(deps.client ? { client: deps.client } : {}) });
    return reply(200, toSpeech(answer) || 'Listo.', { accion, actions });
  } catch (err) {
    if (err instanceof ToolInputError) return reply(400, err.message);
    console.error('shortcut error', err?.status || '', err?.message);
    const { status, error: msg } = claudeError(err);
    return reply(status, msg);
  }
}
