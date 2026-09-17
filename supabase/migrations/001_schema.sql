-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Modelo de datos - Aplicacion de cine
-- Alumno: Gonzalo Garcez
-- Archivo 1 de 3: esquema (tipos, tablas, reglas de integridad)
-- ============================================================

create extension if not exists btree_gist;

-- ============================================================
-- 1. TIPOS
-- ============================================================

create type user_role       as enum ('cliente', 'empleado', 'admin');
create type age_rating      as enum ('atp', 'plus13', 'plus18');
create type movie_status    as enum ('cartelera', 'proximamente', 'archivada');
create type seat_type       as enum ('normal', 'accesible', 'vip');
create type film_format     as enum ('2D', '3D', '4D', '5D');
create type language_type   as enum ('castellano', 'subtitulado');
create type order_status    as enum ('pendiente', 'pagada', 'cancelada');
create type ledger_reason   as enum ('compra', 'canje', 'cancelacion', 'ajuste');

-- ============================================================
-- 2. CONFIGURACION GLOBAL
-- ============================================================

create table app_config (
  clave       text primary key,
  valor       jsonb not null,
  descripcion text,
  updated_at  timestamptz not null default now()
);

insert into app_config (clave, valor, descripcion) values
  ('cupon_primera_compra_pct', '10',  'Porcentaje de descuento del cupon de primera compra'),
  ('recargo_vip_pct',          '50',  'Recargo porcentual sobre el precio base para butacas VIP'),
  ('puntos_por_peso',          '1',   'Puntos otorgados por cada peso de dinero real pagado'),
  ('minutos_bloqueo_butaca',   '8',   'Minutos que una butaca queda reservada durante el checkout'),
  ('minutos_entre_funciones',  '30',  'Separacion minima entre el fin de una funcion y el inicio de la siguiente'),
  ('horas_limite_cancelacion', '2',   'Horas antes de la funcion hasta las que se permite cancelar'),
  ('dias_preventa',            '7',   'Dias de anticipacion con que se habilita la preventa');

-- ============================================================
-- 3. USUARIOS Y PERFILES
-- ============================================================

create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  nombre           text not null,
  apellido         text not null,
  fecha_nacimiento date not null,
  tipo_sangre      text,
  color_ojos       text,
  dias_vacaciones  integer check (dias_vacaciones >= 0),
  rol              user_role not null default 'cliente',
  credito          numeric(10,2) not null default 0 check (credito >= 0),
  puntos           integer not null default 0 check (puntos >= 0),
  primera_compra   boolean not null default true,
  created_at       timestamptz not null default now()
);

create index idx_profiles_rol on profiles (rol);

create or replace function edad_de(p_fecha_nacimiento date)
returns integer
language sql
immutable
as $$
  select extract(year from age(current_date, p_fecha_nacimiento))::integer;
$$;

-- ============================================================
-- 4. PELICULAS Y GENEROS
-- ============================================================

