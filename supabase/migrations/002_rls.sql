-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 2 de 3: autenticacion, seguridad por roles (RLS) y realtime
-- ============================================================

-- ============================================================
-- 1. FUNCIONES AUXILIARES DE ROL
-- ============================================================

-- security definer: consulta profiles sin pasar por RLS,
-- lo que evita la recursion infinita en las politicas.
create or replace function auth_rol()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select rol from profiles where id = auth.uid();
$$;

create or replace function es_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth_rol() = 'admin', false);
$$;

create or replace function es_staff()
returns boolean
language sql
stable
as $$
  select coalesce(auth_rol() in ('admin', 'empleado'), false);
$$;

-- ============================================================
-- 2. ALTA AUTOMATICA DE PERFIL AL REGISTRARSE
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (
    id, email, nombre, apellido, fecha_nacimiento,
    tipo_sangre, color_ojos, dias_vacaciones
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido', ''),
    coalesce((new.raw_user_meta_data ->> 'fecha_nacimiento')::date, '1900-01-01'),
    new.raw_user_meta_data ->> 'tipo_sangre',
    new.raw_user_meta_data ->> 'color_ojos',
    (new.raw_user_meta_data ->> 'dias_vacaciones')::integer
  );
  return new;
end;
$$;

create trigger trg_nuevo_usuario
after insert on auth.users
for each row execute function handle_new_user();

-- Impide que un usuario se auto-asigne rol, credito o puntos.
create or replace function proteger_campos_perfil()
returns trigger
language plpgsql
as $$
begin
  if es_admin() then
    return new;
  end if;

  new.rol     := old.rol;
  new.credito := old.credito;
  new.puntos  := old.puntos;
  return new;
end;
$$;

create trigger trg_proteger_perfil
before update on profiles
for each row execute function proteger_campos_perfil();

-- ============================================================
-- 3. ACTIVACION DE RLS
-- ============================================================

alter table app_config         enable row level security;
alter table profiles           enable row level security;
alter table genres             enable row level security;
alter table movies             enable row level security;
alter table movie_genres       enable row level security;
alter table rooms              enable row level security;
alter table seats              enable row level security;
alter table showtimes          enable row level security;
alter table product_categories enable row level security;
alter table products           enable row level security;
alter table combos             enable row level security;
alter table combo_items        enable row level security;
alter table coupons            enable row level security;
alter table rewards            enable row level security;
alter table orders             enable row level security;
alter table order_tickets      enable row level security;
alter table order_products     enable row level security;
alter table seat_locks         enable row level security;
alter table points_ledger      enable row level security;
alter table credit_ledger      enable row level security;
alter table reviews            enable row level security;
alter table release_alerts     enable row level security;
alter table activity_log       enable row level security;

-- ============================================================
-- 4. CATALOGO PUBLICO (lectura libre, escritura solo admin)
-- ============================================================

create policy "config visible" on app_config
  for select using (true);
create policy "config admin" on app_config
  for all using (es_admin()) with check (es_admin());

create policy "generos visibles" on genres
  for select using (true);
create policy "generos admin" on genres
  for all using (es_admin()) with check (es_admin());

create policy "peliculas visibles" on movies
  for select using (estado <> 'archivada' or es_staff());
create policy "peliculas admin" on movies
  for all using (es_admin()) with check (es_admin());

create policy "generos pelicula visibles" on movie_genres
  for select using (true);
create policy "generos pelicula admin" on movie_genres
  for all using (es_admin()) with check (es_admin());

create policy "salas visibles" on rooms
  for select using (true);
create policy "salas admin" on rooms
  for all using (es_admin()) with check (es_admin());

create policy "butacas visibles" on seats
  for select using (true);
create policy "butacas admin" on seats
  for all using (es_admin()) with check (es_admin());

create policy "funciones visibles" on showtimes
  for select using (activa or es_staff());
create policy "funciones admin" on showtimes
  for all using (es_admin()) with check (es_admin());

create policy "categorias visibles" on product_categories
  for select using (true);
create policy "categorias admin" on product_categories
  for all using (es_admin()) with check (es_admin());

create policy "productos visibles" on products
  for select using (activo or es_staff());
create policy "productos admin" on products
  for all using (es_admin()) with check (es_admin());

create policy "combos visibles" on combos
  for select using (activo or es_staff());
create policy "combos admin" on combos
  for all using (es_admin()) with check (es_admin());

create policy "items combo visibles" on combo_items
  for select using (true);
create policy "items combo admin" on combo_items
  for all using (es_admin()) with check (es_admin());

create policy "recompensas visibles" on rewards
  for select using (activo or es_staff());
create policy "recompensas admin" on rewards
  for all using (es_admin()) with check (es_admin());

create policy "cupones visibles" on coupons
  for select using (activo);
