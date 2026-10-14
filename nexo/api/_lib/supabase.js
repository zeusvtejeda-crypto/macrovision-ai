import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const NO_SESSION = { persistSession: false, autoRefreshToken: false };

// Cliente con el JWT del usuario: toda consulta pasa por RLS.
// Devuelve { db, user } o { status, error }.
export async function userClient(req, env = process.env) {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: anon } = env;
  if (!url || !anon) return { status: 500, error: 'Servidor sin configurar (Supabase).' };
  const token = (req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { status: 401, error: 'Inicia sesión.' };
  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: NO_SESSION });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return { status: 401, error: 'Sesión inválida o expirada.' };
  return { db, user: data.user };
}

// Cliente service_role (salta RLS). SOLO para tareas de servidor como el cron.
export function adminClient(env = process.env) {
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: NO_SESSION });
}

// Compara "Bearer <secreto>" en tiempo constante.
export function hasBearerSecret(req, secret) {
  if (!secret) return false;
  const got = (req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const a = createHash('sha256').update(got).digest();
  const b = createHash('sha256').update(secret).digest();
  return got.length > 0 && timingSafeEqual(a, b);
}

export function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body); } catch { return {}; }
}
