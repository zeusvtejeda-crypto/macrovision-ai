import { describe, it, expect } from 'vitest';
import { askJson, attachmentBlock, textDoc, ClaudeJsonError } from '../api/_lib/claude.js';

const schema = { type: 'object', properties: { resumen: { type: 'string' } }, required: ['resumen'], additionalProperties: false };
const client = (reply) => { const c = { messages: { create: async (params, opts) => { c.last = { params, opts }; return reply; } } }; return c; };

describe('askJson', () => {
  it('pide formato JSON con esquema y devuelve el objeto', async () => {
    const c = client({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"resumen":"ok"}' }] });
    const out = await askJson({ prompt: 'Resume', schema, client: c, blocks: [textDoc('hola')] });
    expect(out).toEqual({ resumen: 'ok' });
    expect(c.last.params.output_config).toMatchObject({ format: { type: 'json_schema', schema }, effort: 'low' });
    expect(c.last.params.messages[0].content.at(-1)).toEqual({ type: 'text', text: 'Resume' });
    expect(c.last.params.system).toMatch(/DATOS del usuario/);
    expect(c.last.opts.timeout).toBe(45000);
  });
  it('errores claros: rechazo, corte y JSON inválido', async () => {
    await expect(askJson({ prompt: 'x', schema, client: client({ stop_reason: 'refusal', content: [] }) })).rejects.toBeInstanceOf(ClaudeJsonError);
    await expect(askJson({ prompt: 'x', schema, client: client({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{' }] }) })).rejects.toThrow(/incompleta/);
    await expect(askJson({ prompt: 'x', schema, client: client({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'no json' }] }) })).rejects.toThrow(/formato inesperado/);
  });
  it('attachmentBlock: imagen/PDF/texto sí; audio no, con motivo', async () => {
    const admin = { storage: { from: () => ({ download: async () => ({ data: new Blob([Buffer.from('%PDF-1.4')]), error: null }) }) } };
    expect((await attachmentBlock(admin, { path: 'u/a.pdf', mime: 'application/pdf', name: 'a.pdf' })).block).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } });
    expect((await attachmentBlock(admin, { path: 'u/a.png', mime: 'image/png' })).block).toMatchObject({ type: 'image' });
    expect((await attachmentBlock(admin, { path: 'u/a.txt', mime: 'text/plain' })).block).toMatchObject({ type: 'document', source: { type: 'text' } });
    const audio = await attachmentBlock(admin, { path: 'u/a.m4a', mime: 'audio/mp4' });
    expect(audio.block).toBeNull();
    expect(audio.reason).toMatch(/audio/);
  });
});
