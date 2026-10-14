import { describe, it, expect, beforeEach } from 'vitest';
import handler from '../api/chat.js';

function mockRes() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('/api/chat', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'anon';
    process.env.ANTHROPIC_API_KEY = 'test';
  });

  it('solo acepta POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('exige token', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: {}, body: { message: 'hola' } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('falla cerrado si falta configuración', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { message: 'hola' } }, res);
    expect(res.statusCode).toBe(500);
  });

  it('rechaza mensaje vacío', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { message: '   ' } }, res);
    expect(res.statusCode).toBe(400);
  });
});
