# Modelo de datos y contratos (v2)

Fuente de verdad: `supabase/schema.sql` (idempotente). Pruebas: `npm run test:sql`, `npm run test:migration`.

## Reglas comunes (todas las tablas de usuario)
- `id uuid` (lo genera el **cliente** con `crypto.randomUUID()` para poder crear sin conexión), `user_id` (default `auth.uid()`), `created_at`, `updated_at`, `deleted_at` (borrado lógico), `version` (sube en cada UPDATE por trigger).
- RLS `owner_all` + FORCE; permisos explícitos a `authenticated` y `service_role`; Realtime activo.
- **Nunca** se borra físicamente desde la app: se pone `deleted_at`. Las consultas filtran `deleted_at is null`.
- Columnas que solo escribe el servidor (se ignoran si el cliente las envía): `user_id, version, updated_at, search, reminded_at, remind_attempts, reminder_status, ics_token`.

## Tablas
| Tabla | Para qué | Campos clave |
|---|---|---|
| `settings` | Ajustes por cuenta | `time_zone` (America/Mazatlan), `currency` (MXN), `locale`, `prefs` jsonb (notificaciones), `ics_token` |
| `areas` | Vida personal, VILLEDA, Estudios, proyectos propios | `name, kind(personal|work|study|project|other), color, icon, sort, archived` |
| `projects` | Proyectos dentro de un área, opcionalmente de un cliente/objetivo | `area_id, client_id, goal_id, name, status(active|paused|done|archived), due_on` |
| `goals` | Objetivos con criterio explícito | `area_id, title, success_criteria, target_on, status` · avance = tareas/proyectos vinculados completados ÷ total (se muestra la fórmula) |
| `tasks` | **Sistema único de tareas** | `title, description, notes, area_id, project_id, goal_id, client_id, contact_id (seguimiento), meeting_id, subject_id, parent_id (subtarea), kind(task|followup|exam|deliverable), priority 1-4 (1 alta), status(pending|in_progress|blocked|review|done), done/done_at (coherentes por trigger), due_at (límite, hora local sin zona), planned_on (planificada), estimated_minutes, depends_on uuid[], recurrence {freq, interval, byweekday[1-7], until}, origin(manual|chat|siri|meeting|capture|recurrence|study|import), origin_id, tags, remind_at/reminded_at/reminder_status (avisos)` · completar una recurrente crea la siguiente (trigger, sin duplicar) |
| `inbox_items` | Bandeja de entrada | `kind(text|idea|task|voice|photo|document|link|expense|meeting_note), raw_text, url, attachment_id, suggestion {type, area_id, project_id, client_id, tags, confidence, reason}, extraction (editable), status(pending|organized|discarded), organized_table/organized_id, source` |
| `attachments` | Archivos en Storage (bucket privado `attachments`, carpeta `<user_id>/`) | `owner_table, owner_id, path, name, mime, size, kind` |
| `clients` | Clientes y marcas (VILLEDA) | `name, kind(client|brand|own), status, industry, website, socials, services[], notes, important_dates [{label,on}], brand_kit {colors[{name,hex}], fonts[{role,name}], audience, voice_tone, value_prop, references[], pillars[], restrictions, commercial_info, updated_at}, logo_attachment_ids[]` |
| `contacts` | Personas | `client_id, name, company, role, relation, email, phone, notes, tags, last_interaction_at, next_followup_on` · duplicados: `find_contact_duplicates(nombre, correo, tel)` |
| `events` | Agenda: eventos y bloques de trabajo | `title, kind(event|block), starts_at, ends_at, all_day, location, client_id, project_id, external_uid (importado por Atajos), source` |
| `meetings` | Reuniones | `title, client_id, project_id, event_id, contact_ids[], attendees[], starts_at, ends_at, objective, agenda[], questions[], notes, transcript, transcript_attachment_id, summary {summary, agreements[], decisions[], proposed_tasks[{title, owner, due_on}], open_questions[], followup_draft, next_step}, summary_at, status(planned|held|processed|cancelled)` |
| `agreements` | Acuerdos / decisiones / preguntas de una reunión | `meeting_id, kind(agreement|decision|question), text, owner ("Por definir"), due_on, status, task_id, fingerprint` · único por (reunión, tipo, fingerprint) → reprocesar no duplica |
| `content_items` | Plan de contenido | `client_id, objective, topic, format, channel, publish_on, copy, script, resources[], status(idea|draft|production|review|approved|published)` |
| `resources` | Biblioteca | `title, author, kind, source_url, attachment_id, tags, area_id, project_id, client_id, read_status, summary, key_ideas[], applications[], scope(full|excerpt|transcript|link_only|none), content, content_pages, fingerprint, search tsvector` |
| `notes` | Notas y apuntes | `+ area_id, project_id, client_id, subject_id, meeting_id, kind(note|idea|study|meeting|journal), search` |
| `subjects`, `grades` | Estudios | materias con `schedule [{weekday,start,end,room}]`; calificaciones `score/max_score/weight` · exámenes y entregas = `tasks.kind` con `subject_id` |
| `accounts` | Cuentas | `name, kind, scope(personal|business), currency, opening_balance` |
| `transactions` | Movimientos | `+ account_id, scope, status(paid|pending|planned), client_id, project_id, transfer_id (las dos patas), receipt_attachment_id, currency, recurring_id, due_on, notes; kind(expense|income|transfer_out|transfer_in)` · los resúmenes excluyen transferencias y solo suman `paid` |
| `recurring_items` | Suscripciones y pagos/ingresos recurrentes | `kind, amount, cadence, next_on, account_id, active` · no crea movimientos hasta marcar pagado |
| `budgets` | Presupuestos por mes/categoría/ámbito | `scope, category, month, amount` |
| `habits`, `habit_logs` | Hábitos | `frequency {per:day|week, times, weekdays[]}, active, paused_at`; registros únicos por día |
| `daily_reviews`, `weekly_reviews` | Revisión diaria/semanal | campos de reflexión + `ai_summary`/`suggested`; `data` semanal |
| `priorities` | Las 3 prioridades del día | `day, task_ids[] (orden), reasons {id: motivo}, source(user|ai)` |
| `memories` | Memoria editable | `+ kind(preference|goal|routine|project|decision|constraint|style|fact), source(confirmed|inferred), origin, confidence` · lo borrado deja de usarse en prompts y búsquedas |
| `action_log` | Historial de acciones del asistente | `actor, tool, summary, target_table, target_id, op, before, after, reversible, undone_at, batch_id` · `undo_action(id)` |
| `chat_messages`, `push_subscriptions`, `api_tokens` | (v1) | sin cambios de contrato |

