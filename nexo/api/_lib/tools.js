// Herramientas que Claude puede ejecutar. `db` es un cliente Supabase autenticado
// con el token del usuario: la RLS garantiza que solo toca sus propios registros.

export const TOOLS = [
  {
    name: 'crear_tarea',
    description: 'Crea una tarea/pendiente. Usa fecha_limite en formato ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm) en la zona horaria del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        fecha_limite: { type: 'string', description: 'ISO 8601, opcional' },
        categoria: { type: 'string', enum: ['personal', 'escuela', 'trabajo', 'salud', 'finanzas', 'otro'] },
        notas: { type: 'string' },
      },
      required: ['titulo'],
    },
  },
  {
    name: 'listar_tareas',
    description: 'Lista tareas. Filtra por estado y rango de fecha límite (ISO).',
    input_schema: {
      type: 'object',
      properties: {
        estado: { type: 'string', enum: ['pendientes', 'completadas', 'todas'] },
        desde: { type: 'string' },
        hasta: { type: 'string' },
      },
    },
  },
  {
    name: 'completar_tarea',
    description: 'Marca una tarea como completada por su id (obtén el id con listar_tareas).',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'guardar_nota',
    description: 'Guarda una nota o idea.',
    input_schema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        contenido: { type: 'string' },
        etiquetas: { type: 'array', items: { type: 'string' } },
      },
      required: ['contenido'],
    },
  },
  {
    name: 'buscar_notas',
    description: 'Busca notas por texto en título o contenido. Sin texto devuelve las más recientes.',
    input_schema: { type: 'object', properties: { texto: { type: 'string' } } },
  },
  {
    name: 'registrar_movimiento',
    description: 'Registra un gasto o ingreso en MXN.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['gasto', 'ingreso'] },
        monto: { type: 'number', description: 'Positivo, en MXN' },
        categoria: { type: 'string' },
        descripcion: { type: 'string' },
        fecha: { type: 'string', description: 'YYYY-MM-DD; por defecto hoy' },
      },
      required: ['tipo', 'monto', 'categoria'],
    },
  },
  {
    name: 'resumen_finanzas',
    description: 'Totales de gastos/ingresos por categoría en un rango de fechas (YYYY-MM-DD).',
    input_schema: { type: 'object', properties: { desde: { type: 'string' }, hasta: { type: 'string' } } },
  },
  {
    name: 'recordar_preferencia',
    description: 'Guarda un dato o preferencia duradera del usuario (memoria de largo plazo).',
    input_schema: { type: 'object', properties: { contenido: { type: 'string' } }, required: ['contenido'] },
  },
];

