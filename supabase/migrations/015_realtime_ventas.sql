-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 15: el mapa en tiempo real muestra solo butacas vendidas
-- ============================================================

-- Antes, elegir una butaca la reservaba unos minutos (seat_locks)
-- y los demas la veian "en proceso". Ahora elegir no bloquea nada:
-- el mapa en tiempo real muestra solo lo vendido, como en las apps
-- de cine comerciales. Si dos personas eligen la misma butaca, la
-- que confirma segunda recibe un error; la venta doble la sigue
-- impidiendo el indice unico uq_butaca_por_funcion.

drop function if exists limpiar_bloqueos_vencidos();
drop table if exists seat_locks;
delete from app_config where clave = 'minutos_bloqueo_butaca';

-- order_tickets tiene RLS: cada usuario ve solo sus entradas, asi
-- que Realtime no le entregaria las compras de los demas. En lugar
-- de escuchar la tabla, la base emite un aviso sin datos al canal
-- de la funcion, y cada navegador vuelve a pedir las butacas
-- ocupadas con butacas_ocupadas(), que ya es publica.
do $$
begin
  alter publication supabase_realtime drop table order_tickets;
exception
  when others then null;
end;
$$;

create or replace function avisar_cambio_butacas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_showtime uuid;
begin
  if tg_op = 'DELETE' then
    v_showtime := old.showtime_id;
  else
    v_showtime := new.showtime_id;
  end if;

  perform realtime.send('{}'::jsonb, 'butacas', 'funcion-' || v_showtime, false);
  return null;
end;
$$;

drop trigger if exists trg_avisar_butacas on order_tickets;

create trigger trg_avisar_butacas
after insert or delete or update of activo on order_tickets
for each row execute function avisar_cambio_butacas();
