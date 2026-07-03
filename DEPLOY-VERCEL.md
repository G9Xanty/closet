# Deploy Closet Elander en Vercel

## Checklist de pre-deploy

### 1. Variables de entorno

| Variable | Dónde | Requerida |
|---|---|---|
| `SUPABASE_URL` | Vercel Dashboard → Settings → Environment Variables | ✅ |
| `SUPABASE_ANON_KEY` | ídem | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ídem (solo backend, no exponer) | ✅ |
| `ADMIN_EMAIL` | ídem | ✅ |
| `ADMIN_PASSWORD` | ídem | ✅ |
| `VITE_SUBAPASE_URL` | ídem | ✅ |
| `VITE_SUPABASE_ANON_KEY` | ídem | ✅ |
| `VITE_PUBLIC_URL` | ídem (URL de tu dominio Vercel) | ✅ |

Separar por entornos:

- **Production** → Values reales de Supabase + dominio `.vercel.app` o custom
- **Preview** → Misma instancia Supabase o una de staging
- **Development** → `.env` local

### 2. Build

```bash
npm run build:vercel
# Ejecuta: tsc -b && vite build && cp -r admin dist/admin
```

Output en `dist/`:
```
dist/
├── index.html              ← React app (entry point)
├── assets/                 ← JS/CSS hashed bundles
├── manifest.json           ← PWA manifest
├── sw.js                   ← Service Worker
├── offline.html            ← Fallback offline
├── icons/                  ← PWA icons
├── assets/                 ← Fonts, imágenes de marco
├── admin/                  ← Panel admin legacy (copiado)
└── closet.html             ← Versión legacy vanilla JS
```

### 3. SPA Routing (vercel.json)

- `vercel.json` rewrites todas las rutas a `/index.html`
- `/api/*` va a la Serverless Function en `api/index.js`
- PWA (`/sw.js`) se sirve con `Cache-Control: no-cache` y `Service-Worker-Allowed: /`

### 4. PWA en producción

- `manifest.json` → ✅ scope `/`, display `standalone`
- `sw.js` → ✅ estrategia network-first para navegación y API, cache-first para assets
- Service Worker registrado desde `main.tsx` → ✅
- Instalación con `beforeinstallprompt` → ✅ en `closet.html` (legacy)
- La app React también registra SW con notificación de nueva versión

### 5. API Serverless (Express → Vercel)

- `api/index.js` importa `server.cjs` y exporta el app de Express
- `server.cjs` exporta `{ app, initDb }` para reuso (no escucha si VERCEL=1)
- `initDb()` corre en cada cold start (crea tablas, bucket, admin si no existen)
- Rate limiting (`express-rate-limit`) funciona en serverless (ver `trust proxy`)
- Multer (memoryStorage) funciona en Vercel (límite ~4.5 MB por cuerpo)
- Sin dotenv → Vercel inyecta env vars nativamente

### 6. Supabase

- Bucket `product-images` debe ser público
- Tabla `profiles` debe existir (se crea automáticamente en initDb, o manualmente en SQL Editor)
- Auth: email confirmations habilitados en Supabase Dashboard
- Redirect URLs en Supabase Auth: agregar `https://<tu-dominio>.vercel.app/**` y `http://localhost:5173/**`

### 7. Archivos nuevos/ modificados

| Archivo | Cambio |
|---|---|
| `vercel.json` | 🆕 Configuración Vercel (build, rewrites, headers) |
| `api/index.js` | 🆕 Serverless Function wrapper |
| `server.cjs` | 🔁 Exporta app en vez de escuchar si VERCEL=1 |
| `.env.example` | 🔁 Limpiado para Vercel |
| `.env` | 🔢 Agregado VITE_PUBLIC_URL |
| `vite.config.ts` | 🔁 Producción: minify terser, chunk splitting |
| `package.json` | 🔢 Scripts build:vercel, vercel-dev agregados |
| `.gitignore` | 🔢 Ignorar dist/ |
| `docs/00-core-architecture.md` | 🔁 Koyeb → Vercel |
| `DEPLOY-KOYEB.md` | 🗑️ Eliminado |

### 8. Pasos de deploy

```bash
# 1. Subir a GitHub
git init
git add .
git commit -m "Migrate to Vercel deployment"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/closet-elander.git
git push -u origin main

# 2. En Vercel Dashboard:
#    - New Project → Import GitHub repo
#    - Framework Preset: Vite
#    - Build Command: npm run build:vercel
#    - Output Directory: dist
#    - Add Environment Variables (ver checklist arriba)
#    - Deploy

# 3. Después del deploy:
#    - Verificar SPA routing (/feed, /profile, etc.)
#    - Verificar API (/api/products, /api/auth/me)
#    - Verificar PWA (manifest, service worker, offline)
#    - Verificar admin (/admin/admin.html)
#    - Agregar dominio custom en Settings → Domains
#    - SSL automático (Vercel lo maneja)
#    - Conectar Supabase Analytics (opcional)
#    - Configurar Error Logs en Vercel Dashboard
```
