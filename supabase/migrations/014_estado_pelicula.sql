-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 14: el estado de una pelicula se deriva de su estreno
-- ============================================================

-- Antes el admin cargaba el estado a mano, ademas de la fecha de
-- estreno: dos datos que podian contradecirse. Ahora el estado se
-- calcula: estreno futuro -> proximamente; estreno alcanzado ->
-- cartelera. Una pelicula pasa sola a cartelera el dia del estreno.
-- Lo unico manual es archivarla, para sacarla de circulacion.

alter table movies add column if not exists archivada boolean not null default false;

update movies set archivada = true where estado = 'archivada';

drop policy if exists "peliculas visibles" on movies;
create policy "peliculas visibles" on movies
  for select using (not archivada or es_staff());

alter table movies drop column estado;

-- Campo calculado: PostgREST lo expone como una columna mas, asi
-- que se puede pedir en select y filtrar con .eq('estado', ...).
-- La fecha de hoy se toma en hora argentina: con UTC, entre las
-- 21 y las 24 una pelicula pasaria a cartelera un dia antes.
create or replace function estado(m movies)
returns movie_status
language sql
stable
as $$
  select case
    when m.archivada then 'archivada'::movie_status
    when m.fecha_estreno > (now() at time zone 'America/Argentina/Buenos_Aires')::date
      then 'proximamente'::movie_status
    else 'cartelera'::movie_status
  end;
$$;

grant execute on function estado(movies) to anon, authenticated;