create policy "cupones admin" on coupons
  for all using (es_admin()) with check (es_admin());

-- ============================================================
-- 5. PERFILES
-- ============================================================

create policy "perfil propio o staff" on profiles
  for select using (id = auth.uid() or es_staff());

create policy "editar perfil propio" on profiles
  for update using (id = auth.uid() or es_admin());

create policy "alta de perfil" on profiles
  for insert with check (id = auth.uid());

-- ============================================================
-- 6. COMPRAS
-- ============================================================

create policy "compras propias o staff" on orders
  for select using (
    user_id = auth.uid()
    or (user_id is null and auth.uid() is null)
    or es_staff()
  );

create policy "crear compra" on orders
  for insert with check (
    user_id = auth.uid() or user_id is null
  );

create policy "modificar compra" on orders
  for update using (user_id = auth.uid() or es_staff());

create policy "entradas visibles" on order_tickets
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_tickets.order_id
        and (o.user_id = auth.uid() or o.user_id is null)
    )
    or es_staff()
  );

create policy "crear entradas" on order_tickets
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_tickets.order_id
        and (o.user_id = auth.uid() or o.user_id is null)
    )
  );

create policy "canjear entradas" on order_tickets
  for update using (es_staff());

create policy "productos de compra visibles" on order_products
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_products.order_id
        and (o.user_id = auth.uid() or o.user_id is null)
    )
    or es_staff()
  );

create policy "crear productos de compra" on order_products
  for insert with check (
    exists (
      select 1 from orders o
      where o.id = order_products.order_id
        and (o.user_id = auth.uid() or o.user_id is null)
    )
  );

create policy "canjear productos" on order_products
  for update using (es_staff());

-- ============================================================
-- 7. BLOQUEO TEMPORAL DE BUTACAS
-- ============================================================

-- Todos ven que hay bloqueos (para pintar el mapa en tiempo real),
-- pero cada uno solo puede crear o soltar los suyos.
create policy "bloqueos visibles" on seat_locks
  for select using (true);

create policy "crear bloqueo" on seat_locks
  for insert with check (true);

create policy "soltar bloqueo propio" on seat_locks
  for delete using (user_id = auth.uid() or user_id is null or es_staff());

create or replace function limpiar_bloqueos_vencidos()
returns void
language sql
security definer
set search_path = public
as $$
  delete from seat_locks where expires_at < now();
$$;

-- ============================================================
-- 8. FIDELIZACION, RESENAS Y ALERTAS
-- ============================================================

create policy "puntos propios" on points_ledger
  for select using (user_id = auth.uid() or es_admin());

create policy "credito propio" on credit_ledger
  for select using (user_id = auth.uid() or es_admin());

create policy "resenas visibles" on reviews
  for select using (true);

create policy "escribir resena propia" on reviews
  for insert with check (user_id = auth.uid());

create policy "editar resena propia" on reviews
  for update using (user_id = auth.uid());

create policy "borrar resena propia" on reviews
  for delete using (user_id = auth.uid() or es_admin());

create policy "alertas propias" on release_alerts
  for select using (user_id = auth.uid() or es_admin());

create policy "crear alerta propia" on release_alerts
  for insert with check (user_id = auth.uid());

create policy "borrar alerta propia" on release_alerts
  for delete using (user_id = auth.uid());

-- ============================================================
-- 9. AUDITORIA
-- ============================================================

create policy "log solo admin" on activity_log
  for select using (es_admin());

create policy "registrar actividad" on activity_log
  for insert with check (auth.uid() is not null);

create or replace function registrar_actividad(
  p_accion  text,
  p_entidad text default null,
  p_id      uuid default null,
  p_detalle jsonb default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into activity_log (user_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), p_accion, p_entidad, p_id, p_detalle);
$$;

create or replace function log_funcion_creada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (user_id, accion, entidad, entidad_id, detalle)
  values (auth.uid(), 'crear_funcion', 'showtimes', new.id,
          jsonb_build_object('movie_id', new.movie_id,
                             'room_id', new.room_id,
                             'inicio', new.inicio));
  return new;
end;
$$;

create trigger trg_log_funcion
after insert on showtimes
for each row execute function log_funcion_creada();

create or replace function log_cambio_precio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.precio is distinct from old.precio then
    insert into activity_log (user_id, accion, entidad, entidad_id, detalle)
    values (auth.uid(), 'cambio_precio', 'products', new.id,
            jsonb_build_object('anterior', old.precio, 'nuevo', new.precio));
  end if;
  return new;
end;
$$;

create trigger trg_log_precio_producto
after update on products
for each row execute function log_cambio_precio();

-- ============================================================
-- 10. REALTIME
-- ============================================================

alter publication supabase_realtime add table seat_locks;
alter publication supabase_realtime add table order_tickets;
