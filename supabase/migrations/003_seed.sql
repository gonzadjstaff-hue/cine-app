-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 3 de 3: datos de prueba
-- ============================================================

-- ============================================================
-- 1. SALAS Y BUTACAS
-- ============================================================

insert into rooms (numero, nombre) values
  (2, 'Sala 2'),
  (3, 'Sala 3'),
  (4, 'Sala 4')
on conflict (numero) do nothing;

do $$
declare
  r record;
begin
  for r in select id from rooms loop
    perform generar_butacas(r.id);
  end loop;
end;
$$;

-- ============================================================
-- 2. GENEROS
-- ============================================================

insert into genres (nombre) values
  ('Accion'), ('Aventura'), ('Animacion'), ('Comedia'),
  ('Drama'), ('Terror'), ('Ciencia ficcion'), ('Romance'),
  ('Suspenso'), ('Documental')
on conflict (nombre) do nothing;

-- ============================================================
-- 3. PELICULAS
-- ============================================================

insert into movies (titulo, duracion_min, sinopsis, clasificacion, estado, fecha_estreno, destacada_home) values
  ('El ultimo viaje', 118, 'Un piloto retirado acepta una mision final que lo obliga a enfrentar su pasado.', 'plus13', 'cartelera', current_date - 10, true),
  ('Corazon de hierro', 142, 'Dos hermanos rivalizan por el control de una fundicion familiar en decadencia.', 'plus13', 'cartelera', current_date - 20, true),
  ('Patitas al rescate', 92, 'Un grupo de mascotas organiza una operacion para recuperar a su dueno perdido.', 'atp', 'cartelera', current_date - 5, true),
  ('Noche cerrada', 105, 'Una periodista investiga desapariciones en un pueblo donde nadie quiere hablar.', 'plus18', 'cartelera', current_date - 15, false),
  ('Orbita', 130, 'La tripulacion de una estacion espacial pierde contacto con la Tierra.', 'plus13', 'cartelera', current_date - 30, false),
  ('Verano en Rosario', 97, 'Dos desconocidos comparten un viaje que les cambia el rumbo.', 'atp', 'cartelera', current_date - 8, false),
  ('La grieta', 121, 'Un equipo de rescate desciende a una cueva que no figura en ningun mapa.', 'plus18', 'proximamente', current_date + 14, false),
  ('Pequenos gigantes', 88, 'Un equipo infantil de futbol llega a una final imposible.', 'atp', 'proximamente', current_date + 21, false)
on conflict do nothing;

-- Asignacion de generos
insert into movie_genres (movie_id, genre_id)
select m.id, g.id from movies m, genres g
where (m.titulo = 'El ultimo viaje'     and g.nombre in ('Accion', 'Drama'))
   or (m.titulo = 'Corazon de hierro'   and g.nombre in ('Drama', 'Suspenso'))
   or (m.titulo = 'Patitas al rescate'  and g.nombre in ('Animacion', 'Comedia', 'Aventura'))
   or (m.titulo = 'Noche cerrada'       and g.nombre in ('Terror', 'Suspenso'))
   or (m.titulo = 'Orbita'              and g.nombre in ('Ciencia ficcion', 'Suspenso'))
   or (m.titulo = 'Verano en Rosario'   and g.nombre in ('Romance', 'Comedia'))
   or (m.titulo = 'La grieta'           and g.nombre in ('Terror', 'Aventura'))
   or (m.titulo = 'Pequenos gigantes'   and g.nombre in ('Comedia', 'Drama'))
on conflict do nothing;

-- Preventa de un estreno
update movies
set preventa_activa = true,
    preventa_inicio = now(),
    preventa_fin    = (current_date + 14)::timestamptz,
    preventa_precio = 6500
where titulo = 'La grieta';

-- ============================================================
-- 4. FUNCIONES DE LOS PROXIMOS 7 DIAS
-- ============================================================

do $$
declare
  v_movie   record;
  v_dia     integer;
  v_hora    integer;
  v_horas   integer[] := array[14, 17, 20, 22];
  v_inicio  timestamptz;
begin
  for v_movie in
    select id, clasificacion from movies where estado = 'cartelera'
  loop
    for v_dia in 0..6 loop
      foreach v_hora in array v_horas loop
        v_inicio := (current_date + v_dia)::timestamptz + (v_hora * interval '1 hour');
        begin
          perform asignar_sala(
            v_movie.id,
            v_inicio,
            '2D',
            case when v_hora >= 20 then 'subtitulado' else 'castellano' end,
            5500
          );
        exception when others then
          null;
        end;
      end loop;
    end loop;
  end loop;
