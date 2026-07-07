# Closet Elander — Manual para agentes AI

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite 6 |
| Backend | Express 4 (CommonJS `.cjs`), Node 24 |
| Base de datos | Supabase Postgres (proyecto `bnspmmphhztqdeenlwcz`) |
| Auth | Supabase Auth (anon key + service role key) |
| Storage | Supabase Storage bucket `product-images` |
| Deploy | Vercel (serverless via `api/index.js` + `api/package.json`) |

## Product Bible

El documento `docs/product-bible.md` es la referencia principal del producto. Contiene visión, filosofía, flujo del usuario, arquitectura, base de datos, UI guidelines, roadmap, decisiones técnicas e ideas futuras.

**Siempre consultar el Product Bible antes de implementar cualquier sistema nuevo** para asegurar consistencia con las decisiones previas.

**Los 10 Principios Inmutables** (`docs/product-bible.md#08--principios-inmutables`) son reglas de arquitectura que ninguna funcionalidad nueva puede violar. Si una implementación los rompe, primero replantear el diseño.

**Architecture Contract** (`docs/architecture-contract.md`) es la Constitución del proyecto. Contiene prohibiciones y obligaciones que ningún código puede violar. OpenCode implementa exactamente lo diseñado; las decisiones arquitectónicas las toman las personas.

## Archivos clave

| Archivo | Rol |
|---------|-----|
| `api/server.cjs` | Backend real (~1570 líneas). Contiene todos los endpoints: auth, products, sales, sale_requests, messages, reports, admin. |
| `api/admin.cjs` | Router admin (~331 líneas): metrics, users, products, sales, reports, reputation. |
| `api/index.cjs` | Entry point Vercel Serverless (`module.exports = app`). |
| `server.cjs` | Thin wrapper local: `require('./api/server.cjs')` + `listen(3000)`. |
| `docs/product-bible.md` | Product Bible — documento vivo del producto. |
| `docs/architecture-contract.md` | Architecture Contract — Constitución del proyecto. |
| `src/` | Frontend React completo. |
| `src/store/appState.ts` | Tipos TypeScript (`Screen`, `Product`, `Transaction` (antes `SaleRequest`), `Sale`, `Report`). |
| `src/store/AppProvider.tsx` | Contexto global de la app (screen actual, user, productos, etc.). |
| `src/api/client.ts` | Cliente API genérico que inyecta `Authorization: Bearer <token>` y `X-Requested-With`. |
| `src/components/ViewportContent.tsx` | Router de screens (switch por nombre, sin React Router). |
| `src/screens/RequestsScreen.tsx` | Pantalla de solicitudes (tabs Recibidas/Enviadas, acciones). |
| `src/screens/DetailScreen.tsx` | Detalle de producto + botón "Me interesa". |
| `src/screens/ChatScreen.tsx` | Chat en vivo con Realtime para cada sale_request. |
| `src/components/ProductCard.tsx` | Card rediseñada con imagen protagonista, ubicación, reputación. |
| `supabase/migrations/20240706000001_add_messages.sql` | Migración para tabla `messages` (chat). |
| `supabase/migrations/20240703000002_full_schema.sql` | Migración única con 7 tablas + RLS. Idempotente. |
| `test-sale-requests.mjs` | Script de prueba para sale_requests (16 tests, ESM). |
| `supabase-migration.sql` | Schema duplicado legacy (no usar). |

## Convenciones de código

### Backend (`api/server.cjs`)
- **Todas las writes** (INSERT, UPDATE, DELETE) usan `supabaseAdmin` (service role key, bypass RLS).
- **Reads públicas** (products feed, profiles) usan `supabase` (anon key, respeta RLS).
- **Reads de `sale_requests`** usan `supabaseAdmin` porque RLS está habilitada sin políticas.
- Los endpoints de auth (`/api/auth/*`) usan `supabase` para signUp/signIn y `supabaseAdmin` solo para admin operations (listUsers, updateUserById).
- El middleware `requireUser` intenta `supabase.auth.getUser(token)` primero, fallback a `supabaseAdmin.auth.getUser(token)`.
- El middleware `checkOrigin` permite cualquier Origin si está vacío (peticiones server-to-server).
- El middleware `botProtection` requiere User-Agent >= 10 caracteres.
- `publicProduct()` limpia datos sensibles antes de enviar al cliente.
- `publicUser()` limpia datos sensibles del usuario.
- Los rate limiters son in-memory: `authLimiter` (10/15min), `apiLimiter` (60/min), `uploadLimiter` (10/min), `productLimiter` (20/hora).