const CATEGORIAS = new Set(['personal', 'escuela', 'trabajo', 'salud', 'finanzas', 'otro']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

class ToolInputError extends Error {}

function str(v, name, { required = false, max = 2000 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new ToolInputError(`Falta "${name}"`);
    return null;
  }
  if (typeof v !== 'string') throw new ToolInputError(`"${name}" debe ser texto`);
  const t = v.trim();
  if (required && !t) throw new ToolInputError(`Falta "${name}"`);
  return t.slice(0, max);
}

function date(v, name, re = ISO_DATE) {
  const s = str(v, name);
  if (s && !re.test(s)) throw new ToolInputError(`"${name}" debe ser ISO (${re === ISO_DATE ? 'YYYY-MM-DD' : 'YYYY-MM-DDTHH:mm'})`);
  return s;
}

async function run(q) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

// ctx: { db, today } — today = 'YYYY-MM-DD' en la zona del usuario
export async function executeTool(name, input, { db, today }) {
  input = input && typeof input === 'object' ? input : {};
  switch (name) {
    case 'crear_tarea': {
      const categoria = str(input.categoria, 'categoria') || 'personal';
      const row = {
        title: str(input.titulo, 'titulo', { required: true, max: 300 }),
        due_at: date(input.fecha_limite, 'fecha_limite', ISO_DATETIME),
        category: CATEGORIAS.has(categoria) ? categoria : 'otro',
        notes: str(input.notas, 'notas'),
      };
      const t = await run(db.from('tasks').insert(row).select().single());
      return { ok: true, tarea: t };
    }
    case 'listar_tareas': {
      const estado = input.estado || 'pendientes';
      let q = db.from('tasks').select('id,title,due_at,category,done,notes');
      if (estado === 'pendientes') q = q.eq('done', false);
      if (estado === 'completadas') q = q.eq('done', true);
      const desde = date(input.desde, 'desde', ISO_DATETIME);
      const hasta = date(input.hasta, 'hasta', ISO_DATETIME);
      if (desde) q = q.gte('due_at', desde);
      if (hasta) q = q.lte('due_at', hasta.length === 10 ? `${hasta}T23:59:59` : hasta);
      const rows = await run(q.order('due_at', { ascending: true, nullsFirst: false }).limit(50));
      return { total: rows.length, tareas: rows };
    }
    case 'completar_tarea': {
      const id = str(input.id, 'id', { required: true, max: 64 });
      const rows = await run(db.from('tasks').update({ done: true, done_at: new Date().toISOString() }).eq('id', id).select());
      if (!rows.length) return { ok: false, error: 'Tarea no encontrada' };
      return { ok: true, tarea: rows[0] };
    }
    case 'guardar_nota': {
      const tags = Array.isArray(input.etiquetas) ? input.etiquetas.filter((t) => typeof t === 'string').slice(0, 10) : [];
      const row = {
        title: str(input.titulo, 'titulo', { max: 300 }),
        content: str(input.contenido, 'contenido', { required: true, max: 20000 }),
        tags,
      };
      const n = await run(db.from('notes').insert(row).select().single());
      return { ok: true, nota: n };
    }
    case 'buscar_notas': {
      const texto = str(input.texto, 'texto', { max: 200 });
      let q = db.from('notes').select('id,title,content,tags,created_at');
      if (texto) {
        const safe = texto.replace(/[%,()*\\]/g, ' ');
        q = q.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
      }
      const rows = await run(q.order('created_at', { ascending: false }).limit(20));
      return { total: rows.length, notas: rows };
    }
    case 'registrar_movimiento': {
      const tipo = input.tipo;
      if (tipo !== 'gasto' && tipo !== 'ingreso') throw new ToolInputError('"tipo" debe ser gasto o ingreso');
      const monto = Number(input.monto);
      if (!Number.isFinite(monto) || monto <= 0 || monto > 1e9) throw new ToolInputError('"monto" debe ser un número positivo');
      const row = {
        kind: tipo === 'gasto' ? 'expense' : 'income',
        amount: Math.round(monto * 100) / 100,
        category: str(input.categoria, 'categoria', { required: true, max: 60 }).toLowerCase(),
        description: str(input.descripcion, 'descripcion', { max: 300 }),
        occurred_on: date(input.fecha, 'fecha') || today,
      };
      const m = await run(db.from('transactions').insert(row).select().single());
      return { ok: true, movimiento: m };
    }
    case 'resumen_finanzas': {
      const desde = date(input.desde, 'desde') || `${today.slice(0, 7)}-01`;
      const hasta = date(input.hasta, 'hasta') || today;
      const rows = await run(
        db.from('transactions').select('kind,amount,category').gte('occurred_on', desde).lte('occurred_on', hasta).limit(5000)
      );
      return { desde, hasta, ...summarize(rows) };
    }
    case 'recordar_preferencia': {
      const content = str(input.contenido, 'contenido', { required: true, max: 1000 });
      const m = await run(db.from('memories').insert({ content }).select().single());
      return { ok: true, memoria: m };
    }
    default:
      throw new ToolInputError(`Herramienta desconocida: ${name}`);
  }
}

export function summarize(rows) {
  const out = { gastos: 0, ingresos: 0, por_categoria: {} };
  for (const r of rows) {
    const amt = Number(r.amount);
    const key = r.kind === 'expense' ? 'gastos' : 'ingresos';
    out[key] += amt;
    out.por_categoria[r.category] ??= { gastos: 0, ingresos: 0 };
    out.por_categoria[r.category][key] += amt;
  }
  const round = (n) => Math.round(n * 100) / 100;
  out.gastos = round(out.gastos);
  out.ingresos = round(out.ingresos);
  out.balance = round(out.ingresos - out.gastos);
  return out;
}

export { ToolInputError };
