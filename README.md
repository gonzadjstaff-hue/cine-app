# CineApp

Aplicación de venta de entradas de cine desarrollada como TP 1 de **Programación IV** (UTN FRA, 2026 C2).

- **Aplicación desplegada:** https://cine-app-five.vercel.app
- **Repositorio:** https://github.com/gonzadjstaff-hue/cine-app
- **Alumno:** Gonzalo Garcez

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Angular 22 (componentes standalone, signals, zoneless) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + RLS) |
| PWA | `@angular/pwa` (service worker + manifest) |
| PDF y QR | jsPDF + qrcode |
| Deploy | Vercel (CI automático desde `main`) |

## Cómo levantarlo

```bash
npm install
ng serve
```

Requiere `src/environments/environment.ts` con la URL y la **publishable key** del proyecto de Supabase. Esa clave es pública por diseño: la seguridad la aplican las políticas RLS, no el secreto de la clave.

Las migraciones están en `supabase/migrations/` y se aplican en orden desde el SQL Editor de Supabase:

| Archivo | Contenido |
|---|---|
| `001_schema.sql` | Tipos, 22 tablas, constraints e índices |
| `002_rls.sql` | Roles, políticas RLS, triggers de auditoría y Realtime |
| `003_seed.sql` | Datos de prueba (salas, cartelera, candy, cupones) |
| `004_disponibilidad.sql` | Disponibilidad pública de butacas |
| `005_ranking.sql` | Top 3 más vendidas y promedio de reseñas |
| `006_fidelizacion.sql` | Cupones, crédito, puntos y cancelación |

## Arquitectura

```
src/app/
  core/
    models/      interfaces del dominio
    services/    acceso a datos (supabase, auth, movies, booking, tickets, ...)
    guards/      authGuard y rolGuard
  features/
    movies/      cartelera, ficha de película, próximamente
    booking/     mapa de butacas y compra
    auth/        login y registro
    orders/      mis compras
    admin/       ABM de películas y de funciones
    staff/       validación de QR
```

Cada feature se carga con `loadComponent` (lazy loading). Los servicios son la única capa que habla con Supabase; los componentes no arman consultas.

## Perfiles de usuario

| Perfil | Puede |
|---|---|
| Anónimo | Ver cartelera, reseñas y disponibilidad. Comprar funciones sin restricción de edad |
| Cliente | Todo lo anterior, más comprar funciones restringidas, reseñar, activar alertas y ver sus compras |
| Empleado | Validar QR de entradas y entregar candy |
| Admin | ABM de películas y funciones, y todo lo anterior |

El rol vive en `profiles.rol` y se aplica en dos lugares: los `rolGuard` de Angular (experiencia de usuario) y las políticas RLS de Postgres (seguridad real). Un usuario que llame a la API directamente choca contra las políticas igual.

---

## Decisiones técnicas

### La base impide funciones superpuestas, no el frontend

Cada función guarda un rango `[inicio, fin + separación)` en una columna `tstzrange`, mantenida por un trigger que calcula `fin` a partir de la duración de la película. Sobre esa columna hay un *exclusion constraint* con `btree_gist`:

```sql
exclude using gist (room_id with =, bloque with &&)
```

Dos funciones no pueden solaparse en la misma sala aunque el frontend tenga un bug o dos administradores carguen a la vez. La separación mínima (30 minutos) sale de `app_config`, así que es configurable sin tocar código.

La asignación automática de sala (`asignar_sala`) aprovecha esto: recorre las salas activas intentando insertar y se queda con la primera que no viole el constraint. La regla no está duplicada en la aplicación.

### Una butaca no puede venderse dos veces

`order_tickets` tiene un índice único parcial sobre las entradas activas:

```sql
create unique index uq_butaca_por_funcion
  on order_tickets (showtime_id, seat_id) where activo;
```

Al cancelar una compra las entradas pasan a `activo = false`: la butaca se libera y el historial se conserva.

### Selección en tiempo real

Mientras el usuario elige butacas, cada una se reserva en `seat_locks` con vencimiento configurable. La clave primaria `(showtime_id, seat_id)` hace que dos personas no puedan bloquear la misma butaca: la segunda recibe un error de la base. Supabase Realtime notifica los cambios y el mapa se repinta en todos los navegadores abiertos.

### Disponibilidad pública sin exponer compras

`order_tickets` está protegida por RLS, así que un visitante anónimo no puede leer entradas ajenas. Pero la disponibilidad de una sala tiene que ser pública. Se resuelve con funciones `security definer` que devuelven únicamente el dato agregado:

- `butacas_ocupadas(showtime_id)` → qué butacas están tomadas
- `peliculas_mas_vendidas(limite)` → ranking por cantidad de entradas

Ninguna revela a quién pertenece la compra. El mismo criterio se aplica en todo el proyecto: se expone el agregado, no la fila.

### Auditoría automática

El log de actividad no depende de que la aplicación se acuerde de registrar. Hay triggers en la base que escriben en `activity_log` al crear una función y al modificar el precio de un producto, con usuario, acción y fecha.

---

## Decisiones de producto

Estas son interpretaciones del pedido del cliente, que en varios puntos era ambiguo o contradictorio.

### Un QR, dos canjes independientes

El enunciado pide que el mismo QR sirva para la entrada y para el candy bar, y que "deje de funcionar" una vez usado. Leído literalmente, el primer empleado que escanea dejaría al cliente sin candy.

