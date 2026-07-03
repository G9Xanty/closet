# 00 — Core Architecture

## Stack oficial

| Capa        | Tecnología                     |
| ----------- | ------------------------------ |
| Frontend    | React 19 + TypeScript 5.8      |
| Bundler     | Vite 6                         |
| Backend     | Express 4 (Node.js)            |
| Base de datos | Supabase (PostgreSQL)        |
| Auth        | Supabase Auth (email/contraseña) |
| Estilos     | CSS vanilla (`.css` por screen) |
| Despliegue  | Vercel (serverless + SPA) |
| PWA         | manifest.json + meta tags      |
| Almacenamiento | Uploads locales (`/uploads`) |

> **Nota:** Actualmente el proyecto usa Vite como bundler y CSS plano. Si se desea migrar a **Next.js 15** (App Router) y **Tailwind CSS**, debe decidirse como equipo antes de iniciar nueva funcionalidad.

---

## Estructura de carpetas

```
closet/
├── admin/                  # Panel admin plano (HTML legacy)
│   └── admin.html
├── docs/                   # Documentación técnica
├── public/                 # Assets estáticos (manifest, icons, fuentes)
├── server/                 # (futuro) Separación backend
├── src/
│   ├── api/                # Capa de comunicación HTTP
│   │   └── client.ts       # Fetch wrapper con credentials
│   ├── components/         # Componentes reutilizables (sin estado global)
│   │   ├── FrameRenderer.tsx
│   │   └── ViewportContent.tsx
│   ├── hooks/              # Custom hooks de React
│   ├── screens/            # Pantallas completas (una por ruta)
│   │   ├── AdminScreen.tsx
│   │   ├── AuthScreen.tsx
│   │   ├── DetailScreen.tsx
│   │   ├── FeedScreen.tsx
│   │   ├── LoadingScreen.tsx
│   │   ├── PlayScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   ├── PublicProfileScreen.tsx
│   │   ├── SellerProfileScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── UploadProductScreen.tsx
│   ├── store/              # Estado global (Context + hooks)
│   │   ├── AppProvider.tsx  # Provider + context
│   │   └── appState.ts     # Tipos + lógica de estado
│   ├── styles/             # Hojas de estilo
│   │   ├── global.css
│   │   ├── frame.css
│   │   └── screens.css
│   ├── types/              # Tipos compartidos (futuro)
│   ├── services/           # Lógica de negocio (futuro)
│   ├── App.tsx             # Raíz de la app
│   ├── main.tsx            # Entry point
│   └── vite-env.d.ts       # Tipos de Vite
├── uploads/                # Imágenes subidas por usuarios
├── server.cjs              # Servidor Express (único archivo)
├── .env                    # Variables de entorno (local)
├── .env.example            # Plantilla para despliegue
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Naming conventions

| Concepto              | Convención                     | Ejemplo                     |
| --------------------- | ------------------------------ | --------------------------- |
| Archivos de pantalla  | `PascalCase + Screen.tsx`      | `FeedScreen.tsx`            |
| Componentes           | `PascalCase.tsx`               | `FrameRenderer.tsx`         |
| Hooks                 | `camelCase`                    | `useAppContext`             |
| Funciones/ variables  | `camelCase`                    | `goTo`, `activeProduct`     |
| Tipos/ interfaces     | `PascalCase`                   | `User`, `Product`, `Screen` |
| Archivos de estilos   | `kebab-case.css`               | `global.css`, `screens.css` |
| Carpetas              | `kebab-case`                   | `api/`, `store/`            |
| Constantes            | `UPPER_SNAKE_CASE`             | `API_BASE`                  |
| Archivos de API       | `camelCase.ts`                 | `client.ts`                 |
| DB (SQL/Supabase)     | `snake_case`                   | `whatsapp_phone`, `uber_flash_included` |

---

## Estados globales

El estado global se maneja con **React Context** (`AppProvider`). Estados disponibles:

| Estado            | Tipo             | Default     | Descripción                     |
| ----------------- | ---------------- | ----------- | ------------------------------- |
| `screen`          | `Screen` (enum)  | `"play"`    | Pantalla activa actual          |
| `user`            | `User \| null`   | `null`      | Usuario autenticado             |
| `products`        | `Product[]`      | `[]`        | Catálogo de productos           |
| `activeProduct`   | `Product \| null` | `null`     | Producto seleccionado en detalle |
| `activeCategory`  | `string`         | `"all"`     | Filtro de categoría activo      |

**Screen** possible values:
`"play" | "loading" | "auth" | "feed" | "detail" | "profile" | "upload" | "publicProfile" | "sellerProfile" | "settings" | "admin"`

---

## Providers

```
<StrictMode>
  └── <AppProvider>         ← Context global (usuario, productos, navegación)
       └── <FrameRenderer>  ← Layout tipo "marco de celular"
            └── <ViewportContent>  ← Renderiza la screen activa
