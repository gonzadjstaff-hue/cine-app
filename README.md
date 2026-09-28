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
| `007_validar_cupon.sql` | Validación previa de cupón |
| `008_reportes.sql` | Reportes de facturación y rankings |
| `009_preventa.sql` | Precio especial de preventa por película |
| `010_canje_puntos.sql` | Canje de puntos por recompensas (productos del candy bar) |
| `011_canje_en_compra.sql` | Canje de entradas con puntos integrado a `finalizar_compra` |
| `012_auditoria_validacion.sql` | Auditoría de validación de QR en `activity_log` |
| `013_push.sql` | Suscripciones a notificaciones push |
| `014_estado_pelicula.sql` | Estado de la película derivado de la fecha de estreno |

La Edge Function `supabase/functions/notificar-estrenos` se despliega desde el panel de Supabase (Edge Functions) y necesita los secretos `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y, opcionalmente, `VAPID_SUBJECT`.

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

El log de actividad no depende de que la aplicación se acuerde de registrar. Hay triggers en la base que escriben en `activity_log` al crear una función, al modificar el precio de un producto y al validar un QR (ingreso a sala o entrega de candy), con usuario, acción y fecha. Los triggers de validación son a nivel *statement*: una validación marca todas las entradas de la orden a la vez y deja una sola fila de log por orden. El panel de admin tiene una pantalla de actividad que muestra el registro; solo un administrador puede leerlo (política RLS).

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

### El canje de puntos convive con la compra, no la duplica

El cliente pidió canjear puntos por entradas gratis o productos del candy bar, con el costo en puntos configurable por recompensa (tabla `rewards`). El canje de entradas está integrado al checkout: en el mapa de butacas un contador permite elegir cuántas de las butacas seleccionadas se canjean, y `finalizar_compra` recibe esa cantidad, valida el saldo, pone en cero las butacas más baratas (una VIP se paga, salvo que solo haya VIP) y cobra el resto con las reglas de siempre: el cupón y el crédito aplican sobre lo que queda, y los puntos se acumulan solo sobre el dinero real pagado, así que un canje no genera puntos nuevos. Los productos de candy se canjean desde "Mis compras" mediante `canjear_recompensa`. Todos los movimientos quedan en `points_ledger` con motivo `'canje'`, y la cancelación devuelve los puntos gastados además de revertir los ganados.

### El total lo calcula la base, no el navegador

El checkout no envía importes. El cliente inserta la orden con sus entradas y productos, y luego llama a `finalizar_compra`, una función `security definer` que **recalcula el subtotal desde las filas ya guardadas**, valida el cupón (vigencia, usos, primera compra, edad mínima), aplica el crédito disponible, fija los totales y acredita los puntos. Todo en una sola transacción.

Si el precio viniera del navegador, cualquiera podría comprar a cero modificando la petición. Por la misma razón, `credito` y `puntos` en `profiles` están protegidos por un trigger que impide que un usuario se los modifique: sólo las funciones internas pueden tocarlos, mediante una bandera local a la transacción.

### Los reportes agregan sin exponer

Las funciones de reporte son `security definer` y **verifican el rol adentro**: si quien llama no es administrador, cortan con excepción. Ocultar el enlace en el menú no es seguridad; alguien puede llamar a la API directamente.

El frontend usa `Promise.allSettled` en lugar de `Promise.all`: si una consulta falla, los demás paneles se cargan igual y el error indica cuál falló, en vez de dejar la pantalla en blanco.

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

### El estado de una película se deriva del estreno

Cargar a mano el estado ("cartelera" o "próximamente") además de la fecha de estreno era redundante: eran dos datos que podían contradecirse. Ahora el estado es un campo calculado en la base (la función `estado(movies)`, que PostgREST expone como una columna más): con estreno futuro la película está en Próximamente y el día del estreno pasa sola a Cartelera, sin que nadie la edite. La fecha de hoy se toma en hora argentina, porque en UTC la película cambiaría de sección tres horas antes. Lo único manual es **archivarla**, para sacarla de circulación cuando deja de proyectarse.

### Alertas de estreno con notificaciones push

El cliente pidió que el usuario pueda activar una alerta y recibir una notificación cuando la película salga a la venta. Se eligió push por sobre mail porque la app ya es una PWA: el service worker de Angular (`ngsw-worker.js`) recibe la notificación y la muestra sin código propio, y al hacer clic abre la ficha de la película. Al activar la alerta, `SwPush` pide permiso y la suscripción del navegador se guarda en `push_subscriptions` (un usuario puede tener varias: PC y celular).

El envío lo hace la Edge Function `notificar-estrenos`, que corre del lado del servidor porque firma con la clave privada VAPID, que nunca puede llegar al navegador. Se dispara al programar funciones, verifica que quien la llama sea administrador y es idempotente: solo procesa alertas pendientes de películas que ya tienen funciones a la venta, y marca `notificado = true` recién cuando la notificación llegó a al menos un navegador. Si el usuario no dio permiso, la alerta queda pendiente. Las suscripciones que el navegador dio de baja (404/410) se borran solas.

Las notificaciones solo funcionan en la versión publicada: el service worker de Angular no se registra en `ng serve`.

### Selector de fecha propio

El cliente rechazó los calendarios desplegables (adjuntó una captura) porque obligan a buscar y scrollear. `app-date-picker` (`src/app/shared/date-picker`) los reemplaza sin usar ninguna grilla de calendario:

- La fecha **se escribe** con máscara `dd/mm/aaaa`: las barras se ponen solas y se valida que la fecha exista. Para una fecha de nacimiento es lo más rápido: no hay que navegar años.
- Al **programar funciones** se ofrecen atajos de un clic para los próximos 14 días ("Hoy", "Mañana", "Mié 1/10"...), igual que los chips de horarios.
- El filtro de **funciones del día** tiene flechas para pasar de un día al siguiente.

Es un `ControlValueAccessor`, así que funciona con `formControlName` y `ngModel` sin cambios en los formularios. Se usa en programación y filtro de funciones, estreno de películas, fecha de nacimiento y rango de reportes.

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
- Reportes de administración: facturación diaria, entradas vendidas, películas más vistas de la semana y del mes, producto más vendido del candy, con gráficos y exportación a PDF y Excel
- Preventa con precio especial por película
- Sección "Mis películas" con historial visual y calificación propia
- Canje de puntos integrado al checkout (contador de entradas a canjear en el mapa de butacas) y canje de productos del candy bar desde "Mis compras"
- Log de actividad visible en el panel de admin, con auditoría de validaciones de QR
- Ventana de preventa sugerida automáticamente según `dias_preventa` de `app_config`
- Selector de fecha propio (sin depender del `<input type="date">` nativo del navegador), usado en toda la app
- Notificaciones push de estreno a quienes activaron la alerta, enviadas al programar funciones

---

## Identidad visual

Paleta definida en `src/styles.scss` con tokens CSS: fondo violáceo profundo para la barra, acento rojo butaca para las acciones, ámbar para VIP y azul para accesibles. Tipografía Outfit. Los estados de una butaca se distinguen por color y por borde, no sólo por color.
