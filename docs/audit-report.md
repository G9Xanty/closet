# Auditoría — Closet Elander

> Fecha: 29 jun 2026<br>
> Stack: Vite 6 + React 19 + TypeScript + Supabase + Express

---

## 1. Estructura actual

```
closet/
├── admin/
│   └── admin.html              ← Panel admin legacy (vanilla JS, 127 líneas)
├── dist/                        ← Builds antiguos mezclados
├── docs/
├── public/
│   ├── app.js                   ← ← ← SPA completa legacy (1374 líneas)
│   ├── closet.html              ← ← ← Entry point legacy (redirige desde /)
│   ├── sw.js                    ← Service Worker (solo registrado desde closet.html)
│   ├── offline.html
│   ├── manifest.json
│   ├── assets/                  ← Imágenes de frames arcade
│   └── icons/
├── src/                         ← React app (nueva)
│   ├── api/client.ts
│   ├── components/
│   │   ├── FrameRenderer.tsx
│   │   └── ViewportContent.tsx
│   ├── hooks/                   ← VACÍO
│   ├── lib/supabase.ts
│   ├── screens/                 ← 11 screens
│   ├── store/
│   │   ├── AppProvider.tsx      ← Context funcional
│   │   └── appState.ts          ← Hook NO USADO
│   ├── styles/                  ← 3 CSS
│   ├── App.tsx
│   └── main.tsx
├── server.cjs                   ← Express backend (999 líneas, monolítico)
├── index.html                   ← Entry point Vite (React)
└── package.json
```

---

## 2. Código muerto

### 2.1 `public/app.js` + `public/closet.html` — SPA legacy completa
- **1374 líneas** de vanilla JS que implementan TODO el frontend (auth, feed, detail, profile, upload, admin, favorites, search)
- `closet.html` tiene su propio CSS inline duplicado, sus propios frames arcade
- **El servidor redirige `/` → `/closet.html`**: `app.get("/", (_req, res) => res.redirect("/closet.html"))`
- La app React (`index.html`) **NUNCA se sirve por defecto** en producción
- Conclusión: **hay DOS frontends completos compitiendo**. El legacy no se usa desde que existe el React, pero el servidor sigue apuntando al legacy.

### 2.2 `admin/admin.html` — Admin panel legacy
- 127 líneas con su propia lógica de login, CRUD de usuarios y productos
- Llama a rutas que **no existen** en el backend: `/api/admin/messages/global`, `/api/admin/messages/user`
- Envía `phone` al login, pero el backend espera `email`
- La app React ya tiene `AdminScreen.tsx`

### 2.3 `src/store/appState.ts` — Hook `useAppState()` no usado
- Exporta `useAppState()` pero **nunca se importa** en ningún archivo
- `AppProvider.tsx` tiene su propia implementación inline

### 2.4 `src/screens/SettingsScreen.tsx` — Muerta de facto
- Es un subconjunto de `ProfileScreen.tsx` (tiene menos funcionalidad)
- `ProfileScreen.tsx` ya incluye pestaña "settings"
- SettingsScreen se renderiza desde `ViewportContent.tsx` pero nadie navega a `"settings"` desde ninguna screen

### 2.5 `src/screens/PublicProfileScreen.tsx` — Parcialmente duplicada
- Muestra el perfil del propio usuario (lo mismo que ProfileScreen pero con menos data)
- `SellerProfileScreen.tsx` hace lo mismo para el vendedor de un producto

### 2.6 `dist/` — Builds stale
- Contiene `index.html`, `app.js`, `assets/`, `icons/`, etc. — escombros de builds anteriores

---

## 3. Componentes duplicados

| Grupo | Archivos | Problema |
|-------|----------|----------|
| Frontends completos | `public/closet.html` + `public/app.js` vs `src/` + `index.html` | Dos implementaciones completas |
| Admin | `admin/admin.html` vs `AdminScreen.tsx` | Misma funcionalidad, tecnólogías diferentes |
| Perfiles públicos | `PublicProfileScreen.tsx` vs `SellerProfileScreen.tsx` vs `ProfileScreen.tsx` | Lógica casi idéntica de fetch + render de perfil |
| Settings | `SettingsScreen.tsx` vs `ProfileScreen.tsx` (tab "settings") | SettingsScreen es redundante |
| CSS | `screens.css` vs estilos inline en `closet.html` | Mismas reglas duplicadas |
| Frame arcade | `FrameRenderer.tsx` vs frames inline en `closet.html` | Misma lógica de desktop/mobile frame |

---

## 4. Dependencias innecesarias

No hay dependencias npm claramente innecesarias. Todas se usan:

| Paquete | Uso |
|---------|-----|
| `react`, `react-dom` | App React |
| `@supabase/supabase-js` | Cliente Supabase (frontend y backend) |
| `express`, `cors`, `cookie-parser` | Backend |
| `multer` | Upload de imágenes (aunque ahora se usa Supabase Storage) |
| `dotenv` | Config |