```

`AppProvider` expone el hook `useAppContext()` para consumir estado desde cualquier componente.

---

## Rutas (navegación)

No se usa React Router. La navegación es **state-driven** mediante `screen`:

```
Pantalla actual    →    goTo(screen)     →    Pantalla destino
   play                  login/signup           auth
   auth                  auth success           feed
   feed                  click producto         detail
   detail                volver                 feed
   feed                  perfil                 profile
   profile               editar                 settings
   feed                  upload                 upload
   feed                  ver vendedor           publicProfile / sellerProfile
   cualquier             admin (si is_admin)    admin
```

Toda navegación se hace vía `goTo()` del contexto. No hay URL routing — la app es una SPA mobile-first.

---

## Middleware

No hay middleware en el frontend. La lógica de guardia se maneja en `ViewportContent.tsx` y cada `Screen`:

- **Auth guard:** Si `screen === "feed"` y `user === null`, redirigir a `"auth"`.
- **Admin guard:** `AdminScreen` solo accesible si `user.is_admin === true`.
- **Upload guard:** Solo si hay sesión activa.

En el **backend** (`server.cjs`):
- `cookie-parser` para sesiones
- Validación manual de `supabase.auth.getUser()` en rutas protegidas
- `multer` para upload de imágenes

---

## Roles

| Rol       | DB flag         | Acceso                                     |
| --------- | --------------- | ------------------------------------------ |
| **User**  | `users.is_admin = false` | Feed, detalle, perfil propio, subir productos, chat vía WhatsApp |
| **Admin** | `users.is_admin = true`  | Todo lo de User + AdminScreen (CRUD completo, gestión de productos y usuarios) |
| **Visitor** | Sin sesión    | Solo PlayScreen (pantalla de entrada) y AuthScreen |

El flag `is_admin` se mapea desde Supabase y se verifica tanto en frontend (UI condicional) como en backend (protección de rutas `/api/admin/*`).

---

## Flujo de datos

```
[Usuario] → Screen (UI) → useAppContext() → api/client.ts → Express → Supabase
                                                                  ↓
[Usuario] ← Screen (UI) ← useAppContext() ← api/client.ts ← Express ←
```

Las imágenes se sirven desde `/uploads/` (local) con proxy de Vite en desarrollo.

---

## Próximos pasos sugeridos

1. Separar backend a `/server/` con estructura modular
2. Migrar a **Next.js 15** si se necesita SSR / SEO / API routes unificadas
3. Migrar a **Tailwind CSS** para estilos consistentes
4. Agregar **React Router** si se desea navegación por URL
5. Mover tipos a `/types/` y lógica de negocio a `/services/`
6. Agregar **Zustand** o **Jotai** si Context se vuelve cuello de botella
7. Implementar PWA completa con Service Worker
8. Migrar a **Cloudinary** para imágenes en producción
