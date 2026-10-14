// Registro de herramientas del asistente: las de v1 (api/_lib/tools.js) + un archivo por módulo.
// Cada módulo exporta { tools: [...definiciones], execute: { nombre: fn(input, ctx) } }.
import { TOOLS as V1_TOOLS, executeTool as executeV1 } from '../tools.js';
import { ToolInputError } from './common.js';

const MODULES = ['areas', 'inbox', 'tasks', 'agenda', 'meetings', 'clients', 'contacts', 'content', 'library', 'study', 'finance', 'habits', 'review', 'memory', 'history'];

let registry = null;
async function load() {
  if (registry) return registry;
  const tools = [...V1_TOOLS];
  const execute = {};
  for (const m of MODULES) {
    try {
      const mod = await import(`./${m}.js`);
      for (const t of mod.tools || []) {
        if (tools.some((x) => x.name === t.name)) continue; // v1 tiene prioridad en nombres repetidos
        tools.push(t);
        execute[t.name] = mod.execute?.[t.name];
      }
    } catch (err) {
      // Módulo aún no implementado (Node: ERR_MODULE_NOT_FOUND; vitest/vite: "Failed to load url")
      if (!(err?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module|Failed to load url|ERR_MODULE_NOT_FOUND|not found/i.test(String(err?.message)))) throw err;
    }
  }
  registry = { tools, execute };
  return registry;
}

export async function allTools() { return (await load()).tools; }

// ctx: { db, today, tz, now, userId, actor } — añade ctx.log para el historial de acciones.
export async function runTool(name, input, ctx) {
  const { execute } = await load();
  const log = async (entry) => {
    try {
      await ctx.db.from('action_log').insert({
        actor: ctx.actor || 'chat', tool: name, summary: entry.summary, target_table: entry.target_table || null, target_id: entry.target_id || null,
        op: entry.op || 'update', before: entry.before ?? null, after: entry.after ?? null, reversible: Boolean(entry.reversible),
        batch_id: ctx.batchId || null,
      });
    } catch (err) { console.warn('action_log', err?.message); }
  };
  const fullCtx = { ...ctx, log };
  if (execute[name]) return execute[name](input && typeof input === 'object' ? input : {}, fullCtx);
  return executeV1(name, input, fullCtx);
}

export { ToolInputError };
