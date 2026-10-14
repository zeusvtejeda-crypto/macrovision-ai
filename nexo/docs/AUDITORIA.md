# Auditoría de NEXO antes de la ampliación (2026-10-14)

Respaldo del estado auditado: tag `nexo-v1-pre-ampliacion` (commit `2c57352`).

## Qué es
- **Tipo:** aplicación web instalable (PWA) en React + Vite. Una sola base de código para iPhone, iPad y Mac.
- **Plataformas reales:** iPhone/iPad (Safari, instalada en pantalla de inicio), Mac (Safari, app del Dock), y cualquier navegador moderno.
  No hay app nativa; nada se distribuye por App Store.
- **Datos:** Supabase (Postgres) en la nube, un proyecto propio del usuario. No hay copia local más allá del caché de la UI.
- **Autenticación:** Supabase Auth (correo + contraseña). Sesión persistida en el navegador.
- **Sincronización:** inmediata a través de Supabase (cada pantalla consulta la base y se actualiza por Realtime). Sin internet, la app no funciona.
- **IA:** Claude (API de Anthropic) desde funciones serverless en Vercel (`/api/chat`, `/api/shortcut`). La clave nunca llega al navegador.
  La suscripción Claude Max **no** incluye esta API; se paga por uso.
- **Servicios externos:** Supabase (Free), Vercel (Hobby), Claude API, servicios push de Apple/Google (gratis). Permisos del dispositivo: solo notificaciones.

## Hecho y probado (de principio a fin con tests; no en dispositivos reales)
| Módulo | Estado |
|---|---|
| Login / registro | ✅ |
| Chat con Claude que ejecuta 9 herramientas (tareas, notas, finanzas, memoria, avisos) | ✅ |
| Pendientes (título, fecha límite, categoría, aviso) | ✅ básico |
| Notas (título, texto, etiquetas, búsqueda) | ✅ básico |
| Finanzas (gasto/ingreso, categoría, mes) | ✅ básico |
| Memoria (texto libre) | ✅ básico |
| Avisos push con cron cada minuto, estados reales de entrega, dispositivos | ✅ |
| Siri y Atajos con token personal | ✅ |
| RLS por usuario, tests SQL (Postgres 16), 95 tests JS, humo en Chromium | ✅ |

## Incompleto o ausente respecto al objetivo
- Sin áreas, proyectos, objetivos, subtareas, prioridad, estado, fecha planificada, repetición ni dependencias en tareas.
- Sin bandeja de entrada ni captura de archivos, fotos, voz o enlaces (no hay Storage).
- Sin agenda/calendario, reuniones, acuerdos, clientes, marcas, contenido, biblioteca, estudios, contactos, hábitos ni revisiones.
- Finanzas sin cuentas, estados (pagado/pendiente/previsto), transferencias, recurrentes, presupuestos ni separación personal/negocio.
- Memoria sin tipo, origen ni fecha.
- Sin historial de acciones del asistente ni deshacer.
- Sin uso sin conexión, sin cola de cambios, sin detección de conflictos, sin exportación/importación.
- Sin enlaces internos a registros (una sola página con pestañas).
- Toda la UI vive en un archivo (`src/App.jsx`, ~650 líneas): hay que modularizar antes de crecer.
- Zona horaria: se toma del dispositivo (no editable); moneda fija MXN.

## Qué se conserva
Diseño y estilos, flujo de login, el agente y sus herramientas (se amplían), avisos push, Siri/Atajos, el esquema actual (se migra sin perder datos), todos los tests.
