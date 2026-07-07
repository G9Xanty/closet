# Closet — Product Bible

> Documento vivo del producto. Última actualización: Julio 2026.

---

## 01 · Visión

Closet es un marketplace peer-to-peer de ropa usada en Costa Rica. El objetivo es facilitar la compra y venta de prendas entre personas — sin comisiones, sin intermediarios, con herramientas modernas.

### Propósito

Que cualquier persona en Costa Rica pueda vender ropa desde su clóset y comprar prendas de otras personas con confianza, dentro de una plataforma diseñada específicamente para este mercado.

### No es

- No es una tienda en línea.
- No es Instagram con etiquetas.
- No es un CRM de WhatsApp.

### Es

- Un flujo completo de compra-venta entre pares.
- Un sistema de reputación construido sobre transacciones reales.
- Una plataforma hecha a la medida del mercado tico.

---

## 02 · Filosofía

### Principios

1. **Primero el flujo, después la UI.** Cada pantalla y cada estado debe existir antes de rediseñar. Así el diseño se hace una sola vez sobre un producto consolidado.

2. **Transaccional por encima de social.** Closet no es una red social. Es una herramienta para completar ventas. Cada funcionalidad debe acercar a las personas a cerrar una transacción.

3. **Sin atajos externos.** No hay WhatsApp, no hay links externos, no hay placeholders que dependan de internet. Toda la comunicación y validación ocurre dentro de la app.

4. **Backend robusto, frontend pragmático.** El backend es la fuente de verdad. El frontend es liviano y se comunica exclusivamente vía API.

5. **La reputación lo es todo.** En un mercado P2P, la confianza es la moneda. El sistema de reputación debe basarse en transacciones completadas, no en votos anónimos.

6. **Mobile-first desde el día uno.** El 100% de los usuarios en Costa Rica usan el celular para comprar y vender.

---

## 03 · Flujo del usuario

```
Home (Feed)
  │
  ├──→ Clic en card → Detalle del producto
  │                      │
  │                      └──→ "Me interesa"
  │                              │
  │                              └──→ Crear solicitud → Centro de Transacción
  │                                              │
  │                                              ├── Comprador cancela → Fin
  │                                              ├── Vendedor rechaza → Fin
  │                                              └── Vendedor acepta
  │                                                      │
  │                                                      └── Conversación activa
  │                                                              │
  │                                                              ├── Vendedor: "Marcar como vendida"
  │                                                              │       ↓
  │                                                              │   waiting_payment
  │                                                              │       ↓
  │                                                              │   Comprador: sube SINPE
  │                                                              │       ↓
  │                                                              │   Vendedor: confirma pago ✓
  │                                                              │   Vendedor: rechaza pago ✕ → re-subir
  │                                                              │       ↓
  │                                                              │   Vendedor: envía por Uber Flash
  │                                                              │       ↓
  │                                                              │   Comprador: "Recibido"
  │                                                              │       ↓
  │                                                              └── Ambos confirman
  │                                                                      ↓
  │                                                                 Venta completada
  │                                                                      ↓
  │                                                            +1 venta, +1 compra, +1 reputación
  │
  ├──→ Perfil
  │       ├── Prendas publicadas
  │       ├── Prendas vendidas
  │       └── Reputación
  │
  └──→ Solicitudes
          ├── Recibidas (como vendedor)
          └── Enviadas (como comprador)
```

### Pantallas del sistema

| Pantalla | Ruta (screen) | Propósito |
|----------|--------------|-----------|
| Feed | `feed` | Catálogo de prendas disponibles |
| Detalle | `detail` | Info completa de una prenda + "Me interesa" |
| Perfil | `profile` | Perfil público del usuario |
| Editar perfil | `edit-profile` | Configuración de perfil propio |
| Solicitudes | `requests` | Solicitudes recibidas y enviadas |
| Centro de Transacción | `transaction` | Conversación + producto + estado + acciones de compra |
| Chat (legacy) | `chat` | Chat básico (transición, reemplazar por Centro de Transacción) |
| Publicar | `upload-product` | Formulario de nueva prenda |
| Auth | `auth` | Login / Registro |

