-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 12: auditoria de validacion de QR
-- ============================================================

-- El cliente pidio que el log registre "quien valido un QR".
-- Los triggers son a nivel statement: una validacion tipica marca
-- todas las entradas de la orden a la vez, y queda una sola fila
-- de log por orden, no una por butaca. El filtro sobre la
-- transicion null -> valor evita registrar otros updates de la
-- misma tabla (cancelaciones, canje de puntos).

create or replace function log_validacion_entradas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (user_id, accion, entidad, entidad_id, detalle)
  select auth.uid(), 'validar_entrada', 'orders', n.order_id,
         jsonb_build_object('entradas', count(*))
  from new_table n
  join old_table o using (id)
  where n.canjeado_at is not null and o.canjeado_at is null
  group by n.order_id;

  return null;
end;
$$;

drop trigger if exists trg_log_validar_entradas on order_tickets;

create trigger trg_log_validar_entradas
after update on order_tickets
referencing old table as old_table new table as new_table
for each statement execute function log_validacion_entradas();

create or replace function log_entrega_candy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into activity_log (user_id, accion, entidad, entidad_id, detalle)
  select auth.uid(), 'entregar_candy', 'orders', n.order_id,
         jsonb_build_object('items', count(*))
  from new_table n
  join old_table o using (id)
  where n.canjeado_at is not null and o.canjeado_at is null
  group by n.order_id;

  return null;
end;
$$;

drop trigger if exists trg_log_entregar_candy on order_products;

create trigger trg_log_entregar_candy
after update on order_products
referencing old table as old_table new table as new_table
for each statement execute function log_entrega_candy();