create table genres (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table movies (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  poster_url        text,
  duracion_min      integer not null check (duracion_min > 0),
  sinopsis          text not null,
  clasificacion     age_rating not null default 'atp',
  estado            movie_status not null default 'cartelera',
  fecha_estreno     date not null,
  destacada_home    boolean not null default false,
  preventa_activa   boolean not null default false,
  preventa_inicio   timestamptz,
  preventa_fin      timestamptz,
  preventa_precio   numeric(10,2) check (preventa_precio >= 0),
  created_at        timestamptz not null default now(),
  constraint preventa_coherente check (
    not preventa_activa
    or (preventa_inicio is not null
        and preventa_fin is not null
        and preventa_fin > preventa_inicio
        and preventa_precio is not null)
  )
);

create index idx_movies_estado on movies (estado);
create index idx_movies_destacada on movies (destacada_home) where destacada_home;

create table movie_genres (
  movie_id uuid not null references movies(id) on delete cascade,
  genre_id uuid not null references genres(id) on delete cascade,
  primary key (movie_id, genre_id)
);

-- ============================================================
-- 5. SALAS Y BUTACAS
-- ============================================================

create table rooms (
  id      uuid primary key default gen_random_uuid(),
  numero  integer not null unique,
  nombre  text not null,
  activa  boolean not null default true
);

create table seats (
  id       uuid primary key default gen_random_uuid(),
  room_id  uuid not null references rooms(id) on delete cascade,
  fila     char(1) not null,
  bloque   smallint not null check (bloque between 1 and 3),
  numero   smallint not null check (numero > 0),
  tipo     seat_type not null default 'normal',
  unique (room_id, fila, bloque, numero)
);

create index idx_seats_room on seats (room_id);

-- Genera la distribucion completa de una sala:
-- 20 filas (A..T) en 3 bloques.
-- Filas J y K: accesibles, bloques de 2 / 10 / 2.
-- Filas R, S y T: VIP, bloques de 4 / 20 / 4.
-- Resto: normales, bloques de 4 / 20 / 4.
create or replace function generar_butacas(p_room_id uuid)
returns integer
language plpgsql
as $$
declare
  v_filas  text[] := array['A','B','C','D','E','F','G','H','I','J',
                           'K','L','M','N','O','P','Q','R','S','T'];
  v_fila   text;
  v_bloque integer;
  v_numero integer;
  v_tipo   seat_type;
  v_cant   integer[];
  v_total  integer := 0;
begin
  foreach v_fila in array v_filas loop
    if v_fila in ('J', 'K') then
      v_tipo := 'accesible';
      v_cant := array[2, 10, 2];
    elsif v_fila in ('R', 'S', 'T') then
      v_tipo := 'vip';
      v_cant := array[4, 20, 4];
    else
      v_tipo := 'normal';
      v_cant := array[4, 20, 4];
    end if;

    for v_bloque in 1..3 loop
      for v_numero in 1..v_cant[v_bloque] loop
        insert into seats (room_id, fila, bloque, numero, tipo)
        values (p_room_id, v_fila, v_bloque, v_numero, v_tipo)
        on conflict do nothing;
        v_total := v_total + 1;
      end loop;
    end loop;
  end loop;

  return v_total;
end;
$$;

-- ============================================================
-- 6. FUNCIONES (SHOWTIMES)
-- ============================================================

create table showtimes (
  id          uuid primary key default gen_random_uuid(),
  movie_id    uuid not null references movies(id) on delete restrict,
  room_id     uuid not null references rooms(id) on delete restrict,
  inicio      timestamptz not null,
  fin         timestamptz not null,
  bloque      tstzrange not null,
  formato     film_format not null default '2D',
  idioma      language_type not null default 'castellano',
  precio_base numeric(10,2) not null check (precio_base >= 0),
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint fin_posterior_a_inicio check (fin > inicio)
);

-- Calcula fin y bloque a partir de la duracion de la pelicula
-- y de la separacion minima configurada.
create or replace function set_showtime_bloque()
returns trigger
language plpgsql
as $$
declare
  v_duracion integer;
  v_margen   integer;
begin
  select duracion_min into v_duracion
  from movies where id = new.movie_id;

  if v_duracion is null then
    raise exception 'La pelicula % no existe', new.movie_id;
  end if;

  select (valor #>> '{}')::integer into v_margen
  from app_config where clave = 'minutos_entre_funciones';

  v_margen := coalesce(v_margen, 30);

  new.fin    := new.inicio + (v_duracion * interval '1 minute');
  new.bloque := tstzrange(new.inicio, new.fin + (v_margen * interval '1 minute'), '[)');

  return new;
end;
$$;

create trigger trg_showtime_bloque
before insert or update of inicio, movie_id on showtimes
for each row execute function set_showtime_bloque();

-- Impide dos funciones simultaneas en la misma sala
-- y garantiza la separacion minima entre funciones.
alter table showtimes
  add constraint sin_solapamiento_de_sala
  exclude using gist (room_id with =, bloque with &&);

create index idx_showtimes_movie on showtimes (movie_id);
create index idx_showtimes_inicio on showtimes (inicio);

-- Asigna automaticamente la primera sala libre para un horario dado.
create or replace function asignar_sala(
  p_movie_id uuid,
  p_inicio   timestamptz,
  p_formato  film_format default '2D',
  p_idioma   language_type default 'castellano',
  p_precio   numeric default 0
)
returns uuid
language plpgsql
as $$
declare
  v_room record;
  v_id   uuid;
begin
  for v_room in
    select id from rooms where activa order by numero
  loop
    begin
      insert into showtimes (movie_id, room_id, inicio, fin, bloque,
                             formato, idioma, precio_base)
      values (p_movie_id, v_room.id, p_inicio, p_inicio, 'empty',
              p_formato, p_idioma, p_precio)
      returning id into v_id;
      return v_id;
    exception when exclusion_violation then
      continue;
    end;
  end loop;

  raise exception 'No hay salas disponibles para el horario %', p_inicio;
end;
$$;

-- ============================================================
-- 7. CANDY BAR, COMBOS Y CUPONES
-- ============================================================

create table product_categories (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null unique
);

create table products (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references product_categories(id) on delete set null,
  nombre      text not null,
  descripcion text,
  imagen_url  text,
  precio      numeric(10,2) not null check (precio >= 0),
  activo      boolean not null default true
);

create table combos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  descripcion text,
  imagen_url  text,
  precio      numeric(10,2) not null check (precio >= 0),
  destacado   boolean not null default false,
  activo      boolean not null default true
);

create table combo_items (
  combo_id   uuid not null references combos(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  cantidad   smallint not null default 1 check (cantidad > 0),
  primary key (combo_id, product_id)
);

create table coupons (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,
  descripcion      text,
  descuento_pct    numeric(5,2) not null check (descuento_pct > 0 and descuento_pct <= 100),
  primera_compra   boolean not null default false,
  edad_minima      integer check (edad_minima >= 0),
  valido_desde     timestamptz,
  valido_hasta     timestamptz,
  usos_maximos     integer check (usos_maximos > 0),
  usos_realizados  integer not null default 0,
  activo           boolean not null default true
);

create table rewards (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  product_id    uuid references products(id) on delete cascade,
  es_entrada    boolean not null default false,
  costo_puntos  integer not null check (costo_puntos > 0),
  activo        boolean not null default true,
  constraint recompensa_valida check (es_entrada or product_id is not null)
);

-- ============================================================
-- 8. COMPRAS, ENTRADAS Y QR
-- ============================================================

create table orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles(id) on delete set null,
  email_contacto  text not null,
  estado          order_status not null default 'pendiente',
  qr_codigo       text not null unique default encode(gen_random_bytes(16), 'hex'),
  subtotal        numeric(10,2) not null default 0 check (subtotal >= 0),
  descuento       numeric(10,2) not null default 0 check (descuento >= 0),
  credito_usado   numeric(10,2) not null default 0 check (credito_usado >= 0),
  puntos_usados   integer not null default 0 check (puntos_usados >= 0),
  total           numeric(10,2) not null default 0 check (total >= 0),
  pagado_real     numeric(10,2) not null default 0 check (pagado_real >= 0),
  coupon_id       uuid references coupons(id) on delete set null,
  created_at      timestamptz not null default now(),
  cancelada_at    timestamptz
);

create index idx_orders_user on orders (user_id);
create index idx_orders_estado on orders (estado);
create index idx_orders_fecha on orders (created_at);

create table order_tickets (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  showtime_id  uuid not null references showtimes(id) on delete restrict,
  seat_id      uuid not null references seats(id) on delete restrict,
  precio       numeric(10,2) not null check (precio >= 0),
  activo       boolean not null default true,
  canjeado_at  timestamptz,
  canjeado_por uuid references profiles(id) on delete set null
);

-- Una butaca no puede venderse dos veces para la misma funcion.
-- Las entradas de compras canceladas quedan inactivas y liberan la butaca.
create unique index uq_butaca_por_funcion
  on order_tickets (showtime_id, seat_id)
  where activo;

create index idx_tickets_order on order_tickets (order_id);

create table order_products (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  product_id   uuid references products(id) on delete restrict,
  combo_id     uuid references combos(id) on delete restrict,
  cantidad     smallint not null default 1 check (cantidad > 0),
  precio_unit  numeric(10,2) not null check (precio_unit >= 0),
  canjeado_at  timestamptz,
  canjeado_por uuid references profiles(id) on delete set null,
  constraint producto_o_combo check (
    (product_id is not null and combo_id is null)
    or (product_id is null and combo_id is not null)
  )
);

create index idx_order_products_order on order_products (order_id);

-- Bloqueo temporal de butacas durante el checkout.
create table seat_locks (
  showtime_id uuid not null references showtimes(id) on delete cascade,
  seat_id     uuid not null references seats(id) on delete cascade,
  session_id  text not null,
  user_id     uuid references profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  primary key (showtime_id, seat_id)
);

create index idx_seat_locks_expira on seat_locks (expires_at);

-- ============================================================
-- 9. FIDELIZACION Y CREDITO
-- ============================================================

create table points_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  order_id   uuid references orders(id) on delete set null,
  reward_id  uuid references rewards(id) on delete set null,
  puntos     integer not null,
  motivo     ledger_reason not null,
  created_at timestamptz not null default now()
);

create index idx_points_user on points_ledger (user_id);

create table credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  order_id   uuid references orders(id) on delete set null,
  monto      numeric(10,2) not null,
  motivo     ledger_reason not null,
  created_at timestamptz not null default now()
);

create index idx_credit_user on credit_ledger (user_id);

-- ============================================================
-- 10. RESENAS, ALERTAS Y AUDITORIA
-- ============================================================

create table reviews (
  id         uuid primary key default gen_random_uuid(),
  movie_id   uuid not null references movies(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  estrellas  smallint not null check (estrellas between 1 and 5),
  comentario text,
  created_at timestamptz not null default now(),
  unique (movie_id, user_id)
);

create index idx_reviews_movie on reviews (movie_id);

create table release_alerts (
  movie_id     uuid not null references movies(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  notificado   boolean not null default false,
  created_at   timestamptz not null default now(),
  primary key (movie_id, user_id)
);

create table activity_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  accion     text not null,
  entidad    text,
  entidad_id uuid,
  detalle    jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_fecha on activity_log (created_at);
create index idx_activity_user on activity_log (user_id);