---

## 04 · Estados de una venta

### Estados de sale_request

| Estado | Quién lo setea | Descripción |
|--------|---------------|-------------|
| `requested` | Sistema | Comprador hizo clic en "Me interesa" |
| `accepted` | Vendedor | Vendedor acepta negociar |
| `rejected` | Vendedor | Vendedor rechaza la solicitud |
| `cancelled` | Comprador | Comprador cancela antes de aceptar |
| `waiting_payment` | Vendedor | Vendió, espera comprobante SINPE |
| `payment_sent` | Comprador | Subió screenshot del SINPE |
| `payment_received` | Vendedor | Confirmó que el pago llegó |
| `payment_rejected` | Vendedor | Rechazó el comprobante (vuelve a waiting_payment) |
| `waiting_shipping` | Sistema | Pago confirmado, esperando datos de envío |
| `shipped` | Vendedor | Ingresó código Uber Flash |
| `delivered` | Comprador | Marcó "Recibido" |
| `completed` | Ambos | Venta finalizada |
| `dispute` | Cualquiera | Reclamo abierto (futuro, no implementado) |

### Estados del producto

| Estado | Descripción |
|--------|-------------|
| `disponible` | Visible en el feed, cualquiera puede solicitar |
| `reserved` | Alguien ya solicitó, temporalmente bloqueado |
| `sold` | Venta completada, oculto del feed |
| `hidden` | Oculto por admin (usuario baneado) |

### Reglas de transición

- `disponible` → `reserved`: cuando se crea una sale_request (cualquier estado excepto `cancelled`/`rejected`)
- `reserved` → `disponible`: cuando la sale_request pasa a `cancelled` o `rejected`
- `reserved` → `sold`: cuando la venta se completa (ambos confirman)

### Máquina de estados (sale_request)

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

 Desde cualquier estado activo (no terminal):
 ┌───────────┐
 │  DISPUTE  │  terminal (futuro: reclamo abierto)
 └───────────┘
```

### Por estado, acciones disponibles

| Estado | Comprador | Vendedor |
|--------|-----------|----------|
| `requested` | Cancelar | Aceptar / Rechazar |
| `accepted` | Cancelar | Marcar como vendida |
| `waiting_payment` | Adjuntar SINPE / Cancelar | — (esperando) |
| `payment_sent` | — | Confirmar / Rechazar |
| `payment_rejected` | Re-adjuntar SINPE | — |
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
```

**Tipos de evento:** `request_created`, `request_accepted`, `request_rejected`, `request_cancelled`, `payment_marked`, `payment_proof_uploaded`, `payment_confirmed`, `payment_rejected`, `shipping_initiated`, `shipped`, `delivery_confirmed`, `transaction_completed`, `dispute_opened`, `review_submitted`.

### Sistema de notificaciones automático desde eventos

Las notificaciones **nunca se escriben manualmente**. Se generan automáticamente desde `transaction_events`. Cada `event_type` tiene un mapeo fijo:

| Evento | Notificación comprador | Notificación vendedor |
|--------|----------------------|---------------------|
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

Implementación: un trigger SQL o hook en el backend que, al insertar un `transaction_event`, inserta automáticamente la notificación para los implicados. Nunca `INSERT INTO notifications` manualmente.

### Sistema de reputación desde eventos

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

Para performance, se puede crear una vista materializada que se refresque periódicamente. Nunca una tabla `reputations` con valores que puedan desincronizarse.

---