### Frontend (`src/`)
- Sin React Router: navegación por estado global `Screen` + `ViewportContent.tsx`.
- Todas las llamadas API pasan por `api()` en `src/api/client.ts`.
- Los estilos están en `src/styles/screens.css` (un solo archivo CSS).
- No hay tests unitarios ni de integración para el frontend.

### Base de datos
- La migración SQL es la **única fuente de verdad** del schema. Toda columna nueva debe tener `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- La migración se ejecuta manualmente en Supabase SQL Editor (no hay migración automática).
- `sale_requests` tiene RLS habilitada pero sin políticas — todas las operaciones usan `supabaseAdmin`.

## Reglas de infraestructura

1. **No crear archivos nuevos sin necesidad** — prefiere editar los existentes.
2. **No agregar dependencias npm** sin verificar que no están ya en `package.json`.
3. **TypeScript debe compilar limpio**: `npx tsc --noEmit` sin errores.
4. **Vite build debe pasar**: `npx vite build` exitoso.
5. **No crear archivos README o MD a menos que el usuario lo pida explícitamente.**
6. **No hacer commit a menos que el usuario lo pida explícitamente.**

## Historial de cambios relevantes (git log)

```
5053367 Fix RLS: sale_requests reads usan supabaseAdmin, test script 16/16 pasa
6f32ece Sprint 1: sale_requests elimina WhatsApp, sistema de solicitudes interno
bbae035 Fix RLS + schema: writes usan supabaseAdmin, migracion idempotente, WhatsApp tras crear solicitud
bdd9d7d Fix dealer_id: endpoint /api/auth/sync + frontend lo llama tras login
faea88d Fix auth 401: fallback a supabaseAdmin + logging startup/API
81ed2d4 Fix Vercel: use api/index.js with api/package.json (commonjs) for serverless
```

## Sprint 1 — Sale Requests (COMPLETED)

Reemplaza WhatsApp en el flujo de compra por sistema interno de solicitudes.

### Backend (3 endpoints en `api/server.cjs:1374-1473`)

- `POST /api/sale-requests` — crear solicitud (valida producto, duplicados, auto-reserva)
- `GET /api/sale-requests/mine` — listar solicitudes recibidas y enviadas (con producto)
- `PATCH /api/sale-requests/:id` — aceptar (vendedor), rechazar (vendedor), cancelar (comprador)

### Flujo de permisos
- Comprador: solo puede cancelar solicitudes pendientes.
- Vendedor: solo puede aceptar o rechazar solicitudes pendientes.
- Nadie puede modificar solicitudes ya procesadas.
- Nadie puede solicitar su propio producto.

### Transiciones de estado de producto
- `disponible` → `reserved` (al crear solicitud)
- `reserved` → `disponible` (si cancelan o rechazan)
- `reserved` → `sold` (si completan — no implementado en frontend aún)

### Frontend
- DetailScreen: botón "Me interesa" reemplaza botón de WhatsApp.
- RequestsScreen: tabs Recibidas/Enviadas con acciones por estado.
- ProfileScreen: botón "Mis solicitudes" en sección Acciones.
- ViewportContent: ruteo para screen `"requests"`.

### Tests (16/16 pasan)
```bash
node test-sale-requests.mjs
```
Cubre: happy flow, duplicados, producto reservado bloquea terceros, cancelación libera, rechazo libera, auto-solicitud bloqueada. Requiere server local en puerto 3000.

## Sprint 1.5 — Limpieza de BD (COMPLETED)

Eliminación de datos de prueba y dependencias externas de placeholders.

### Cambios
- **BD limpiada**: eliminados 6 "Test Product" (placeholders), 2 productos "Vestido Test/F2" de usuarios de prueba, ~20 usuarios `@test.closet` y `@prueba.local`.
- **Test script actualizado**: `images` ya no usa `via.placeholder.com` — usa inline SVG data URI (`data:image/svg+xml,...`), cero dependencia externa.
- **Product Bible creado**: `docs/product-bible.md` — documento vivo del producto.

### Razón
- Los placeholders `via.placeholder.com` estaban caídos → 6/10 productos se veían rotos.
- Los datos de prueba contaminaban la BD y confundían el desarrollo.

## Sprint 2 — Card Redesign + Chat (COMPLETED)

Rediseño completo de cards y chat interno con Realtime.

### Card redesign
- `src/components/ProductCard.tsx` — card con imagen protagonista (1:1, object-fit: cover), ubicación del vendedor, reputación, badge de estado, botón "Me interesa".
- `src/styles/screens.css` — grid responsive `auto-fill, minmax(220px, 1fr)`, hover con translateY + shadow, skeleton cards nuevos.
- Backend: `seller_location` agregado a `publicProduct()` y al JOIN de `profiles` en `GET /api/products`.
- TypeScript: `seller_location` y `Message` agregados a `Product` y `Screen` types.

### Chat (3 endpoints en `api/server.cjs:1478-1540`)
- `GET /api/sale-requests/:id/messages` — historial (solo participantes de la sale_request)
- `POST /api/sale-requests/:id/messages` — enviar mensaje
- `PATCH /api/messages/:id/read` — marcar como leído

### Tiempo real
- Supabase Realtime: canal `messages:{sale_request_id}` para INSERT
- `ChatScreen` se subscribe al canal y agrega mensajes nuevos automáticamente

### Frontend
- `ChatScreen` — burbujas de chat (propias a la derecha, ajenas a la izquierda), input, acciones de aceptar/rechazar/cancelar inline, estado de la solicitud.
- `RequestsScreen` — botón "Chat" para requests aceptadas o pendientes.
- `FeedScreen` — botón "Me interesa" en cada card → crea sale_request + navega a chat.
- `ViewportContent` — ruteo para screen `"chat"`.
- `Screen` type — agregado `"chat"`.

### Migración
- `supabase/migrations/20240706000001_add_messages.sql` — tabla `messages` con FK a sale_requests.

### Modelo messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_request_id UUID NOT NULL REFERENCES sale_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
```

