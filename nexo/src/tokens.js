// Token personal para Siri/Atajos: se genera aquí y solo se envía su SHA-256 al servidor.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `nexo_${b64}`;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const tokenPrefix = (token) => token.slice(0, 9); // "nexo_" + 4 caracteres, para reconocerlo

export async function createApiToken(supabase, name) {
  const token = newToken();
  const { error } = await supabase.from('api_tokens').insert({
    name: name.trim().slice(0, 60) || 'Atajo',
    token_hash: await sha256Hex(token),
    prefix: tokenPrefix(token),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) throw new Error(error.message);
  return token; // se muestra una sola vez
}