## 05 · Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser (React + Vite)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐   │
│  │ Feed     │ │ Detail   │ │ Chat     │ │ Requests      │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬────────┘   │
│       │            │            │               │            │
│       └────────────┴─────┬──────┴───────────────┘            │
│                          │                                   │
│                    ┌─────┴──────┐                            │
│                    │ api(client) │  ← Inyecta Bearer token   │
│                    └─────┬──────┘                            │
└──────────────────────────┼───────────────────────────────────┘
                           │ HTTP / JSON
┌──────────────────────────┼───────────────────────────────────┐
│                    ┌─────┴──────┐                            │
│                    │  Express   │  api/server.cjs            │
│                    │  :3000     │                            │
│                    └─────┬──────┘                            │
│                          │                                   │
│              ┌───────────┴────────────┐                      │
│              │                        │                      │
│     ┌────────┴────────┐     ┌────────┴────────┐             │
│     │   supabaseAdmin │     │   supabase      │             │
│     │  (service role) │     │  (anon key)     │             │
│     │  writes + reads │     │  reads only     │             │
│     └────────┬────────┘     └────────┬────────┘             │
│              │                        │                      │
│              └───────────┬────────────┘                      │
│                          │                                   │
│                    ┌─────┴──────┐                            │
│                    │  Supabase  │                            │
│                    │  Postgres  │                            │
│                    │  Storage   │                            │
│                    │  Auth      │                            │
│                    │  Realtime  │                            │
│                    └────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

### Capas del sistema

```
┌──────────────────────────────────────────────────┐
│                    CATÁLOGO                       │
│   Products · Profiles · Feed · Búsqueda          │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│                  TRANSACCIONES                    │
│   transactions · transaction_events              │
│   messages · notifications                       │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│                  OPERACIONES                      │
│   SINPE · Uber Flash · Reputación                │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│                   ADMIN                           │
│   Moderación · Disputas · Auditoría              │
│   Estadísticas                                   │
└──────────────────────────────────────────────────┘
```

Cada capa solo conoce la capa inferior, nunca al revés. El catálogo no sabe cómo funciona SINPE. Las transacciones no saben cómo se moderan las disputas.

### Decisiones arquitectónicas clave

- **Backend monolítico, single-file**: `api/server.cjs` (~1570 líneas) contiene todo. Simple de desplegar en Vercel como serverless.
- **Dos clientes de Supabase**: `supabaseAdmin` (service role) para writes, `supabase` (anon key) para reads públicas. Esto evita RLS bugs.
- **Sin React Router**: navegación por estado global (`Screen` type + `ViewportContent.tsx`). Suficiente para el alcance actual.
- **Realtime vía Supabase**: canales `messages:{sale_request_id}` para recibir mensajes en vivo. Sin WebSocket propio.
- **Rate limiting in-memory**: authLimiter (10/15min), apiLimiter (60/min), etc. Se resetean al reiniciar.

---

## 06 · Base de datos

### Tablas actuales

| Tabla | Propósito | RLS |
|-------|-----------|-----|
| `profiles` | Datos públicos del usuario | Sí (select público, insert/update propio) |
| `products` | Prendas publicadas | Sí (select público, insert/update propio) |
| `transactions` | Transacciones de compra-venta | Sí (sin políticas — todas las ops con supabaseAdmin) |
| `messages` | Mensajes de chat | No (todas las ops con supabaseAdmin) |
| `reviews` | Reseñas de productos | No implementado |
| `reports` | Reportes de usuarios/productos | No |
| `admin_audit_log` | Log de acciones de admin | No |

### Columnas de productos

```sql
id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
title           TEXT NOT NULL DEFAULT ''
description     TEXT
price           NUMERIC NOT NULL DEFAULT 0
category        TEXT DEFAULT 'otros'
size            TEXT DEFAULT ''
brand           TEXT DEFAULT ''
condition       TEXT DEFAULT 'good'
status          TEXT DEFAULT 'disponible'
image_url       TEXT DEFAULT ''
image_url_2     TEXT DEFAULT ''
image_url_3     TEXT DEFAULT ''
image_url_4     TEXT DEFAULT ''
images          JSONB DEFAULT '[]'::jsonb
storage_path    TEXT DEFAULT ''
storage_paths   JSONB DEFAULT '[]'::jsonb
seller_phone    TEXT DEFAULT ''
show_phone      BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ DEFAULT NOW()
```