## Sprint 2.5 — Máquina de estados + Transaction Events (PENDING)

Antes de construir el Centro de Transacción, establecer la arquitectura de estados que lo gobierna todo.

### Cambio fundamental: `sale_requests` → `transactions`

La tabla pasa a llamarse `transactions` (no `sale_requests`) porque después de `accepted` deja de ser una solicitud y se convierte en la transacción completa. La coherencia es:

```
transactions      (antes sale_requests)
  ├── transaction_events   (eventos inmutables de la transacción)
  └── messages             (mensajes del chat, separados de eventos)
```

### Concepto

Cada `transaction` tiene **un estado único** que determina:

- Qué acciones son posibles (según el rol: buyer/seller)
- Qué UI se renderiza (sin ifs desperdigados)
- Qué eventos se registran
- Qué notificaciones se disparan

Esto convierte la lógica de negocio en una **máquina de estados** predecible, en lugar de una maraña de condiciones.

### Diagrama de estados

```
                    ┌─────────┐
                    │REQUESTED│
                    └────┬────┘
                  ┌──────┼──────┐
                  │      │      │
                  ▼      │      ▼
            ┌────────┐   │  ┌────────┐
            │ACCEPTED│   │  │REJECTED│  terminal
            └───┬────┘   │  └────────┘
                │        │
                │   ┌──────────┐
                │   │CANCELLED │  terminal
                │   └──────────┘
                ▼
         ┌────────────────┐
         │ WAITING_PAYMENT│
         └───────┬────────┘
            ┌────┼────┐
            │    │    │
            ▼    │    │
    ┌──────────┐ │    │
    │PAYMENT_  │ │    │
    │SENT      │◄┘    │
    └────┬─────┘      │
         │      ┌─────────────────┐
         │      │PAYMENT_REJECTED │──┘  (vuelve a waiting_payment)
         │      └────────┬────────┘
         ▼               │
 ┌────────────┐          │
 │PAYMENT_    │          │
 │RECEIVED    │◄─────────┘
 └──────┬─────┘
        ▼
 ┌────────────────┐
 │WAITING_SHIPPING│
 └───────┬────────┘
         ▼
 ┌───────────┐
 │  SHIPPED  │
 └─────┬─────┘
       ▼
 ┌───────────┐
 │ DELIVERED │
 └─────┬─────┘
       ▼
 ┌───────────┐
 │ COMPLETED │  terminal
 └───────────┘

 Desde cualquier estado activo (no terminal):
 ┌───────────┐
 │  DISPUTE  │  terminal (futuro: reclamo abierto)
 └───────────┘
```

