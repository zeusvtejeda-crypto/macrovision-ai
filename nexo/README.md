# NEXO — Asistente personal (iMac · iPhone · iPad)

PWA privada: chat con Claude que **guarda y consulta registros reales** (tareas, notas, finanzas MXN, memoria) en tu Supabase. Misma cuenta = mismos datos en todos tus dispositivos (sincronización en vivo con Supabase Realtime).

## Estado

| Función | Estado |
|---|---|
| Login email/contraseña (Supabase Auth) | ✅ |
| Tareas, notas, finanzas, memoria (UI + chat) | ✅ |
| Claude ejecuta 8 herramientas vía `/api/chat` | ✅ |
| RLS por usuario (probado en Postgres 16) | ✅ |
| Instalable (manifest, iconos, service worker) | ✅ |
| Notificaciones push / recordatorios reales | ⏳ pendiente — una fecha **no** envía aviso |
| Siri/Atajos, Calendario, Gmail, voz | ⏳ pendiente |

## Arquitectura

```
iPhone/iPad/iMac (PWA, React) ──► Supabase (Auth + Postgres + RLS + Realtime)
          │
          └─► /api/chat (Vercel) ──► Claude API (tool use) ──► Supabase con el JWT del usuario
```
- `ANTHROPIC_API_KEY` solo vive en el servidor. El servidor usa el **token del usuario** (no `service_role`), así que la RLS aplica también a lo que hace Claude.

## 1. Supabase
1. Crea proyecto en supabase.com.
2. SQL Editor → pega y ejecuta `supabase/schema.sql` (idempotente).
3. Authentication → Providers → Email activo, con verificación de correo.
4. Project Settings → API → copia **URL** y **anon/publishable key**. Nunca uses `service_role` aquí.

## 2. Claude API
1. Console de Claude → vincula Max y reclama créditos API si aplican → crea API key.
2. Ponle límite de gasto mensual en Console.
3. Modelo por defecto: `claude-sonnet-5-5` (cambia con `ANTHROPIC_MODEL`). Usa `effort: low` y fallback automático ante rechazos.

## 3. Vercel
1. Repo privado en GitHub → Vercel → Import → **Root Directory: `nexo`**.
2. Environment Variables:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (sin prefijo `VITE_`), `ANTHROPIC_MODEL=claude-sonnet-5-5`
3. Deploy. Copia la URL HTTPS.
4. Supabase → Authentication → URL Configuration: Site URL = URL de Vercel (y en Redirect URLs).

## 4. Instalar
- **iPhone/iPad:** Safari → Compartir → *Añadir a pantalla de inicio*.
- **iMac:** Safari → Archivo → *Añadir al Dock*.

## Desarrollo
```bash
cp .env.example .env.local   # llena tus claves
npm install
npx vercel dev               # UI + /api/chat (npm run dev solo sirve la UI)
npm test                     # 20 tests: herramientas, bucle del agente, auth del endpoint, zona horaria
npm run build
```

## Pruebas manuales tras desplegar
1. Chat: “Crea una tarea comprar cuadernos para mañana” → aparece en Pendientes.
2. “Gasté 200 pesos en gasolina” → aparece en Finanzas.
3. “Recuerda que prefiero respuestas breves” → aparece en Memoria.
4. Crea algo en iMac → aparece en iPhone sin recargar.
5. Segunda cuenta → no ve los datos de la primera.

## Costos
- Supabase Free y Vercel Hobby: $0 para uso personal (límites de cada plan).
- Claude API: por token. Sonnet 5.5 = $2/M entrada, $10/M salida; un mensaje típico cuesta centavos de dólar. Los créditos API de Max (si tu plan los incluye) se consumen primero. **Max no cubre la API automáticamente**: revisa tu Console.

## Privacidad
Tus datos viven en tu proyecto Supabase. Al chatear, se envían a Claude el historial reciente (20 mensajes), tus preferencias y los resultados de las herramientas. No guardes contraseñas ni datos bancarios. Backups: Supabase → Database → Backups (diarios en planes de pago; en Free exporta con `pg_dump`).

## Siguiente fase
1. Web Push (iOS 16.4+ con PWA instalada) + cron en Vercel para recordatorios.
2. Atajo de iOS/Siri que llame `/api/chat`.
3. Calendario y Gmail con permisos explícitos; confirmación antes de enviar/borrar.