end;
$$;

-- ============================================================
-- 5. CANDY BAR
-- ============================================================

insert into product_categories (nombre) values
  ('Pochoclos'), ('Bebidas'), ('Golosinas'), ('Salados')
on conflict (nombre) do nothing;

insert into products (category_id, nombre, descripcion, precio)
select c.id, p.nombre, p.descripcion, p.precio
from (values
  ('Pochoclos', 'Pochoclo chico',        'Balde de 4 litros, dulce o salado',      3200::numeric),
  ('Pochoclos', 'Pochoclo mediano',      'Balde de 6 litros, dulce o salado',      4100::numeric),
  ('Pochoclos', 'Pochoclo grande',       'Balde de 8 litros, dulce o salado',      4900::numeric),
  ('Bebidas',   'Gaseosa chica',         'Vaso de 500 ml',                         2400::numeric),
  ('Bebidas',   'Gaseosa grande',        'Vaso de 1 litro',                        3300::numeric),
  ('Bebidas',   'Agua mineral',          'Botella de 500 ml',                      1900::numeric),
  ('Golosinas', 'Barra de chocolate',    'Chocolate con leche de 90 g',            2100::numeric),
  ('Golosinas', 'Gomitas surtidas',      'Bolsa de 150 g',                         1800::numeric),
  ('Salados',   'Nachos con queso',      'Porcion con salsa de queso cheddar',     4600::numeric),
  ('Salados',   'Papas fritas',          'Porcion individual',                     3400::numeric)
) as p(categoria, nombre, descripcion, precio)
join product_categories c on c.nombre = p.categoria
on conflict do nothing;

-- ============================================================
-- 6. COMBOS
-- ============================================================

insert into combos (nombre, descripcion, precio, destacado) values
  ('Combo Clasico', 'Entrada, pochoclo mediano y gaseosa grande', 11900, true),
  ('Combo Pareja',  'Dos entradas, pochoclo grande y dos gaseosas', 21500, true),
  ('Combo Dulce',   'Pochoclo chico, chocolate y agua', 6500, false)
on conflict do nothing;

insert into combo_items (combo_id, product_id, cantidad)
select c.id, p.id, i.cantidad
from (values
  ('Combo Clasico', 'Pochoclo mediano',   1),
  ('Combo Clasico', 'Gaseosa grande',     1),
  ('Combo Pareja',  'Pochoclo grande',    1),
  ('Combo Pareja',  'Gaseosa grande',     2),
  ('Combo Dulce',   'Pochoclo chico',     1),
  ('Combo Dulce',   'Barra de chocolate', 1),
  ('Combo Dulce',   'Agua mineral',       1)
) as i(combo, producto, cantidad)
join combos c   on c.nombre = i.combo
join products p on p.nombre = i.producto
on conflict do nothing;

-- ============================================================
-- 7. CUPONES Y RECOMPENSAS
-- ============================================================

insert into coupons (codigo, descripcion, descuento_pct, primera_compra, edad_minima) values
  ('BIENVENIDO', 'Cupon de primera compra',             10, true,  null),
  ('PLUS50',     'Descuento para mayores de 50 anos',   20, false, 50),
  ('MARTES',     'Promocion de dias de semana',         15, false, null)
on conflict (codigo) do nothing;

insert into rewards (nombre, product_id, es_entrada, costo_puntos)
select 'Entrada gratis', null, true, 15000
where not exists (select 1 from rewards where nombre = 'Entrada gratis');

insert into rewards (nombre, product_id, es_entrada, costo_puntos)
select 'Pochoclo mediano gratis', p.id, false, 8000
from products p where p.nombre = 'Pochoclo mediano'
  and not exists (select 1 from rewards where nombre = 'Pochoclo mediano gratis');

insert into rewards (nombre, product_id, es_entrada, costo_puntos)
select 'Gaseosa grande gratis', p.id, false, 6000
from products p where p.nombre = 'Gaseosa grande'
  and not exists (select 1 from rewards where nombre = 'Gaseosa grande gratis');

-- ============================================================
-- 8. VERIFICACION
-- ============================================================

select 'salas'      as tabla, count(*) from rooms
union all select 'butacas',    count(*) from seats
union all select 'peliculas',  count(*) from movies
union all select 'funciones',  count(*) from showtimes
union all select 'productos',  count(*) from products
union all select 'combos',     count(*) from combos
union all select 'cupones',    count(*) from coupons
union all select 'recompensas', count(*) from rewards;
