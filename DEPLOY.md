# 🚀 Deployment — MacroVision AI

## Arquitectura de producción

```
iPhone/Web (Cloudflare Pages)
    ↓ HTTPS
Cloudflare (CDN + DDoS)
    ↓ proxy
Railway (NestJS Backend)
    ↓
Supabase (PostgreSQL)
```

---

## PASO 1 — Supabase (Base de datos)

1. Ve a **https://supabase.com** → **New project**
2. Pon el nombre: `macrovision-ai`
3. Genera una contraseña segura (guárdala)
4. Región: **US East** o la más cercana a ti
5. Espera ~2 min a que inicie

### Obtener las URLs de conexión:
- Ve a **Settings → Database → Connection string**
- Copia las 2 URLs:

```
# Para la APP (Transaction pooler, puerto 6543)
DATABASE_URL=postgresql://postgres.[REF]:[PASS]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

# Para MIGRACIONES (Direct, puerto 5432)
SHADOW_DATABASE_URL=postgresql://postgres:[PASS]@db.[REF].supabase.co:5432/postgres
```

---

## PASO 2 — Railway (Backend)

1. Ve a **https://railway.com** → **New Project**
2. Selecciona **Deploy from GitHub repo**
3. Conecta tu cuenta GitHub y selecciona el repo `macrovision-ai`

### Configurar el servicio:
- En la pestaña **Settings**:
  - **Root Directory**: `apps/backend`
  - **Dockerfile Path**: `Dockerfile` (auto-detectado)

### Agregar variables de entorno:
Clic en **Variables** y agrega todas las de `.env.production.example`:

```bash
# OBLIGATORIAS
DATABASE_URL          = postgresql://... (conexión pooled de Supabase, puerto 6543)
SHADOW_DATABASE_URL   = postgresql://... (conexión directa de Supabase, puerto 5432)
JWT_SECRET            = (genera con: openssl rand -base64 64)
JWT_REFRESH_SECRET    = (genera con: openssl rand -base64 64)
NODE_ENV              = production
PORT                  = 3000

# CORS — pon la URL de tu Cloudflare Pages
CORS_ORIGINS          = https://macrovision.pages.dev

# AI (al menos uno)
OPENAI_API_KEY        = sk-proj-...
```

### Deploy:
- Clic en **Deploy** → Railway construye la imagen y ejecuta las migraciones automáticamente

### Obtener la URL del backend:
- Ve a **Settings → Domains** → copia `https://xxx.railway.app`

---

## PASO 3 — Cloudflare Pages (Frontend HTML)

1. Ve a **https://pages.cloudflare.com**
2. **Create a project** → **Upload assets** (opción directa, sin GitHub)
3. Arrastra el archivo `macrovision.html`
4. Renómbralo a `index.html` si preguntan
5. Tu URL será algo como `https://macrovision.pages.dev`

### Alternativa con GitHub (recomendado):
1. **Connect to Git** → selecciona tu repo
2. Framework preset: **None**
3. Build command: (vacío)
4. Build output directory: `/` (raíz)
5. El archivo HTML estará en la raíz del proyecto

---

## PASO 4 — Configurar Cloudflare para proteger Railway

Si tienes un dominio propio (ej. `macrovision.app`):

1. **Cloudflare Dashboard → DNS**
2. Agrega un registro `CNAME`:
   ```
   Nombre: api
   Destino: xxx.railway.app
   Proxy: ✅ ON (naranja)
   ```
3. Resultado: `https://api.macrovision.app` → Railway (con protección Cloudflare)

Sin dominio propio: usa directamente la URL de Railway (`xxx.railway.app`) que ya tiene HTTPS.

---

## PASO 5 — Seed inicial en producción

Después del primer deploy exitoso, ejecuta el seed desde tu Mac:

```bash
cd apps/backend

# Con las URLs de Supabase:
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@db.[REF].supabase.co:5432/postgres" \
npx ts-node prisma/seed.ts
```

Esto crea los alimentos base. Para crear un admin, regístrate desde la app y luego en Supabase Dashboard:
```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'tu@email.com';
```

---

## PASO 6 — Configurar la app en iPhone

1. Abre Safari → ve a tu URL de Cloudflare Pages
2. Al cargar, se abrirá automáticamente el modal de configuración de URL
3. Escribe la URL de tu backend Railway: `https://xxx.railway.app`
4. Guarda → el indicador se pone verde 🟢
5. **Compartir → Agregar a pantalla de inicio**

---

## Costos estimados (free tier)

| Servicio | Plan gratuito |
|----------|--------------|
| Supabase | 500MB DB, 2 proyectos | ✅ Gratis |
| Railway  | $5 USD/mes (Hobby) o free con límites | ~$5/mes |
| Cloudflare Pages | Ilimitado | ✅ Gratis |
| Cloudflare DNS | Gratis con cualquier plan | ✅ Gratis |

**Total mínimo: $0–$5/mes**

---

## Variables de entorno resumen rápido (Railway)

```
DATABASE_URL=postgresql://postgres.[REF]:[PASS]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
SHADOW_DATABASE_URL=postgresql://postgres:[PASS]@db.[REF].supabase.co:5432/postgres
JWT_SECRET=[genera con openssl rand -base64 64]
JWT_REFRESH_SECRET=[genera con openssl rand -base64 64]
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://TU-SITIO.pages.dev
OPENAI_API_KEY=sk-proj-...
```