### Columnas de sale_requests

```sql
id              UUID DEFAULT gen_random_uuid() PRIMARY KEY
product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE
buyer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
seller_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
status          TEXT DEFAULT 'requested'
created_at      TIMESTAMPTZ DEFAULT NOW()
updated_at      TIMESTAMPTZ DEFAULT NOW()
```

### Convención de migrations

- Una migración por sprint.
- Usar `ALTER TABLE ADD COLUMN IF NOT EXISTS` para columnas nuevas.
- Ejecutar manualmente en Supabase SQL Editor (no hay migración automática).
- La migración debe ser idempotente (se puede re-ejecutar sin errores).

---

## 07 · UI Guidelines

### Estado actual (pre-rediseño)

Closet está en una fase funcional, no visual. El tema actual es **retro/cyberpunk** con:

- Fondo oscuro (#0a0a0f)
- Acento cian (#00ffff)
- Tipografía `Press Start 2P` (monospace pixelada)
- Tarjetas con bordes sutiles y efecto glassmorphism

### Pendiente para Sprint 7 (rediseño completo)

Cuando todas las pantallas y estados existan, rediseñar:

- Consistencia entre todas las pantallas
- Tipografía legible para cuerpo de texto (reservar Press Start 2P solo para títulos o branding)
- Jerarquía visual clara (qué es primario, qué es secundario)
- Espaciado generoso entre elementos
- Imágenes protagonistas (~65-70% de la card)
- Badges de estado visibles (no perderse en el fondo)
- Diseño mobile-first, responsivo
- Paleta de color que refleje el mercado tico (cálida, natural)

### Lo que NO cambiará

- Sin React Router
- Sin librerías UI externas
- CSS en un solo archivo (`src/styles/screens.css`)
- Animaciones sutiles, no intrusivas

---

## 08 · Principios Inmutables

Reglas de arquitectura. Si una nueva funcionalidad rompe alguna, primero replantear el diseño.

### 1. Una única fuente de verdad
Cada dato tiene un solo lugar donde vive:
- Estado de la compra → `transactions.status`
- Historial → `transaction_events`
- Conversación → `messages`
- Perfil → `profiles`
- Producto → `products`

Nunca duplicar información.

### 2. Los eventos nunca se modifican
`transaction_events` es un log. Nunca `UPDATE` ni `DELETE`. Los eventos representan historia. La historia no cambia.

### 3. El estado actual sí cambia
Solo una entidad cambia continuamente: `transactions.status`. Todo lo demás se deriva de ahí.

### 4. Toda acción genera un evento
Aceptar → `transaction_event`. Enviar SINPE → `transaction_event`. Cancelar → `transaction_event`. Confirmar entrega → `transaction_event`. Nunca acciones invisibles.

### 5. Nada importante ocurre sin una transacción
No existen mensajes aislados, comprobantes aislados ni envíos aislados. Todo pertenece a un `transaction_id`.

### 6. El frontend nunca decide la lógica
El frontend pregunta "¿qué estado tiene esta transacción?". El backend responde. El frontend solo renderiza.

### 7. El backend valida todas las transiciones
No cualquier estado puede pasar a cualquier otro. `REQUESTED → ACCEPTED → WAITING_PAYMENT → ...` pero nunca `REQUESTED → SHIPPED`. Eso debe ser imposible en backend.

### 8. Todo debe poder auditarse
Si un usuario dice "nunca envié ese comprobante", debe existir un evento. Si dice "nunca acepté", debe existir un evento. Todo queda registrado.

### 9. Los módulos nunca conocen módulos innecesarios
`Products` no sabe cómo funciona SINPE ni Uber. Solo sabe `status = reserved`.

### 10. El Centro de Transacción es el único lugar donde vive una compra
No hay pantalla separada para SINPE, Uber, Chat ni Confirmar. Todo ocurre dentro del mismo Centro de Transacción.

---

## 09 · Roadmap

### Completado

| Sprint | Descripción | Estado |
|--------|-------------|--------|
| 0 | Auth, productos, perfiles, upload | ✅ |
| 1 | Sale requests (reemplazo de WhatsApp) | ✅ |
| 1.5 | Limpieza de BD + placeholders | ✅ |
| 2 | Card redesign + chat en vivo | ✅ |

### Pendiente (orden de implementación)

| Sprint | Descripción | Prioridad |
|--------|-------------|-----------|
| 2.5 | Máquina de estados + `transaction_events` + `transactions` (rename) | 🔜 |
| 3 | Centro de Transacción / Conversaciones | 🔜 |
| 4 | Pago + comprobante SINPE | ⏳ |
| 5 | Validación de pago (aceptar/rechazar) | ⏳ |
| 6 | Envío (Uber Flash) | ⏳ |
| 7 | Recepción + confirmación + reputación | ⏳ |
| 8 | Rediseño visual completo | 🎨 |

### Sistema transversal
| Sistema | Descripción |
|---------|-------------|
| Notificaciones | Auto-generadas desde `transaction_events` — nunca escritas manualmente |
| Reputación | Computada desde eventos (COUNT de `transaction_completed`) — sin tabla separada |

### Verticales de desarrollo

A partir de aquí, cada sprint debería entregar una **vertical completa** — una funcionalidad que se pueda probar de principio a fin:

| Vertical | Descripción |
|----------|-------------|
| 1 | Transacción completa (solicitud → pago → envío → reputación) |
| 2 | Vendedor (publicar, gestionar, responder solicitudes) |
| 3 | Comprador (buscar, negociar, comprar, confirmar) |
| 4 | Administración (moderar, validar, resolver disputas) |

Cada vertical integra todas las capas: catálogo → transacciones → operaciones → interfaz. Esto evita entregar piezas aisladas y asegura que cada sesión deje una parte realmente terminada.

---

## 10 · Decisiones técnicas

### Por qué dos clientes de Supabase

La tabla `transactions` tiene RLS habilitada sin políticas. Si se usara el cliente anónimo (`supabase`), cualquier consulta a `sale_requests` devolvería 0 filas (RLS bloquea todo). Usando `supabaseAdmin` (service role key) se bypass RLS completamente.

Para reads públicos (products, profiles) se usa `supabase` (anon key) porque las políticas RLS permiten SELECT público.

### Por qué las writes usan supabaseAdmin

Aunque el frontend envía el token del usuario autenticado, el backend siempre usa `supabaseAdmin` para INSERT/UPDATE/DELETE. Esto elimina la necesidad de depender de políticas RLS para writes y centraliza la validación en el backend.

### Por qué no React Router

El alcance actual (menos de 10 pantallas) no justifica las dependencias ni la complejidad de React Router. Un switch sobre un tipo `Screen` es suficiente y más fácil de mantener. Si Closet crece a 20+ pantallas, se migrará.

### Por qué los placeholders fallaron

El servicio `via.placeholder.com` dejó de responder desde ciertas redes. Los test products usaban este servicio. **Solución**: migrar a data URIs inline en tests (`data:image/svg+xml,...`).

### Por qué no hay tests de frontend

El frontend es mayormente presentacional. La lógica de negocio crítica está en el backend, donde los tests (`test-sale-requests.mjs`) cubren los 16 escenarios principales. Si se agregan tests de frontend en el futuro, sería con Playwright o Cypress para flujos E2E.

### Por qué "Centro de Transacción" y no "Chat"

El chat tradicional (WhatsApp, Messenger) es genérico: muestra un historial de mensajes sin contexto transaccional. El Centro de Transacción de Closet muestra **siempre**:
- El producto involucrado (nombre, precio, imagen)
- El estado actual de la venta
- Los botones de acción disponibles según el rol y estado
- El progreso de la transacción

Esto evita el problema clásico de los marketplaces P2P donde el comprador pregunta "¿sigue disponible?" aunque ya está en una conversación activa.

### Por qué una máquina de estados

Cada `transaction` tiene un estado único que determina:
- Qué acciones son posibles (según buyer/seller)
- Qué UI se renderiza
- Qué eventos se registran
- Qué notificaciones se disparan

En lugar de ifs desperdigados por la UI (`if status === 'x' && role === 'y'`), el frontend recibe el estado y consulta una tabla de transiciones válidas. Agregar un nuevo estado no requiere reescribir lógica existente — solo definir sus transiciones y la UI correspondiente.

### Por qué `transaction_events` como tabla separada

No es un log. Es la fuente de verdad de todo lo que ocurrió en una transacción. Sirve para:
- **Línea de tiempo automática** en el Centro de Transacción
- **Notificaciones**: cada evento puede disparar una notificación
- **Auditoría**: quién hizo qué y cuándo
- **Admin panel**: historial completo
- **Reputación**: se calcula desde los eventos (no desde tablas separadas)
- **Estadísticas**: tiempo entre estados, tasa de conversión

### Por qué notificaciones desde el inicio

Las notificaciones no son un sprint porque no hay un "momento" para construirlas. Cada sprint agrega nuevos estados, y cada estado nuevo necesita una notificación. Si se construyen desde el principio, solo se agregan filas a la tabla `type` CHECK constraint en cada sprint.

### Límites del sistema de transacciones

A partir de este punto, todo nuevo módulo debe responder:

> **¿Pertenece al sistema de transacciones?**

Si la respuesta es **sí**, debe integrarse con:
- `transactions` — tabla de transacciones
- `transaction_events` — eventos inmutables
- `notifications` — notificaciones automáticas desde eventos
- `messages` — mensajes del chat
- La máquina de estados

Si la respuesta es **no**, probablemente pertenece a otro sistema:
- **Catálogo**: productos, categorías, búsqueda, feed
- **Perfil**: usuarios, reputación, estadísticas
- **Administración**: panel admin, reportes, gestión de usuarios
- **Infraestructura**: auth, storage, deploy

Esta disciplina evita lógica duplicada y flujos difíciles de mantener.

---

## 11 · Ideas futuras

Estas ideas están fuera del roadmap actual pero se han mencionado:

- **Notificaciones push**: push nativas para nuevos mensajes y cambios de estado (más allá del sistema in-app actual).
- **Categorías visuales**: navegación del feed por tipo de prenda (vestidos, camisas, zapatos, etc.).
- **Búsqueda avanzada**: filtros por talla, rango de precio, ubicación.
- **Favoritos / Wishlist**: guardar prendas para después.
- **Modo oscuro / claro**: el tema actual es oscuro; ofrecer alternativas.
- **Pago integrado**: procesar pagos dentro de la app (SINPE móvil automatizado, transferencia bancaria).
- **Códigos de talla CR**: normalizar tallas al estándar costarricense.
- **Modo tienda**: perfiles mejorados para vendedores frecuentes con estadísticas y personalización.
- **Compartir en redes**: generar cards para compartir en WhatsApp, Instagram.
- **Multi-idioma**: español + inglés.
- **Gestión de inventario**: para vendedores con múltiples prendas.
- **Historial de precios**: mostrar si el precio bajó.
- **Reportes de la comunidad**: sistema de reportes por usuario/producto con moderación.

---

> Este documento es dinámico. Se actualiza cada vez que se completa un sprint o se toma una decisión arquitectónica significativa.
>
> El **Architecture Contract** (`architecture-contract.md`) es la Constitución del proyecto y complementa a este documento con prohibiciones y obligaciones vinculantes.
