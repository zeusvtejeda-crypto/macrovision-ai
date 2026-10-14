// Adjuntos en Supabase Storage (bucket privado 'attachments', carpeta <user_id>/).
// El registro en la tabla `attachments` viaja por la sincronización; el archivo se sube directo.
import { supabase } from '../supabase.js';

export const MAX_FILE_BYTES = 50 * 1024 * 1024; // límite del plan Free de Supabase

export function kindOf(mime = '') {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (/pdf|text|word|sheet|presentation|document/.test(mime)) return 'document';
  return 'other';
}

const safeName = (name) => (name || 'archivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);

// Sube el archivo y crea su registro. Devuelve la fila de `attachments`.
export async function uploadAttachment(store, userId, file, { owner_table = null, owner_id = null } = {}) {
  if (!file) throw new Error('No hay archivo.');
  if (file.size > MAX_FILE_BYTES) throw new Error('El archivo supera 50 MB (límite del plan gratuito).');
  const id = store.uuid();
  const path = `${userId}/${id}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message === 'Failed to fetch' ? 'Sin conexión: los archivos se suben con internet.' : error.message);
  return store.save('attachments', { id, owner_table, owner_id, bucket: 'attachments', path, name: file.name || 'archivo', mime: file.type || null, size: file.size, kind: kindOf(file.type) });
}

// URL firmada temporal (1 h) para ver/descargar.
export async function attachmentUrl(att, { download = false } = {}) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(att.path, 3600, download ? { download: att.name } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function deleteAttachment(store, att) {
  await supabase.storage.from('attachments').remove([att.path]).catch(() => {});
  await store.remove('attachments', att.id);
}
