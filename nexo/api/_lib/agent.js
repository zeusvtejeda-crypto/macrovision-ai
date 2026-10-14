import Anthropic from '@anthropic-ai/sdk';
import { TOOLS, executeTool, ToolInputError } from './tools.js';

const MAX_ITERATIONS = 8;
// Por voz: menos pasos y respuestas cortas (Atajos corta pronto la conexión y se leerá en voz alta).
const SIRI_LIMITS = { iterations: 4, maxTokens: 1024 };
// Modelos que aceptan fallbacks: "default" (reintento en otro modelo si hay rechazo).
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);

export function buildSystem({ today, time, weekday, tz, memories, pushDevices = 0, channel = 'app' }) {
  const mem = memories.length ? memories.map((m) => `- ${m.content}`).join('\n') : '(sin preferencias guardadas)';
  return `Eres NEXO, el asistente personal privado del usuario (vida personal, escuela, trabajo, salud y finanzas). Responde en español de México, directo y breve.

Reglas:
- Cuando el usuario pida crear, consultar, completar o registrar algo, usa SIEMPRE las herramientas; nunca digas que guardaste algo sin haber llamado la herramienta con éxito.
- Si una herramienta devuelve error, dilo con claridad.
- Avisos: si piden "recuérdame"/"avísame", usa el campo recordatorio de crear_tarea (o programar_recordatorio para una tarea existente) con la hora local exacta del aviso. La fecha límite sola NO avisa.
- Los avisos llegan como notificación push a los dispositivos donde el usuario los activó. Dispositivos con avisos activos: ${pushDevices}.${pushDevices ? '' : ' Como no hay ninguno, al programar un aviso dile que lo active en Pendientes → "Activar avisos" (en iPhone/iPad primero debe instalar NEXO en la pantalla de inicio).'}
- Montos en MXN. No inventes datos que no estén en las herramientas.
- Guarda con recordar_preferencia solo datos duraderos que el usuario quiera que recuerdes.

Ahora: ${weekday} ${today} ${time} (zona ${tz}).

Preferencias guardadas del usuario:
${mem}${channel === 'siri' ? `

Canal: Siri / Atajos de Apple. Tu respuesta se leerá en voz alta: 1 o 2 frases cortas, sin listas, sin markdown, sin emojis y sin URLs. Si hay varios pendientes, menciona como máximo 3 y di cuántos más hay.` : ''}`;
}

// history: [{role:'user'|'assistant', content:string}], último = mensaje nuevo del usuario.
export async function runAgent({ client, model, db, system, history, today, tz = 'America/Mexico_City', channel = 'app' }) {
  const maxIterations = channel === 'siri' ? SIRI_LIMITS.iterations : MAX_ITERATIONS;
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  const actions = [];
  const useFallback = FALLBACK_MODELS.has(model);

  for (let i = 0; i < maxIterations; i++) {
    const params = {
      model,
      max_tokens: channel === 'siri' ? SIRI_LIMITS.maxTokens : 4096,
      system,
      tools: TOOLS,
      tool_choice: { type: 'auto' },
      output_config: { effort: 'low' },
      messages,
    };
    const response = useFallback
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'refusal') {
      return { text: 'No puedo ayudar con esa solicitud.', actions };
    }
    if (response.stop_reason !== 'tool_use') {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text: text || 'Listo.', actions };
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    const results = await Promise.all(
      toolUses.map(async (b) => {
        try {
          const out = await executeTool(b.name, b.input, { db, today, tz });
          actions.push({ tool: b.name, ok: out?.ok !== false });
          return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(out) };
        } catch (err) {
          actions.push({ tool: b.name, ok: false });
          const msg = err instanceof ToolInputError ? err.message : `Error de base de datos: ${err.message}`;
          return { type: 'tool_result', tool_use_id: b.id, content: msg, is_error: true };
        }
      })
    );
    messages.push({ role: 'user', content: results });
  }
  return { text: 'Me detuve porque la tarea requería demasiados pasos. Intenta dividirla.', actions };
}

export function makeClient() {
  return new Anthropic();
}

export { Anthropic };