### Estados terminales
- `REJECTED` — vendedor rechazó
- `CANCELLED` — comprador canceló
- `COMPLETED` — transacción exitosa
- `DISPUTE` — reclamo abierto (reservado para futuro, no se implementa aún)

### Por estado, qué acciones se muestran

| Estado | Acción comprador | Acción vendedor |
|--------|-----------------|-----------------|
| `requested` | Cancelar | Aceptar / Rechazar |
| `accepted` | Cancelar | Marcar como vendida |
| `waiting_payment` | Adjuntar comprobante / Cancelar | — (esperando) |
| `payment_sent` | — (esperando validación) | Confirmar pago / Rechazar |
| `payment_rejected` | Re-adjuntar comprobante | — |
| `payment_received` | — | Generar envío |
| `waiting_shipping` | — | Ingresar Uber Flash |
| `shipped` | Confirmar recibido | — |
| `delivered` | Confirmar venta | Confirmar venta |
| `completed` | — (terminal) | — (terminal) |
| `dispute` | — (terminal, futuro) | — (terminal, futuro) |
| `rejected` | — (terminal) | — (terminal) |
| `cancelled` | — (terminal) | — (terminal) |

### Tabla `transaction_events`

Cada cambio de estado genera un **evento inmutable**. Los eventos NO guardan mensajes de chat (pueden ser cientos). Los eventos son pocos (~10 por transacción) y representan hitos.

```sql
CREATE TABLE transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tx_events_transaction ON transaction_events(transaction_id);
CREATE INDEX idx_tx_events_actor ON transaction_events(actor_id);
```

### Tipos de evento

| event_type | Cuándo ocurre |
|-----------|---------------|
| `request_created` | Comprador solicita |
| `request_accepted` | Vendedor acepta |
| `request_rejected` | Vendedor rechaza |
| `request_cancelled` | Comprador cancela |
| `payment_marked` | Vendedor marca como vendida |
| `payment_proof_uploaded` | Comprador sube SINPE |
| `payment_confirmed` | Vendedor confirma pago |
| `payment_rejected` | Vendedor rechaza comprobante |
| `shipping_initiated` | Vendedor genera envío |
| `shipped` | Vendedor ingresa código |
| `delivery_confirmed` | Comprador marca recibido |
| `transaction_completed` | Ambos confirman |
| `dispute_opened` | Alguien abre reclamo (futuro) |
| `review_submitted` | Calificación (futuro) |

### Sistema de notificaciones automático desde eventos

Las notificaciones **no se escriben a mano**. Cada `event_type` mapea automáticamente a una notificación:

| Evento | Notificación para comprador | Notificación para vendedor |
|--------|---------------------------|---------------------------|
| `request_created` | — | "Alguien quiere comprar tu [producto]" |
| `request_accepted` | "[Vendedor] aceptó tu solicitud" | — |
| `request_rejected` | "[Vendedor] rechazó tu solicitud" | — |
| `request_cancelled` | — | "[Comprador] canceló la solicitud" |
| `payment_marked` | "[Vendedor] marcó [producto] como vendido" | — |
| `payment_proof_uploaded` | — | "[Comprador] subió un comprobante" |
| `payment_confirmed` | "[Vendedor] confirmó tu pago" | — |
| `payment_rejected` | "[Vendedor] rechazó el comprobante" | — |
| `shipping_initiated` | "Envío en preparación" | — |
| `shipped` | "Tu pedido fue enviado" | — |
| `delivery_confirmed` | — | "[Comprador] confirmó recibido" |
| `transaction_completed` | "Venta completada" | "Venta completada" |
| `new_message` | "Nuevo mensaje de [vendedor]" | "Nuevo mensaje de [comprador]" |

Implementación: un trigger SQL o un hook en el backend que, al insertar un `transaction_event`, inserta automáticamente la notificación correspondiente para los implicados. Nunca escribir `INSERT INTO notifications` manualmente.

### Sistema de reputación automático desde eventos

La reputación **no se guarda en una tabla separada**. Se calcula contando eventos:

```sql
-- Ventas completadas de un vendedor
SELECT COUNT(*) FROM transaction_events
WHERE event_type = 'transaction_completed'
  AND transaction_id IN (
    SELECT id FROM transactions WHERE seller_id = :user_id
  );

-- Compras completadas de un comprador
SELECT COUNT(*) FROM transaction_events
WHERE event_type = 'transaction_completed'
  AND transaction_id IN (
    SELECT id FROM transactions WHERE buyer_id = :user_id
  );
```

