-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 8: reportes de administracion
--
-- Los reportes agregan datos de compras de todos los usuarios.
-- Son funciones security definer que verifican el rol adentro:
-- si quien llama no es admin, cortan con excepcion.
-- ============================================================

create or replace function reporte_facturacion(p_desde date, p_hasta date)
returns table (
  dia            date,
  entradas       bigint,
  monto_entradas numeric,
  monto_candy    numeric,
  total          numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede ver los reportes';
  end if;

  return query
  select
    serie.d::date                                      as dia,
    coalesce(e.cantidad, 0)                            as entradas,
    coalesce(e.monto, 0)                               as monto_entradas,
    coalesce(c.monto, 0)                               as monto_candy,
    coalesce(e.monto, 0) + coalesce(c.monto, 0)        as total
  from generate_series(p_desde::timestamp, p_hasta::timestamp, interval '1 day') as serie(d)
  left join (
    select o.created_at::date as dia,
           count(t.id)        as cantidad,
           sum(t.precio)      as monto
    from orders o
    join order_tickets t on t.order_id = o.id
    where o.estado = 'pagada'
    group by 1
  ) e on e.dia = serie.d::date
  left join (
    select o.created_at::date              as dia,
           sum(p.precio_unit * p.cantidad) as monto
    from orders o
    join order_products p on p.order_id = o.id
    where o.estado = 'pagada'
    group by 1
  ) c on c.dia = serie.d::date
  order by 1;
end;
$$;

grant execute on function reporte_facturacion(date, date) to authenticated;

create or replace function ranking_peliculas(p_desde timestamptz, p_limite integer default 8)
returns table (titulo text, entradas bigint, monto numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede ver los reportes';
  end if;

  return query
  select m.titulo, count(t.id), sum(t.precio)
  from order_tickets t
  join orders o    on o.id = t.order_id
  join showtimes s on s.id = t.showtime_id
  join movies m    on m.id = s.movie_id
  where o.estado = 'pagada'
    and t.activo
    and o.created_at >= p_desde
  group by m.titulo
  order by count(t.id) desc
  limit p_limite;
end;
$$;

grant execute on function ranking_peliculas(timestamptz, integer) to authenticated;

create or replace function ranking_candy(p_limite integer default 8)
returns table (producto text, unidades bigint, monto numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not es_admin() then
    raise exception 'Solo un administrador puede ver los reportes';
  end if;

  return query
  select coalesce(pr.nombre, cb.nombre)     as producto,
         sum(p.cantidad)                    as unidades,
         sum(p.precio_unit * p.cantidad)    as monto
  from order_products p
  join orders o     on o.id = p.order_id
  left join products pr on pr.id = p.product_id
  left join combos   cb on cb.id = p.combo_id
  where o.estado = 'pagada'
  group by coalesce(pr.nombre, cb.nombre)
  order by sum(p.cantidad) desc
  limit p_limite;
end;
$$;

grant execute on function ranking_candy(integer) to authenticated;
