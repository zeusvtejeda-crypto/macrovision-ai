import { describe, it, expect } from 'vitest';
import { executeTool, summarize, ToolInputError } from '../api/_lib/tools.js';
import { fakeDb } from './fakeDb.js';

const today = '2026-10-14';

describe('herramientas del agente', () => {
  it('crea y lista tareas pendientes, y completa una', async () => {
    const store = {};
    const db = fakeDb(store);
    const r = await executeTool('crear_tarea', { titulo: 'Comprar cuadernos', fecha_limite: '2026-10-15', categoria: 'escuela' }, { db, today });
    expect(r.ok).toBe(true);
    expect(store.tasks[0]).toMatchObject({ title: 'Comprar cuadernos', due_at: '2026-10-15', category: 'escuela', user_id: 'u1' });

    const list = await executeTool('listar_tareas', { estado: 'pendientes', hasta: '2026-10-20' }, { db, today });
    expect(list.total).toBe(1);

    const done = await executeTool('completar_tarea', { id: r.tarea.id }, { db, today });
    expect(done.ok).toBe(true);
    expect((await executeTool('listar_tareas', {}, { db, today })).total).toBe(0);
  });

  it('categoría desconocida cae en "otro" y rechaza fechas inválidas', async () => {
    const db = fakeDb({});
    const r = await executeTool('crear_tarea', { titulo: 'x', categoria: 'gym' }, { db, today });
    expect(r.tarea.category).toBe('otro');
    await expect(executeTool('crear_tarea', { titulo: 'x', fecha_limite: 'mañana' }, { db, today })).rejects.toBeInstanceOf(ToolInputError);
    await expect(executeTool('crear_tarea', {}, { db, today })).rejects.toThrow('titulo');
  });

  it('no completa tareas de otro usuario (RLS)', async () => {
    const store = {};
    const a = await executeTool('crear_tarea', { titulo: 'privada' }, { db: fakeDb(store, 'A'), today });
    const r = await executeTool('completar_tarea', { id: a.tarea.id }, { db: fakeDb(store, 'B'), today });
    expect(r.ok).toBe(false);
    expect(store.tasks[0].done).toBe(false);
  });

  it('registra gasto con fecha de hoy por defecto y resume el mes', async () => {
    const store = {};
    const db = fakeDb(store);
    await executeTool('registrar_movimiento', { tipo: 'gasto', monto: 200, categoria: 'Gasolina' }, { db, today });
    await executeTool('registrar_movimiento', { tipo: 'ingreso', monto: '1500.555', categoria: 'trabajo', fecha: '2026-10-01' }, { db, today });
    expect(store.transactions[0]).toMatchObject({ kind: 'expense', amount: 200, category: 'gasolina', occurred_on: today });
    expect(store.transactions[1].amount).toBe(1500.56);
    const s = await executeTool('resumen_finanzas', {}, { db, today });
    expect(s).toMatchObject({ desde: '2026-10-01', hasta: today, gastos: 200, ingresos: 1500.56, balance: 1300.56 });
  });

  it('rechaza montos inválidos', async () => {
    const db = fakeDb({});
    for (const monto of [0, -5, 'abc', Infinity]) {
      await expect(executeTool('registrar_movimiento', { tipo: 'gasto', monto, categoria: 'x' }, { db, today })).rejects.toBeInstanceOf(ToolInputError);
    }
  });

  it('guarda y busca notas', async () => {
    const db = fakeDb({});
    await executeTool('guardar_nota', { titulo: 'Idea', contenido: 'App de rutinas de gimnasio' }, { db, today });
    await executeTool('guardar_nota', { contenido: 'Lista del súper' }, { db, today });
    expect((await executeTool('buscar_notas', { texto: 'gimnasio' }, { db, today })).total).toBe(1);
    expect((await executeTool('buscar_notas', {}, { db, today })).total).toBe(2);
  });

  it('guarda preferencias y rechaza herramientas desconocidas', async () => {
    const store = {};
    await executeTool('recordar_preferencia', { contenido: 'Prefiero respuestas breves' }, { db: fakeDb(store), today });
    expect(store.memories[0].content).toBe('Prefiero respuestas breves');
    await expect(executeTool('borrar_todo', {}, { db: fakeDb(store), today })).rejects.toThrow('desconocida');
  });

  it('summarize agrupa por categoría', () => {
    expect(summarize([{ kind: 'expense', amount: '10.10', category: 'a' }, { kind: 'expense', amount: 5, category: 'a' }]))
      .toMatchObject({ gastos: 15.1, por_categoria: { a: { gastos: 15.1, ingresos: 0 } } });
  });
});

describe('recordatorios en herramientas', () => {
  const now = new Date('2026-10-14T15:00:00Z'); // 09:00 en CDMX
  const ctx = (db) => ({ db, today, tz: 'America/Mexico_City', now });

  it('crear_tarea con recordatorio guarda el instante UTC correcto', async () => {
    const store = {};
    const r = await executeTool('crear_tarea', { titulo: 'Pagar luz', recordatorio: '2026-10-14T17:00' }, ctx(fakeDb(store)));
    expect(store.tasks[0].remind_at).toBe('2026-10-14T23:00:00.000Z');
    expect(r.tarea.aviso).toBe('2026-10-14T17:00');
    expect(r.tarea.aviso_enviado).toBe(false);
  });

  it('rechaza avisos en el pasado o inválidos', async () => {
    const db = fakeDb({});
    await expect(executeTool('crear_tarea', { titulo: 'x', recordatorio: '2026-10-14T08:00' }, ctx(db))).rejects.toThrow('ya pasó');
    await expect(executeTool('crear_tarea', { titulo: 'x', recordatorio: '2026-02-30T10:00' }, ctx(db))).rejects.toThrow('no es una fecha válida');
  });

  it('programar_recordatorio programa, cambia y cancela; respeta RLS', async () => {
    const store = {};
    const { tarea } = await executeTool('crear_tarea', { titulo: 'Gym' }, ctx(fakeDb(store, 'A')));
    const r = await executeTool('programar_recordatorio', { id: tarea.id, cuando: '2026-10-14T17:30' }, ctx(fakeDb(store, 'A')));
    expect(r.ok).toBe(true);
    expect(store.tasks[0].remind_at).toBe('2026-10-14T23:30:00.000Z');

    const other = await executeTool('programar_recordatorio', { id: tarea.id, cancelar: true }, ctx(fakeDb(store, 'B')));
    expect(other.ok).toBe(false);
    expect(store.tasks[0].remind_at).toBe('2026-10-14T23:30:00.000Z');

    await executeTool('programar_recordatorio', { id: tarea.id, cancelar: true }, ctx(fakeDb(store, 'A')));
    expect(store.tasks[0].remind_at).toBeNull();
    await expect(executeTool('programar_recordatorio', { id: tarea.id }, ctx(fakeDb(store, 'A')))).rejects.toThrow('cuando');
  });

  it('listar_tareas muestra el aviso en hora local', async () => {
    const store = {};
    await executeTool('crear_tarea', { titulo: 'Cita', recordatorio: '2026-10-20T08:15' }, ctx(fakeDb(store)));
    const l = await executeTool('listar_tareas', {}, ctx(fakeDb(store)));
    expect(l.tareas[0]).toMatchObject({ aviso: '2026-10-20T08:15', aviso_enviado: false });
    expect(l.tareas[0]).not.toHaveProperty('remind_at');
  });
});