Para performance, se puede crear una **vista materializada** que se refresque periódicamente. Nunca una tabla `reputations` con valores que puedan desincronizarse.

### Para qué sirve el sistema completo
- **Centro de Transacción**: línea de tiempo automática desde `transaction_events`
- **Notificaciones**: generadas automáticamente desde eventos
- **Reputación**: computada desde eventos (COUNT de `transaction_completed`)
- **Auditoría**: quién hizo qué y cuándo
- **Admin panel**: historial completo de cada transacción
- **Estadísticas**: tiempo entre estados, tasa de conversión, etc.

## Sprint 3 — Centro de Transacción / Conversaciones (PENDING)

Construido sobre la máquina de estados de Sprint 2.5.

No es una pantalla de chat. Es el **Centro de Transacción** — el lugar donde ocurre toda la compra.

### Concepto
```
┌────────────────────────────┐
 Jordan Hoodie
 ₡18,000 · Talla M
 Estado: Esperando SINPE
 ████████████████████
─────────────────────────────
 Timeline
 ✔ Solicitud enviada
 ✔ Vendedor aceptó
 ○ Pago
 ○ Envío
 ○ Entrega
─────────────────────────────
 Conversación
─────────────────────────────

 Hola. ¿Sigue disponible?

 ──────────────

 Sí.

 ──────────────

 Perfecto.

─────────────────────────────
 Acciones
 [ Adjuntar comprobante ]
 [ Cancelar compra ]
└────────────────────────────┘
```

Siempre visible arriba: producto, precio, estado, timeline.

### Sistema de conversaciones
- Conversación ligada a una `transaction` (única por transacción)
- Participantes: buyer + seller
- Último mensaje visible en lista de conversaciones
- Contador de no leídos por conversación
- Estado actual de la transaction siempre visible
- Línea de tiempo automática desde `transaction_events`
- Acciones renderizadas según estado + rol (leyendo la máquina de estados, sin ifs)

### Pendiente
- Layout tipo "Centro de Transacción" (producto + timeline + mensajes + acciones)
- Lista de conversaciones (con último mensaje y no leídos)
- Marcar mensajes como leídos (PATCH ya existe)
- Badge de no leídos en navbar / RequestsScreen
- Reemplazar ChatScreen por TransactionScreen (o coexistir durante transición)
- Botones de acción dinámicos según estado (no ifs hardcodeados)
- Sin archivos aún, sin comprobantes aún

## Sprint 4 — Pago + comprobante SINPE (PENDING)

Extiende la máquina de estados con los estados `waiting_payment` y `payment_sent`.

### Flujo
```
requested → accepted → waiting_payment
```

### Qué cambia
- Vendedor marca "Vendida" en el Centro de Transacción → estado `waiting_payment`
- Comprador puede subir screenshot de SINPE → estado `payment_sent`
- Cada transición genera un `transaction_event`

### Pendiente
- Endpoint para subir comprobante (storage + asociar a transaction)
- Botón "Adjuntar comprobante" en Centro de Transacción (solo comprador, solo estado `waiting_payment`)
- Campo `payment_proof` en transactions
- Evento: `payment_marked`, `payment_proof_uploaded`

## Sprint 5 — Validación de pago (PENDING)

Extiende la máquina de estados con `payment_received` y `payment_rejected`.

### Flujo
```
waiting_payment → payment_received | payment_rejected
```

### Qué cambia
- Vendedor revisa el comprobante
- Decide: "Pago recibido ✓" o "Pago inválido ✕"
- Si rechaza → vuelve a `waiting_payment` (puede re-subir)
- Si acepta → `payment_received`
- Nada automático. Todo manual. Eso evita fraudes.
- Cada decisión genera un `transaction_event`

### Pendiente
- Botones "Aceptar pago" / "Rechazar pago" en Centro de Transacción (solo vendedor)
- Evento: `payment_confirmed`, `payment_rejected`
- Línea de tiempo actualizada en Centro de Transacción

## Sprint 6 — Envío + Uber Flash (PENDING)

### Flujo
```
payment_received → waiting_shipping
```

### Qué cambia
- Vendedor ingresa código Uber Flash + notas de envío
- Estado pasa a `shipped`
- Cada transición genera un `transaction_event`

### Pendiente
- Campos `shipping_code`, `shipping_cost`, `shipping_notes` en transactions
- Inputs para código de guía y costo en Centro de Transacción
- Evento: `shipping_initiated`, `shipped`
- Notificación: "Tu pedido fue enviado"