## Funciones (RPC)
- `ensure_defaults()` → crea `settings` y las 3 áreas iniciales; idempotente. Llamar al iniciar sesión.
- `sync_push(changes)` — `[{table, id, op: upsert|delete, base_version, row}]` → `[{table, id, status: applied|conflict|rejected, version, server, error}]`. Conflicto = la versión base no coincide; devuelve la fila del servidor y **no** sobrescribe.
- `sync_pull(since, tables?)` → `{server_time, tables: {t: {rows, more}}}` (incluye borrados; 1000 filas por tabla y página).
- `undo_action(id)` → `{ok, error?}`; restaura `before` (update), re-borra (insert) o restaura (delete).
- `search_all(q, limit)` → `(kind, id, title, snippet, rank, updated_at)` sobre tareas, notas, biblioteca, reuniones, acuerdos, clientes, contactos, proyectos, contenido y bandeja. Español, `websearch_to_tsquery`.
- `find_contact_duplicates(name, email, phone)`.
- Desde Siri (service_role) las funciones aceptan `p_user` para acotar al dueño del token.

## Enlaces internos
`/tareas/:id`, `/proyectos/:id`, `/clientes/:id`, `/reuniones/:id`, `/biblioteca/:id`, `/notas/:id`, `/contactos/:id`, `/bandeja/:id`. El asistente devuelve estos enlaces al consultar o crear registros.
