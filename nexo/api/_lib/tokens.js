// Tokens personales para Siri/Atajos ("nexo_" + 32 bytes en base64url). Solo se guarda su SHA-256.
import { createHash } from 'node:crypto';

export const TOKEN_RE = /^nexo_[A-Za-z0-9_-]{43}$/;

export function bearerToken(req) {
  const t = (req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return TOKEN_RE.test(t) ? t : null;
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Tablas con user_id que el agente puede tocar.
const OWNED = new Set(['tasks', 'notes', 'transactions', 'memories', 'chat_messages', 'push_subscriptions']);

function withUser(rows, userId) {
  const one = (r) => ({ ...r, user_id: userId });
  return Array.isArray(rows) ? rows.map(one) : one(rows);
}
function withoutUser(patch) {
  const { user_id, ...rest } = patch || {}; // nunca se reasigna una fila a otra cuenta
  return rest;
}

// Cliente service_role ACOTADO a un usuario: cada lectura/edición/borrado filtra por user_id y cada
// inserción lo fija. Sustituye a la RLS cuando no hay JWT del usuario (Siri/Atajos).
// Solo expone from(); cualquier otra cosa (rpc, storage, auth) no está disponible.
export function scopedClient(admin, userId) {
  if (!userId) throw new Error('scopedClient sin usuario');
  return {
    from(table) {
      if (!OWNED.has(table)) throw new Error(`Tabla no permitida: ${table}`);
      const base = () => admin.from(table);
      return {
        select: (cols, opts) => base().select(cols, opts).eq('user_id', userId),
        insert: (rows, opts) => base().insert(withUser(rows, userId), opts),
        update: (patch, opts) => base().update(withoutUser(patch), opts).eq('user_id', userId),
        delete: (opts) => base().delete(opts).eq('user_id', userId),
      };
    },
  };
}
