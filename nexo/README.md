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
| Avisos push (iPhone/iPad instalada, Mac, Android, PC) | ✅ código y pruebas — falta tu despliegue (paso 5) |
| Siri/Atajos, Calendario, Gmail, voz, avisos recurrentes | ⏳ pendiente |

## Arquitectura

```
iPhone/iPad/iMac (PWA, React) ──► Supabase (Auth + Postgres + RLS + Realtime)
          │
          ├─► /api/chat (Vercel) ──► Claude API (tool use) ──► Supabase con el JWT del usuario
          └─◄ notificación ◄── Apple/Google Push ◄── /api/cron/reminders ◄── pg_cron (cada minuto)
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

## 4. Avisos push (recordatorios reales)
Una fecha límite **no** avisa: el aviso es el campo *Aviso* (formulario) o “recuérdame…” en el chat.

1. En tu Mac: `npm run secrets` → imprime `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. Cambia el correo del `VAPID_SUBJECT` por el tuyo.
2. Vercel → Environment Variables: esas 4 + `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API; **solo servidor**). Redeploy.
3. Supabase → SQL Editor: vuelve a ejecutar `supabase/schema.sql` (es idempotente; agrega tablas de avisos).
4. Supabase → SQL Editor: sigue `supabase/cron.sql` (activa `pg_cron`/`pg_net`, guarda URL y `CRON_SECRET` en Vault, programa el job cada minuto).
   - Vercel Hobby solo permite cron diario; por eso el reloj vive en Supabase (gratis).
5. En cada dispositivo: abre NEXO **instalado** → Pendientes → **Activar avisos** → **Probar**.
   - iPhone/iPad: iOS/iPadOS 16.4+ y abrir desde el icono de pantalla de inicio (en Safari normal no hay push).
   - Mac: Safari 16+ (o la app del Dock), Chrome o Edge.
6. Verifica: crea “Prueba” con *Aviso en otra hora…* a 2 min → debe llegar con NEXO cerrado.
   Si no llega: `select status_code, content from net._http_response order by created desc limit 5;` en Supabase.

Detalles:
- Precisión: ±1 min. Si el servicio de push falla (5xx), reintenta cada minuto hasta 5 veces.
- Cerrar sesión desliga el dispositivo; otra cuenta en el mismo equipo se queda con los avisos de ese equipo.
- Máx. 10 dispositivos por cuenta; los caducados (iOS borró la app, permisos revocados) se limpian solos.

## 5. Instalar
- **iPhone/iPad:** Safari → Compartir → *Añadir a pantalla de inicio*.
- **iMac:** Safari → Archivo → *Añadir al Dock*.

## Desarrollo
```bash
cp .env.example .env.local   # llena tus claves
npm install
npx vercel dev               # UI + /api/chat (npm run dev solo sirve la UI)
npm test                     # 52 tests (vitest): herramientas, agente, endpoints, zona horaria/DST, push
npm run test:sql             # RLS, avisos y suscripciones contra Postgres local (si tienes PostgreSQL)
npm run build
# Prueba de humo en Chromium (service worker → notificación) — requiere Playwright:
VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=x VITE_VAPID_PUBLIC_KEY=<clave> npm run build
node scripts/sw-push-smoke.mjs
```

## Pruebas manuales tras desplegar
1. Chat: “Crea una tarea comprar cuadernos para mañana” → aparece en Pendientes.
2. “Gasté 200 pesos en gasolina” → aparece en Finanzas.
3. “Recuerda que prefiero respuestas breves” → aparece en Memoria.
4. Crea algo en iMac → aparece en iPhone sin recargar.
5. Segunda cuenta → no ve los datos de la primera.
6. “Recuérdame tomar agua en 5 minutos” → llega la notificación con la app cerrada.

## Costos
- Supabase Free y Vercel Hobby: $0 para uso personal (límites de cada plan). El cron hace ~43,200 llamadas/mes a Vercel (Hobby incluye 1M).
- Push (Apple/Google): gratis.
- Claude API: por token. Sonnet 5.5 = $2/M entrada, $10/M salida; un mensaje típico cuesta centavos de dólar. Los créditos API de Max (si tu plan los incluye) se consumen primero. **Max no cubre la API automáticamente**: revisa tu Console.

## Privacidad
Tus datos viven en tu proyecto Supabase. Al chatear, se envían a Claude el historial reciente (20 mensajes), tus preferencias y los resultados de las herramientas. No guardes contraseñas ni datos bancarios. Backups: Supabase → Database → Backups (diarios en planes de pago; en Free exporta con `pg_dump`).

## Siguiente fase
1. Atajo de iOS/Siri que llame `/api/chat`.
2. Calendario y Gmail con permisos explícitos; confirmación antes de enviar/borrar.
3. Avisos recurrentes (diario/semanal) y “posponer 10 min” desde la notificación.