## Sprint 7 — Recepción + confirmación (PENDING)

### Flujo
```
shipped → delivered → completed
```

### Qué cambia
- Comprador marca "Recibido" → estado `delivered`
- Ambos confirman (o automático tras X días) → estado `completed`
- Al completar: +1 venta, +1 compra, reputación
- Cada transición genera un `transaction_event`

### Pendiente
- Botón "Pedido recibido" (solo comprador, solo `shipped`)
- Confirmación mutua (buyer + seller)
- Trigger de reputación al completar
- Tabla `transactions` para historial
- Tabla `reputations` para score
- Score visible en cards y perfiles
- Evento: `delivery_confirmed`, `transaction_completed`

## Sprint 8 — Rediseño visual completo (PENDING)

Cuando todas las pantallas y estados del flujo de compra ya existan, rediseñar la UI completa una sola vez.

- Feed / Cards / Detail / Perfil / Conversaciones / Centro de Transacción / Pago / Envío / Confirmación
- Tipografía, espaciado, jerarquía visual, consistencia
- Mobile-first, todo responsivo

## Sistema transversal: Notificaciones

No es un sprint. Es un sistema que se construye desde ahora y se extiende en cada sprint.

### Principio
Las notificaciones **nunca se escriben manualmente**. Se generan automáticamente desde `transaction_events`. Cada `event_type` tiene un mapeo fijo a una notificación para el comprador y otra para el vendedor.

### Tabla
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'new_request', 'request_accepted', 'request_rejected',
    'new_message', 'payment_received', 'payment_rejected',
    'shipped', 'delivered', 'completed'
  )),
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Mapeo evento → notificación
| event_type | Notificación comprador | Notificación vendedor |
|-----------|----------------------|---------------------|
| `request_created` | — | "Alguien quiere comprar tu [producto]" |
| `request_accepted` | "[Vendedor] aceptó tu solicitud" | — |
| `request_rejected` | "[Vendedor] rechazó tu solicitud" | — |
| `request_cancelled` | — | "[Comprador] canceló la solicitud" |
| `payment_marked` | "[Vendedor] marcó [producto] como vendido" | — |
| `payment_proof_uploaded` | — | "[Comprador] subió un comprobante" |
| `payment_confirmed` | "[Vendedor] confirmó tu pago" | — |
| `payment_rejected` | "[Vendedor] rechazó el comprobante" | — |
| `shipping_initiated` | "Envío en preparación" | — |
| `shipped` | "Tu pedido fue enviado" | — |
| `delivery_confirmed` | — | "[Comprador] confirmó recibido" |
| `transaction_completed` | "Venta completada" | "Venta completada" |
| `new_message` | "Nuevo mensaje de [vendedor]" | "Nuevo mensaje de [comprador]" |

### Implementación
Un hook/trigger en el backend que, al insertar un `transaction_event`, inserta automáticamente la fila correspondiente en `notifications` para los implicados. No hay `INSERT INTO notifications` disperso por el código.

### Endpoints
- `GET /api/notifications` — lista de notificaciones del usuario
- `PATCH /api/notifications/:id/read` — marcar como leída
- `GET /api/notifications/unread-count` — contador para badge

## Problemas conocidos

1. **transactions RLS**: Tabla tiene RLS habilitada sin políticas. Todos los reads usan `supabaseAdmin`. Si se agregan políticas en el futuro, los reads deben volver a `supabase`.
2. **buyer join en transacciones**: `buyer_id` referencia `auth.users`, que no tiene columnas `username`/`avatar`. Para mostrar datos del comprador, hay que hacer una consulta separada a `profiles`.
3. **`/.well-known/` routing**: Vercel puede interferir con rutas que empiezan con `/.well-known/`.
4. **Rate limiters in-memory**: Se resetcan al reiniciar el servidor. No persisten entre deploys de Vercel.
5. **`checkProductSpam`**: Usa un Map en memoria, no persiste. Se pierde al reiniciar.

## Cómo correr localmente

```bash
npm install
npm start          # servidor en puerto 3000
npm run dev        # frontend Vite en puerto 5173
```

## Cómo desplegar

El deploy se hace automático desde GitHub a Vercel (rama `main`).
URL: `https://closetcr.vercel.app/`

## Cómo probar

```bash
# 1. Iniciar servidor
npm start

# 2. En otra terminal, ejecutar tests
node test-sale-requests.mjs
```