> Nota: `multer` solo se usa para validación temporal en memoria, las imágenes se suben a Supabase Storage. El `fileFilter` tiene una condición imposible en línea 634 (comprueba `!file.mimetype.startsWith("image/")` después de ya haberla comprobado en 632).

---

## 5. Problemas de arquitectura

### 5.1 CRÍTICO — Context API con métodos que NO existen

`AuthScreen.tsx` llama desde `useAppContext()`:
- `signUp`, `signIn`, `resetPassword`, `updatePassword`, `updateProfile`, `isRecovery`

`LoadingScreen.tsx` llama:
- `session`, `authLoading`

`ProfileScreen.tsx` llama:
- `signOut`

**Ninguno de estos existe en `AppProvider`.** La app compila porque TypeScript tiene `strict: true` pero `noUnusedLocals: false`. En runtime:
- `AuthScreen` crashea al llamar `signUp`/`signIn` (undefined is not a function)
- `LoadingScreen` crashea al acceder a `session`/`authLoading`
- `ProfileScreen` crashea al hacer `signOut()`

**Estos son bugs bloqueantes para cualquier usuario que intente autenticarse.**

### 5.2 Servidor redirige al frontend legacy

```js
app.get("/", (_req, res) => res.redirect("/closet.html"));
```

La app React (`index.html`) no es el entry point. El servidor Express debería servir `index.html` para que el SPA de Vite funcione.

### 5.3 Monolito backend en server.cjs

- 999 líneas en un solo archivo
- Lógica de auth, productos, usuarios, admin, uploads, seed de DB todo mezclado
- Sin separación por responsabilidades

### 5.4 `supabase.auth.admin` usado en todo el backend

- `requireUser` usa `supabase.auth.getUser()` correctamente
- Pero endpoints como `/api/users/search`, `/api/products`, `/api/products/:id` usan `supabase.auth.admin.getUserById()` para obtener metadatos
- Esto **bypassea RLS** y requiere `SUPABASE_SERVICE_ROLE_KEY`
- Escala mal: en `/api/products` se hace un request a Auth por cada producto

### 5.5 Navegación state-driven frágil

- No hay React Router
- La navegación es por `screen` string
- No hay tipos que fuercen que todas las rutas tengan manejo de estado
- No hay deep linking, no hay URLs compartibles

### 5.6 Store inconsistente

- `appState.ts` exporta `useAppState()` que nunca se usa
- `AppProvider.tsx` tiene tipos importados de `appState` pero implementación propia
- Los types `User` y `Product` están en `appState.ts` en vez de `types/`

### 5.7 Carpetas vacías/declaradas

- `hooks/` — vacía
- `types/` y `services/` — declaradas en docs pero no existen
- `lib/` — solo tiene `supabase.ts`

### 5.8 Supabase anon key hardcodeada en frontend

```ts
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "key literal aquí";
```

El fallback hardcodea la key real. Debería ser solo env var.

---

## 6. Puntos frágiles para producción

| Prioridad | Problema | Impacto | Archivo |
|-----------|----------|---------|---------|
| 🔴 | AuthScreen/ProfileScreen/ LoadingScreen crashean por métodos que no existen en Context | Usuarios no pueden loguearse | `AuthScreen.tsx`, `LoadingScreen.tsx`, `ProfileScreen.tsx` |
| 🔴 | Servidor sirve `closet.html` (legacy) en vez de `index.html` (React) | La app React no se ve en producción | `server.cjs:349` |
| 🟠 | `GET /api/users/search` trae TODOS los usuarios sin paginación | Crashing con >100 usuarios | `server.cjs:490-491` |
| 🟠 | `GET /api/admin/dashboard` trae TODOS los usuarios y productos | Crashing, memory leak | `server.cjs:885-887` |
| 🟠 | `GET /api/products` hace N requests a Auth por cada producto | Lento con >30 productos | `server.cjs:719-731` |
| 🟠 | Service Worker solo registrado en `closet.html`, no en React | PWA offline no funciona en React | Solo `closet.html:76` |
| 🟠 | Rate limiter sin trust proxy (`validate: { xForwardedForHeader: false }`) | IP spoofing, rate limiting evitable | `server.cjs:45,54,63,72` |
| 🟠 | Admin HTML envía `phone` al login, backend espera `email` | Admin legacy no funciona | `admin/admin.html:83` |
| 🟠 | Admin HTML llama a rutas que no existen (`/api/admin/messages/*`) | Admin legacy crashea | `admin/admin.html:105,111` |
| 🟡 | `fileFilter` de multer condición redundante (línea 632 y 634) | Lógica muerta, confusa | `server.cjs:632-635` |
| 🟡 | Product DELETE solo borra `storage_path` del storage (no las imágenes individuales `image_url_2..4`) | Orfandad de imágenes | `server.cjs:871-873` |
| 🟡 | No hay Content Security Policy headers | XSS potencial | `server.cjs:145-154` |
| 🟡 | No hay error boundaries en React | Cualquier crash tumba toda la app | `src/App.tsx` |
| 🟡 | `noUnusedLocals: false`, `noUnusedParameters: false` | Código muerto pasa desapercibido | `tsconfig.json` |
| 🟡 | Demo data hardcodeada en `FeedScreen.tsx` (líneas 34-38) | Datos fantasma en producción | `FeedScreen.tsx` |
| 🟡 | `dist/` con archivos stale | Confusión en deploy | `dist/` |