Se implementó un único código por compra, con estado de canje **por ítem**: `order_tickets.canjeado_at` y `order_products.canjeado_at`. El empleado de la puerta marca el ingreso, el del candy entrega los productos, y cada cosa queda inutilizada por separado sin afectar a la otra.

### Las funciones restringidas exigen cuenta

El cliente pide permitir compras anónimas y, a la vez, impedir la compra a menores de 13 o 18 años. A un comprador anónimo no hay forma de verificarle la edad.

Criterio adoptado: el anónimo compra libremente las funciones sin restricción; para las +13 y +18 se exige iniciar sesión, donde la fecha de nacimiento ya está registrada. Toda entrada de función restringida lleva impresa la leyenda de adulto responsable.

### Los puntos se otorgan sobre dinero real

"1 punto por cada peso gastado" no aclara qué pasa con lo pagado con crédito o con puntos canjeados. Si contaran, un usuario podría reciclar puntos indefinidamente. Se computan solo sobre el importe efectivamente abonado (`orders.pagado_real`).

### El total lo calcula la base, no el navegador

El checkout no envía importes. El cliente inserta la orden con sus entradas y productos, y luego llama a `finalizar_compra`, una función `security definer` que **recalcula el subtotal desde las filas ya guardadas**, valida el cupón (vigencia, usos, primera compra, edad mínima), aplica el crédito disponible, fija los totales y acredita los puntos. Todo en una sola transacción.

Si el precio viniera del navegador, cualquiera podría comprar a cero modificando la petición. Por la misma razón, `credito` y `puntos` en `profiles` están protegidos por un trigger que impide que un usuario se los modifique: sólo las funciones internas pueden tocarlos, mediante una bandera local a la transacción.

### La cancelación devuelve crédito, no dinero

`cancelar_compra` verifica que falten al menos 2 horas para la función (configurable en `app_config`), desactiva las entradas —lo que libera las butacas sin borrar el historial—, acredita el importe en la cuenta del usuario y revierte los puntos que esa compra había otorgado.

### Datos de registro: objeción al requerimiento

El cliente solicitó recopilar tipo de sangre, color de ojos y cantidad anual de días de vacaciones, describiéndolos como "nada muy invasivo". **Se implementó el registro sin esos campos.**

- El **tipo de sangre** es un dato de salud y constituye dato sensible según la Ley 25.326 de Protección de Datos Personales. Su tratamiento exige consentimiento expreso y una finalidad legítima que una venta de entradas no tiene.
- El **color de ojos** es un dato descriptivo sin utilidad para el negocio.
- Los **días de vacaciones** son información laboral, ajena a la relación comercial.

Ninguno participa de ninguna regla de negocio: no afectan precio, disponibilidad, restricción por edad, fidelización ni reportes. Recolectarlos sólo agregaría exposición legal y superficie de riesgo ante una filtración, sin contrapartida funcional.

Se conserva la **fecha de nacimiento**, que sí es necesaria: habilita las restricciones por edad y los cupones para mayores de 50 años.

Las columnas correspondientes se mantienen en la base como *nullable*, de modo que la decisión sea reversible sin migración si el cliente ratifica el pedido por escrito y define una finalidad legítima.

### Salas

El enunciado describe 20 filas de 4 + 20 + 4 butacas, y luego indica que las filas J y K se reemplazan por butacas accesibles de 2 + 10 + 2. Se interpretó que **ambas filas** pasan a ser accesibles, según lo entregado en el documento de requerimientos. Resultado por sala: 15 filas normales, 2 accesibles y 3 VIP (R, S y T), **532 butacas**.

El recargo VIP es configurable en `app_config` y se calcula sobre el precio base de cada función.

### Pago simulado

No hay pasarela de pago real. La confirmación de compra registra la orden como pagada sin procesar un cobro, lo que está fuera del alcance de la materia.

### Fuera de alcance

La pantalla con el **mapa del cine** que indica la ubicación de la sala se documenta como requerimiento pendiente: la propia fuente aclara que no cuenta con aprobación.

---

## Estado de avance

**Implementado**

- Cartelera con buscador y filtro por género, top 3 más vendidas
- Ficha de película con reseñas, puntuación promedio y funciones agrupadas por día
- Próximamente con alertas de estreno
- Registro, login, perfiles y guards por rol
- ABM de películas con géneros, estado y destacadas
- Programación de funciones con asignación automática de sala
- Mapa de butacas en tiempo real, con tipos normal, accesible y VIP
- Compra de entradas y candy bar con combos
- PDF de entrada con QR
- Validación de QR por empleados, con canje independiente de entrada y candy
- Historial de compras con saldo de crédito y puntos
- Cupones (primera compra y mayores de 50), cancelación con crédito y acreditación de puntos

**Pendiente**

- Canje de puntos por entradas y productos
- Reportes de facturación con gráficos y exportación a PDF y Excel
- Preventa con precio especial
- Sección "Mis películas"
- Notificaciones push de estrenos

---

## Identidad visual

Paleta definida en `src/styles.scss` con tokens CSS: fondo violáceo profundo para la barra, acento rojo butaca para las acciones, ámbar para VIP y azul para accesibles. Tipografía Outfit. Los estados de una butaca se distinguen por color y por borde, no sólo por color.
