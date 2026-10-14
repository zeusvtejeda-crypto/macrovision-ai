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
   Después de crear **tu** cuenta en NEXO: Authentication → Sign In / Providers → desactiva **Allow new users to sign up** (es una app personal; evita que desconocidos creen cuentas).
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
3. Deploy. Copia el **dominio de producción** (Project → Domains, p. ej. `nexo-tuusuario.vercel.app`), no la URL de un deployment concreto (esas cambian y pueden pedir login).
4. Supabase → Authentication → URL Configuration: Site URL = ese dominio (y en Redirect URLs).

> **Actualizar una versión ya desplegada:** ejecuta primero `supabase/schema.sql` en el SQL Editor (es idempotente) y **después** haz push/deploy del código nuevo. Al revés, la app nueva pediría columnas que aún no existen.

## 4. Avisos push (recordatorios reales)
Una fecha límite **no** avisa: el aviso es el campo *Aviso* (formulario) o “recuérdame…” en el chat.

1. Genera las claves. Opción A (sin clonar nada; requiere Node.js 20+ → nodejs.org o `brew install node`):
   `npx -y web-push generate-vapid-keys` (pública y privada) y `openssl rand -base64 32` (para `CRON_SECRET`); `VAPID_SUBJECT=mailto:tu@correo.com`.
   Opción B (con el repo clonado: `git clone <tu repo>` → `cd <repo>/nexo`): `npm install` y luego `npm run secrets` → imprime `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`. Cambia el correo del `VAPID_SUBJECT` por el tuyo.
2. Vercel → Environment Variables: esas 4 + `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API; **solo servidor**). Redeploy.
3. Supabase → SQL Editor: vuelve a ejecutar `supabase/schema.sql` (es idempotente; agrega tablas de avisos). Hazlo **antes** del redeploy del paso 2 si NEXO ya estaba en producción.
4. Supabase → SQL Editor: sigue `supabase/cron.sql` (activa `pg_cron`/`pg_net`, guarda en Vault la URL `https://<dominio de producción>/api/cron/reminders` y el `CRON_SECRET`, programa el job cada minuto y una limpieza diaria del historial).
   - Vercel Hobby solo permite cron diario; por eso el reloj vive en Supabase (gratis).
5. En cada dispositivo: abre NEXO **instalado** → Pendientes → **Activar avisos** → **Probar**.
   - iPhone/iPad: iOS/iPadOS 16.4+ y abrir desde el icono de pantalla de inicio (en Safari normal no hay push).
   - Mac: Safari en macOS 13 Ventura o posterior; la app del Dock (Archivo → Añadir al Dock) requiere macOS 14 Sonoma o posterior. Chrome/Edge también sirven, pero **solo avisan mientras el navegador esté abierto** (aunque no tenga ventanas); si lo cierras con ⌘Q no llegan.
6. Verifica: crea “Prueba” con *Aviso en otra hora…* a 2 min → debe llegar con NEXO cerrado.
   Si no llega: `select status_code, content from net._http_response order by created desc limit 5;` en Supabase.

Detalles:
- Precisión: ±1 min. Si el servicio de push falla (5xx), reintenta cada minuto hasta 5 veces.
- Estado en cada tarea: 🔔 programado · ✅ enviado · ⚠️ no entregado (p. ej. ningún dispositivo tenía avisos activos) · ⌛ no enviado (>12 h de retraso, o la tarea se reabrió con la hora ya pasada) · ❔ desconocido (envío interrumpido, o enviado por una versión anterior) · 🔕 tarea completada. En los casos fallidos aparece **Reintentar** (o pídeselo al chat: “recuérdame … a las HH:MM”).
- Si un aviso sale con ≥10 min de retraso, la notificación lo indica.
- “Desactivar” o “Quitar” un dispositivo se respeta: NEXO no vuelve a suscribirlo solo al abrirse.
- Cerrar sesión (solo en ese dispositivo) desactiva sus avisos.
- Límites anti-abuso: máx. 10 dispositivos y 200 avisos pendientes por cuenta; el cron atiende por turnos (máx. 5 avisos por cuenta y minuto). La protección principal sigue siendo desactivar el registro de cuentas nuevas (paso 1.3).
- Si el endpoint del cron responde 500, el mensaje dice qué variable falta o está mal (`net._http_response.content`).
- Los dispositivos caducados (iOS borró la app, permisos revocados) dejan de recibir avisos; si solo fue una renovación de la suscripción, NEXO la re-registra al abrirse. Las caducadas solo se descartan si hace falta lugar entre los 10 dispositivos.

## 5. Instalar
- **iPhone/iPad:** Safari → Compartir → *Añadir a pantalla de inicio*.
- **iMac:** Safari → Archivo → *Añadir al Dock* (macOS 14 Sonoma o posterior; en Ventura, usa NEXO como pestaña de Safari).

## Desarrollo
```bash
cp .env.example .env.local   # llena tus claves
npm install
npx vercel dev               # UI + /api/chat (npm run dev solo sirve la UI)
npm test                     # 79 tests (vitest): herramientas, agente, endpoints, zona horaria/DST, push (servidor y cliente)
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
