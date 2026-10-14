import { describe, it, expect } from 'vitest';
import { runAgent, buildSystem } from '../api/_lib/agent.js';
import { trimHistory } from '../api/chat.js';
import { localNow, safeTimeZone } from '../api/_lib/time.js';
import { fakeDb } from './fakeDb.js';

function scriptedClient(responses) {
  const calls = [];
  const create = async (p) => { calls.push(structuredClone(p)); return responses.shift(); };
  return { calls, messages: { create }, beta: { messages: { create } } };
}

describe('bucle del agente', () => {
  it('ejecuta la herramienta y devuelve la respuesta final', async () => {
    const store = {};
    const client = scriptedClient([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'registrar_movimiento', input: { tipo: 'gasto', monto: 450, categoria: 'gasolina' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Registré $450 en gasolina.' }] },
    ]);
    const r = await runAgent({ client, model: 'claude-sonnet-5-5', db: fakeDb(store), system: 's', history: [{ role: 'user', content: 'Gasté 450 en gasolina' }], today: '2026-10-14' });
    expect(r.text).toBe('Registré $450 en gasolina.');
    expect(r.actions).toEqual([{ tool: 'registrar_movimiento', ok: true }]);
    expect(store.transactions).toHaveLength(1);
    const second = client.calls[1];
    expect(second.fallbacks).toBe('default');
    expect(second.messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });

  it('devuelve errores de validación a Claude como is_error', async () => {
    const client = scriptedClient([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'registrar_movimiento', input: { tipo: 'gasto', monto: -1, categoria: 'x' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Monto inválido.' }] },
    ]);
    const r = await runAgent({ client, model: 'claude-haiku-5-5', db: fakeDb({}), system: 's', history: [{ role: 'user', content: 'x' }], today: '2026-10-14' });
    expect(r.actions[0].ok).toBe(false);
    expect(client.calls[1].messages.at(-1).content[0].is_error).toBe(true);
    expect(client.calls[0].fallbacks).toBeUndefined();
  });

  it('maneja rechazo', async () => {
    const client = scriptedClient([{ stop_reason: 'refusal', content: [] }]);
    const r = await runAgent({ client, model: 'claude-sonnet-5-5', db: fakeDb({}), system: 's', history: [{ role: 'user', content: 'x' }], today: '2026-10-14' });
    expect(r.text).toMatch(/No puedo/);
  });

  it('se detiene tras demasiadas iteraciones', async () => {
    const loop = () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'buscar_notas', input: {} }] });
    const client = scriptedClient(Array.from({ length: 20 }, loop));
    const r = await runAgent({ client, model: 'm', db: fakeDb({}), system: 's', history: [{ role: 'user', content: 'x' }], today: '2026-10-14' });
    expect(client.calls).toHaveLength(8);
    expect(r.text).toMatch(/demasiados pasos/);
  });
});

it('por Siri el agente da menos pasos', async () => {
  const loop = () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't', name: 'buscar_notas', input: {} }] });
  const client = scriptedClient(Array.from({ length: 20 }, loop));
  await runAgent({ client, model: 'm', db: fakeDb({}), system: 's', history: [{ role: 'user', content: 'x' }], today: '2026-10-14', channel: 'siri' });
  expect(client.calls).toHaveLength(4);
});

describe('historial, fecha y prompt', () => {
  it('trimHistory empieza en user y fusiona roles consecutivos', () => {
    expect(trimHistory([
      { role: 'assistant', content: 'a' }, { role: 'user', content: 'b' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'd' }, { role: 'user', content: '' },
    ])).toEqual([{ role: 'user', content: 'b\nc' }, { role: 'assistant', content: 'd' }]);
  });

  it('localNow usa la zona del usuario', () => {
    const now = new Date('2026-10-15T03:30:00Z'); // 21:30 del 14 en CDMX (UTC-6)
    expect(localNow('America/Mexico_City', now)).toMatchObject({ today: '2026-10-14', time: '21:30' });
    expect(localNow('Asia/Tokyo', now)).toMatchObject({ today: '2026-10-15', time: '12:30' });
  });

  it('safeTimeZone rechaza zonas inválidas', () => {
    expect(safeTimeZone('Nope/Zone')).toBe('America/Mexico_City');
    expect(safeTimeZone('Europe/Madrid')).toBe('Europe/Madrid');
  });

  it('buildSystem incluye fecha y memorias', () => {
    const s = buildSystem({ today: '2026-10-14', time: '09:00', weekday: 'martes', tz: 'America/Mexico_City', memories: [{ content: 'Entreno a las 5pm' }] });
    expect(s).toContain('martes 2026-10-14 09:00');
    expect(s).toContain('- Entreno a las 5pm');
  });
});
