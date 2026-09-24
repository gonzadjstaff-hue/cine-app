-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 5: ranking de peliculas mas vendidas
--
-- order_tickets esta protegido por RLS, asi que un visitante no puede
-- contar entradas por su cuenta. Esta funcion security definer expone
-- unicamente el conteo agregado por pelicula, sin datos de compras.
-- ============================================================

create or replace function peliculas_mas_vendidas(p_limite integer default 3)
returns table (movie_id uuid, vendidas bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.movie_id, count(*) as vendidas
  from order_tickets t
  join showtimes s on s.id = t.showtime_id
  where t.activo
  group by s.movie_id
  order by count(*) desc
  limit p_limite;
$$;

grant execute on function peliculas_mas_vendidas(integer) to anon, authenticated;

-- Promedio de resenas por pelicula, para mostrarlo en la cartelera
-- sin traer todas las resenas.
create or replace function promedio_resenas(p_movie_id uuid)
returns table (promedio numeric, cantidad bigint)
language sql
stable
as $$
  select round(avg(estrellas)::numeric, 1), count(*)
  from reviews
  where movie_id = p_movie_id;
$$;

grant execute on function promedio_resenas(uuid) to anon, authenticated;
