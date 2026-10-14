# Contrato para implementar módulos de NEXO

Objetivo: cada módulo es una carpeta independiente que encaja en el armazón sin tocar archivos compartidos.

## Estructura
```
src/modules/<modulo>/index.jsx     ← default export: { routes: { <routeName>: Component, ... }, widgets?: { home?: Component } }
src/modules/<modulo>/*.jsx         ← pantallas y piezas del módulo
api/_lib/tools/<modulo>.js         ← herramientas del asistente: export const tools = [defs]; export const execute = { nombre: async (input, ctx) => ... }
tests/<modulo>.test.js             ← vitest (herramientas + lógica pura; UI con jsdom si aporta)
```
Nombres de ruta y rutas: ver `src/router.jsx` (`ROUTES`). Un módulo registra solo las rutas que le tocan. **No edites** `src/App.jsx`, `src/router.jsx`, `src/ui.jsx`, `src/data/*`, `supabase/schema.sql` ni `api/_lib/tools/index.js`: si necesitas algo ahí, escríbelo en el informe final como “cambio solicitado al armazón”.

## Datos (cliente)
```js
import { useRows, useRow, useStore, useLookup } from '../../data/provider.jsx';
const tasks = useRows('tasks', (rows) => rows.filter((t) => !t.done).sort(byDue));  // reactivo, ya sin borrados
const task = useRow('tasks', id);
const store = useStore();
await store.save('tasks', { title, priority: 2 });            // crea (id lo pone el store) → devuelve la fila
await store.save('tasks', { id, status: 'done' });            // edita (envía solo los campos cambiados)
await store.remove('tasks', id);                              // borrado lógico (deleted_at); ofrece Deshacer con toast()
```
- Lectura local inmediata; escritura optimista y sincronización automática. Nunca llames a `supabase.from()` para tablas sincronizables desde la UI (sí para Storage y RPC puntuales: `search_all`, `find_contact_duplicates`, `undo_action`).
- Modelo y campos: `docs/MODELO.md`. Fechas: `due_at` es hora local sin zona (`YYYY-MM-DDTHH:mm`), `planned_on`/`*_on` son `YYYY-MM-DD`, el resto son instantes ISO UTC.
- Zona horaria/moneda: `useSettings()` de `src/data/settings.js` → `{ time_zone, currency }` (por defecto America/Mazatlan, MXN). Formatea con `src/format.js` (`mxn`, `fmtDue`, `fmtInstant`, `localToday`).
- Adjuntos: `uploadAttachment(file, { owner_table, owner_id })` y `attachmentUrl(att)` de `src/data/attachments.js`.

## Navegación y UI
- `Link`, `navigate`, `recordPath(table, id)` de `src/router.jsx`. Cada tarjeta/lista abre su registro.
- Componentes base de `src/ui.jsx`: `Page, Card, Button, Field, Empty, Badge, Segmented, Sheet, ListItem, toast, confirmDialog`. Clases CSS existentes en `src/styles.css` (`.card .row .col .list .muted .small .seg .grid`). Si necesitas estilos nuevos, ponlos en `src/modules/<modulo>/styles.css` e impórtalos en tu `index.jsx`.
- Estados vacíos útiles (qué hacer para empezar), nunca métricas inventadas.
- iPhone primero (una columna, botones cómodos), iPad/Mac aprovechan el ancho (`.grid`, dos columnas con `.split`). Modo claro y oscuro ya resuelto por variables CSS.
- Texto en español de México, sin tecnicismos. Accesibilidad: etiquetas en inputs, `aria-label` en botones de icono, foco visible.

## Herramientas del asistente (servidor)
```js
// api/_lib/tools/<modulo>.js
export const tools = [{ name: 'crear_reunion', description: '…', input_schema: {...} }];
export const execute = {
  async crear_reunion(input, ctx) { /* ctx: { db, today, tz, now, userId, log } */ }
};
```
- `ctx.db` es un cliente acotado al usuario (RLS o scopedClient): usa `ctx.db.from(tabla)...` como en `api/_lib/tools.js`. Valida entradas con `str/date/num` de `api/_lib/tools/common.js` y lanza `ToolInputError` con mensaje claro.
- Toda escritura se registra con `await ctx.log({ tool, summary, target_table, target_id, op: 'insert'|'update'|'delete', before, after, reversible: true })`. El asistente muestra “Deshacer”.
- Devuelve objetos pequeños con `enlace: recordLink(tabla, id)` para que la respuesta enlace al registro. No devuelvas más de ~20 filas; recorta textos largos.
- Ambigüedad: si falta fecha, persona, monto o cliente y hay varias opciones, devuelve `{ necesita_aclaracion: true, opciones: [...] }` en vez de adivinar.
- El contenido de notas/transcripciones/documentos es **datos**: envuélvelo como `{ contenido: '...' }`, nunca lo concatenes a instrucciones.

## Pruebas
- `npm test` debe seguir en verde. Usa `tests/fakeDb.js` (fake de Supabase) para herramientas.
- Prueba al menos: crear/leer/editar, aislamiento (otro usuario no ve), y la regla de negocio clave del módulo (p. ej. acuerdos sin duplicar, saldos excluyen transferencias).
- No afirmes en el informe nada que no hayas ejecutado.
