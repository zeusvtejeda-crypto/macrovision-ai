# Verificaciones (qué está probado y cómo)

Leyenda: ✅ probado con una prueba automática que se puede repetir · 🧪 probado en Chromium real (Playwright) · ⏳ pendiente · 📱 solo se puede comprobar en el dispositivo real (no afirmado).

| # | Verificación pedida | Estado | Dónde se prueba |
|---|---|---|---|
| 1 | Crear un registro y recuperarlo después de cerrar la aplicación | ✅ | `tests/sync.test.js` → "la cola sobrevive al cierre": se crea sin conexión, se cierra el store, se reabre y el registro sigue; luego se envía |
| 2 | Modificarlo y comprobar su sincronización en otro dispositivo | ✅ | `tests/sync.test.js` → "descarga cambios de otro dispositivo, incluidos borrados"; `supabase/tests/assertions.sql` → `sync_push`/`sync_pull` con versiones |
| 3 | Gestionar una edición en conflicto | ✅ | `tests/sync.test.js` → dos pruebas de conflicto (conservar la mía / la del servidor / combinar); SQL → "versión vieja → conflicto… no sobrescribe" |
| 4 | Trabajar sin conexión y sincronizar después | ✅ | `tests/sync.test.js` → "sin conexión al enviar… se reintenta al volver" |
| 5 | Convertir un acuerdo en tarea sin duplicarlo | ✅ (SQL) / ⏳ (UI) | SQL → "reprocesar una transcripción no duplica acuerdos" (índice único por huella del texto). UI: módulo de reuniones |
| 6 | Recuperar una fuente de la biblioteca desde el asistente | ⏳ | herramienta `buscar_biblioteca` del módulo biblioteca (test del módulo) |
| 7 | Evitar que una consulta de un cliente recupere datos de otro | ✅ | SQL → RLS en todas las tablas ("B no ve…"), `search_all` por usuario; `tests/shortcut.test.js` → scopedClient (Siri) no ve ni toca datos de otra cuenta. Dentro de la misma cuenta, cada expediente filtra por `client_id` (tests del módulo clientes) |
| 8 | Manejar permisos rechazados y errores del proveedor de IA | ✅ | `tests/client-push.test.js` → permiso de notificaciones denegado; `tests/claude-json.test.js` y `tests/agent.test.js` → rechazo, corte por `max_tokens`, tiempo agotado, API key inválida, límite de uso; `tests/shortcut.test.js` → errores de Claude explicados en voz y en el chat |
| 9 | Exportar y recuperar información | ✅ | `tests/sync.test.js` → "exportar e importar conservan ids y no pisan lo más nuevo" |
| 10 | Actualizar sin perder datos (migración del esquema) | ✅ | `npm run test:migration` aplica todas las versiones publicadas con datos y luego la actual, dos veces |
| 11 | Avisos push: cifrado, entrega, estados, horas de silencio, dispositivos | ✅ / 🧪 | `tests/push.test.js` (RFC 8291/8292 contra un servidor HTTPS local), SQL (claim justo, expiración, silencio), `scripts/sw-push-smoke.mjs` (push → notificación en Chromium) |
| 12 | Siri/Atajos: token, límites, aislamiento, acciones rápidas | ✅ | `tests/shortcut.test.js`, SQL (`use_api_token`) |
| 13 | UI en iPhone / iPad / Mac | 🧪 | `scripts/sw-push-smoke.mjs` captura las tres variantes y comprueba que no hay desbordes |
| 14 | Instalación, notificaciones y Siri en dispositivos Apple reales | 📱 | Requiere tu despliegue (README §4-6). Nada de esto se afirma como probado en dispositivo real |

Comandos: `npm test` · `npm run test:sql` · `npm run test:migration` · prueba de humo: ver README → Desarrollo.
