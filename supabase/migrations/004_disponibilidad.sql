-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 4: disponibilidad publica de butacas
--
-- La ocupacion de una funcion tiene que ser visible para cualquiera,
-- incluido un comprador anonimo, pero las filas de order_tickets estan
-- protegidas por RLS porque contienen datos de la compra.
-- Esta funcion security definer expone unicamente que butacas estan
-- tomadas, sin revelar a que orden ni a que usuario pertenecen.
-- ============================================================

create or replace function butacas_ocupadas(p_showtime_id uuid)
returns table (seat_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select t.seat_id
  from order_tickets t
  where t.showtime_id = p_showtime_id
    and t.activo;
$$;

grant execute on function butacas_ocupadas(uuid) to anon, authenticated;
