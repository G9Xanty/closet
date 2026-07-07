# Architecture Contract — Closet

> Este documento es la Constitución del proyecto. No describe lo que Closet hace. Describe lo que **no puede hacer** y lo que **debe hacer siempre**. Ninguna persona ni modelo de IA puede violar estas reglas sin una revisión explícita de la arquitectura.

---

## 01 · Está prohibido

### ❌ Crear tablas duplicadas
No existe `reputations`, `purchase_flow`, `deals` mientras exista `transactions`. La información vive en un solo lugar.

### ❌ Duplicar estado
El estado de una transacción vive únicamente en `transactions.status`. No se replica en `products`, `profiles`, ni en variables de frontend.

### ❌ Crear otra fuente de verdad
Si un dato ya existe en `transaction_events`, no se guarda en otra tabla. Los eventos son la fuente de verdad del historial.

### ❌ Saltarse la máquina de estados
Las transiciones inválidas (ej: `REQUESTED → SHIPPED`) deben ser imposibles a nivel de backend. No basta con ocultar botones en el frontend.

### ❌ Escribir lógica de negocio en React
El frontend pregunta "¿cuál es el estado?". El backend responde. El frontend solo renderiza. No hay `if (status === 'x' && role === 'y')` en el frontend — la lógica de qué acciones son posibles vive en el backend.

### ❌ Modificar `transaction_events`
Nunca `UPDATE` ni `DELETE` en `transaction_events`. Los eventos representan historia. La historia no cambia.

### ❌ Crear notificaciones manualmente
Nunca escribir `INSERT INTO notifications` en el código. Las notificaciones nacen automáticamente desde `transaction_events` mediante un hook/trigger.

### ❌ Crear pantallas separadas para partes de una transacción
No existe "Pantalla de SINPE", "Pantalla de Uber", "Pantalla de Confirmación". Todo ocurre dentro del Centro de Transacción.

### ❌ Saltarse `transaction_id`
No existen mensajes, comprobantes ni envíos sin un `transaction_id`. Todo pertenece a una transacción.

### ❌ Agregar dependencias npm sin verificar
No se agrega una librería sin antes verificar que no está ya disponible en el proyecto o que no puede resolverse con código existente.

### ❌ Crear archivos nuevos sin necesidad
Primero intentar editar archivos existentes. Crear archivos nuevos solo cuando sea estrictamente necesario y el cambio no pueda hacerse en los archivos actuales.

### ❌ Hacer commit sin autorización explícita
Nunca hacer `git commit`, `git push`, ni crear PRs a menos que el usuario lo pida explícitamente.

---

## 02 · Es obligatorio

### ✔ Toda compra pertenece a una `transaction`
No hay solicitudes sueltas, chats huérfanos ni comprobantes sin transacción. Todo se vincula a `transaction_id`.

### ✔ Todo cambio de estado genera un evento
Cada transición en `transactions.status` produce una fila en `transaction_events` con `(transaction_id, actor_id, event_type, from_status, to_status)`.

### ✔ Toda notificación nace de un evento
Cada `transaction_event` mapea automáticamente a cero, una o dos notificaciones (según el tipo de evento y los roles). No hay notificaciones manuales.

### ✔ Todo botón de acción depende del estado
El frontend recibe `transactions.status` + `role` y renderiza las acciones válidas. No hay botones hardcodeados para estados específicos.

### ✔ Todo cambio de estado pasa por validación backend
El backend valida que la transición sea válida según la máquina de estados y que el usuario tenga el rol correcto (buyer/seller). El frontend no decide qué transiciones son válidas.

### ✔ Toda write usa `supabaseAdmin`
Todos los INSERT, UPDATE, DELETE usan el cliente service role (`supabaseAdmin`). El cliente anónimo (`supabase`) solo se usa para reads públicos (products, profiles).

### ✔ Toda consulta a `transactions` usa `supabaseAdmin`
La tabla tiene RLS habilitada sin políticas. Cualquier consulta directa debe usar `supabaseAdmin` para evitar que RLS bloquee los resultados.

### ✔ Todo endpoint público tiene rate limiting
Los endpoints de auth tienen `authLimiter` (10/15min). Los de API general tienen `apiLimiter` (60/min). Los de upload tienen `uploadLimiter` (10/min). Los de productos tienen `productLimiter` (20/hora).

### ✔ Todo dato sensible se limpia antes de enviar al cliente
Usar `publicProduct()` para productos y `publicUser()` para usuarios. Nunca enviar `storage_path`, `storage_paths`, ni metadatos internos al frontend.

### ✔ Cada módulo tiene una única responsabilidad
El módulo de productos no sabe cómo funciona SINPE. El módulo de transacciones no sabe cómo se moderan las disputas. Cada capa (Catálogo → Transacciones → Operaciones → Admin) solo conoce a la capa inferior.

---

## 03 · Flujo de trabajo

```
1. Arquitectura     — definir el diseño del sistema
2. Diseño           — especificar qué se va a implementar
3. Contrato         — verificar que no viola este documento
4. Prompt           — escribir la instrucción para implementar
5. Implementación   — OpenCode escribe el código exacto (sin decisiones creativas)
6. Auditoría        — verificar que el código respeta el contrato
7. Merge            — integrar solo después de auditoría
```

OpenCode implementa exactamente lo que se diseñó. Las decisiones arquitectónicas y de diseño las toman las personas, no el modelo.

---

## 04 · Vigencia

Este contrato entra en vigencia inmediatamente y aplica a todo el código existente y futuro. Cualquier violación detectada en el código actual debe corregirse en el próximo sprint. Si una nueva funcionalidad requiere violar una regla, primero se debe actualizar este documento y el Product Bible, con justificación explícita.