---

## 7. Resumen cuantitativo

| Métrica | Valor |
|---------|-------|
| Archivos totales en `src/` | 21 |
| Líneas de frontend React | ~950 |
| Líneas de frontend legacy (muerto) | ~1500 (`app.js` + `closet.html` + `admin.html`) |
| Líneas de backend | 999 (`server.cjs`) |
| Líneas de CSS | ~730 (`global.css` + `frame.css` + `screens.css`) |
| Screens | 11 (3 duplicadas/parcialmente muertas) |
| Bugs bloqueantes (prod) | 2 |
| Bugs alto impacto (prod) | 7 |
| Deuda técnica baja | 8 |

---

## 8. Diagnóstico final

**La app React es funcional en estructura pero tiene bugs bloqueantes en autenticación y navegación que la hacen inusable.** El frontend legacy (`closet.html` + `app.js`) es probablemente lo que está sirviendo en producción hoy.

El proyecto está en una transición legacy → React a medio completar: el frontend React está parcialmente implementado, el backend no se ha actualizado para servirlo, y el Context carece de los métodos que las screens esperan.

Para V1 hay que decidir: **eliminar el legacy o terminarlo**. La React app está más cerca de ser el futuro, pero necesita completarse.

---

## 9. Plan de refactor mínimo para V1

Objetivo: **salir a producción con la app React funcional en 1-2 sprints.**

### Fase 0 — Arreglos críticos (día 1)

| # | Acción | Archivos |
|---|--------|----------|
| 1 | Agregar métodos faltantes al Context (`signUp`, `signIn`, `signOut`, `resetPassword`, `updatePassword`, `updateProfile`, `isRecovery`, `session`, `authLoading`) | `AppProvider.tsx` |
| 2 | Mover lógica de auth del frontend al provider (usar `supabase.auth` directamente + sync con backend) | `AppProvider.tsx`, `lib/supabase.ts` |
| 3 | Hacer que el servidor sirva el `index.html` de Vite como entry point | `server.cjs:349` |
| 4 | Eliminar `SettingsScreen.tsx` y `PublicProfileScreen.tsx` (redundantes) | `screens/` |
| 5 | Unificar `SellerProfileScreen.tsx` con lógica genérica de perfil | `screens/` |

### Fase 1 — Limpieza (día 2)

| # | Acción |
|---|--------|
| 6 | Mover types `User`, `Product`, `Screen` a `types/index.ts` |
| 7 | Mover API helpers de screens a `services/api.ts` o `services/auth.ts` |
| 8 | Eliminar `appState.ts` (código muerto) |
| 9 | Eliminar `dist/` del repo (añadir a `.gitignore`) |
| 10 | Poner Supabase keys solo como env vars (quitar fallback hardcodeado) |
| 11 | Eliminar demo data de `FeedScreen.tsx` |
| 12 | Eliminar `public/app.js` y `public/closet.html` (legacy) — o mover a `legacy/` |
| 13 | Eliminar `admin/admin.html` (usar solo `AdminScreen.tsx`) |

### Fase 2 — Backend (día 3)

| # | Acción |
|---|--------|
| 14 | Separar `server.cjs` en `server/routes/` modular (auth, products, users, admin, uploads) |
| 15 | Agregar paginación a `GET /api/users/search` y `GET /api/admin/dashboard` |
| 16 | Cachear user metadata en products en vez de N requests a Auth (`JOIN` con `profiles`) |
| 17 | Agregar trust proxy para rate limiting |
| 18 | Agregar CSP headers |
| 19 | Eliminar rutas legacy de mensajes que no existen |

### Fase 3 — Estabilidad (día 4)

| # | Acción |
|---|--------|
| 20 | Agregar Error Boundary en `App.tsx` |
| 21 | Habilitar `strict: true` + `noUnusedLocals: true` en tsconfig |
| 22 | Registrar Service Worker desde `main.tsx` |
| 23 | Verificar que todos los imports de screens estén correctos |
| 24 | Test manual del flujo completo: play → auth → feed → detail → upload → profile |

### Fase 4 (opcional) — Mejoras

| # | Acción |
|---|--------|
| 25 | Agregar React Router para URLs compartibles |
| 26 | Agregar loading skeletons y estados de error en screens |
| 27 | Agregar `react-helmet-async` para meta tags dinámicos (PWA) |
