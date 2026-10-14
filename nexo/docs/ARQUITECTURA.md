# Decisiones de arquitectura (ampliación 2026-10)

## 1. Se mantiene la PWA + Supabase; no se migra a app nativa
**Por qué (verificado en documentación de Apple, oct-2026):** CloudKit JS sí puede leer/escribir la base privada del usuario, pero exige Apple Developer Program de pago, un contenedor creado con Xcode **y una app nativa** que use CloudKit, inicio de sesión con Apple ID (token web que caduca a los 30 min/2 semanas) y el backend no puede leer la base privada por sí mismo ([CloudKit JS](https://developer.apple.com/documentation/cloudkitjs), [capacidades por programa](https://developer.apple.com/help/account/reference/supported-capabilities-ios)). No sustituye una base relacional con búsqueda, RLS y funciones. iCloud Drive no tiene API web. Una app nativa implicaría reescribir todo, compilar en Xcode y distribuir por TestFlight/App Store; desde este entorno no se puede compilar ni probar.

**Impacto:** cero migración de datos (se amplía el esquema actual), mantenimiento de una sola base de código, misma URL en los tres dispositivos. Limitación: no hay integración “nativa” con iCloud Drive/CloudKit; ver §4.

## 2. Qué es cada cosa (no son equivalentes)
| Capa | Qué es | Uso en NEXO |
|---|---|---|
| **Supabase (Postgres + Storage)** | Backend en la nube del usuario | Fuente de verdad de todos los registros y adjuntos |
| **IndexedDB (navegador)** | Almacenamiento local por dispositivo | Copia local para abrir rápido y trabajar sin conexión; cola de cambios pendientes |
| **iCloud Drive** | Archivos del usuario en Apple | Solo como origen/destino de archivos vía selector del sistema (adjuntar/exportar) |
| **CloudKit** | Base de datos de Apple para apps nativas | No se usa |
| **iCloud (Atajos, Calendario)** | Sincroniza atajos y suscripciones de calendario entre dispositivos | Atajo NEXO y suscripción al calendario ICS de NEXO llegan a todos los dispositivos |

## 3. Sincronización y uso sin conexión
- Cada tabla tiene `id` (UUID generado en el cliente, estable), `created_at`, `updated_at`, `deleted_at` (borrado lógico) y `version` (entero que sube en cada cambio).
- El cliente guarda una copia local (IndexedDB) y una **cola de cambios**. Cada cambio lleva la `version` base. El servidor (`sync_push`) acepta el cambio solo si la versión coincide; si no, devuelve la fila actual y el cliente muestra el **conflicto** para elegir (mantener la mía / la del servidor; para textos, combinar). No hay sobrescrituras silenciosas.
- `sync_pull(desde)` trae lo cambiado (incluidos borrados). Realtime sigue dando actualizaciones en vivo.
- Estados visibles: guardado localmente · pendiente de sincronizar · sincronizado · error (con reintento).
- Sincronización ≠ respaldo: exportación completa (JSON + adjuntos) e importación documentadas.

## 4. Integraciones con Apple (solo por interfaces soportadas)
- **Calendario:** NEXO publica un calendario ICS privado (por token) al que se suscribe Apple Calendar; aparece en iPhone/iPad/Mac. La lectura del calendario de Apple no es posible desde una web; se cubre con el atajo (acción de Atajos que envía los eventos del día a NEXO).
- **Recordatorios:** no hay API web; NEXO usa sus propios avisos push y puede crear recordatorios de Apple vía Atajos.
- **Compartir hacia la app:** Safari no soporta Web Share Target; se usa el atajo en la hoja de compartir (ya existe la vía `/api/shortcut`).
- **Voz:** dictado del teclado de iOS en cualquier campo y el atajo de Siri (dictado → texto). Notas de voz: se graba con `MediaRecorder` (audio/mp4 en Safari) y se guarda como adjunto. El reconocimiento de voz en vivo (Web Speech) **no está disponible en web apps de pantalla de inicio** ([WebKit 225298](https://bugs.webkit.org/show_bug.cgi?id=225298)) y la API de Claude **no acepta audio** ([modelos](https://platform.claude.com/docs/en/about-claude/models/overview)); transcribir automáticamente requeriría un servicio de voz a texto aparte (opcional, no incluido).
- **Compartir hacia NEXO:** Safari no soporta Web Share Target ([MDN](https://developer.mozilla.org/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)); se usa el atajo en la hoja de compartir → `/api/shortcut`. Los enlaces desde otras apps (correo, mensajes) abren Safari, no la app instalada.
- **Almacenamiento local:** IndexedDB con `navigator.storage.persist()`; en apps de pantalla de inicio Safari lo concede y no aplica el borrado por 7 días de inactividad ([WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)). Sin Background Sync: la sincronización ocurre al abrir la app, al volver la conexión y mientras está visible.
- **Mac (app del Dock):** el manifiesto `shortcuts` añade comandos al menú Archivo y al Dock (macOS Sonoma+); los atajos de teclado los define la app con `keydown`.
- **Adjuntos:** Supabase Storage (Free: 1 GB, 50 MB por archivo), bucket privado por carpeta de usuario. Claude analiza imágenes (JPEG/PNG/GIF/WebP, ≤10 MB) y PDF (≤32 MB, ≤600 páginas) desde el servidor.
- **Búsqueda:** texto completo en Postgres con configuración `spanish` + `unaccent` (sin acentos). Búsqueda semántica (embeddings) no incluida: Anthropic no ofrece embeddings; requeriría Voyage AI + pgvector (opcional).
- Lo que no sea posible se muestra como “no disponible en esta plataforma”, nunca simulado.

## 5. IA
- Claude solo recibe el contexto necesario (registros consultados por herramientas, preferencias confirmadas, historial reciente). Documentado en README → Privacidad.
- Toda acción del asistente queda en `action_log` con antes/después; las reversibles tienen **Deshacer**.
- Contenido de notas, documentos y transcripciones se pasa como datos, no como instrucciones (se envuelve y se le dice al modelo que no obedezca instrucciones dentro).

## 6. Valores por defecto
Español de México, MXN, `America/Mazatlan`; editables en Ajustes y guardados en `settings`.
