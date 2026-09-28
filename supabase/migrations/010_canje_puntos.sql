-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 10: canje de puntos por recompensas
-- ============================================================

-- El cliente pidio poder canjear puntos por entradas gratis o
-- productos del candy bar, con el costo en puntos configurable
-- por recompensa (tabla rewards, ya existente).
--
-- Se reutiliza el flujo de compra normal: el cliente arma la orden
-- pendiente (una butaca via seat_locks, o un item de candy) igual
-- que en una compra paga, y esta funcion la cierra sin cobrar nada,
-- validando que lo cargado coincida con la recompensa elegida.
-- Asi no se duplica la logica de bloqueo de butacas ni de unicidad.

create or replace function canjear_recompensa(
  p_order_id  uuid,
  p_reward_id uuid
)
returns table (
  puntos_usados    integer,
  puntos_restantes integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   orders%rowtype;
  v_reward  rewards%rowtype;
  v_puntos  integer;
  v_tickets integer;
  v_items   integer;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesion para canjear puntos';
  end if;

  select * into v_order from orders where id = p_order_id;

  if not found then
    raise exception 'La compra no existe';
  end if;

  if v_order.user_id is distinct from auth.uid() then
    raise exception 'No podes canjear una compra ajena';
  end if;

  if v_order.estado <> 'pendiente' then
    raise exception 'La compra ya fue procesada';
  end if;

  select * into v_reward from rewards where id = p_reward_id and activo;

  if not found then
    raise exception 'La recompensa no existe o no esta activa';
  end if;

  select puntos into v_puntos from profiles where id = auth.uid();

  if v_puntos < v_reward.costo_puntos then
    raise exception 'No tenes puntos suficientes para esta recompensa';
  end if;

  select count(*) into v_tickets from order_tickets where order_id = p_order_id;
  select count(*) into v_items from order_products where order_id = p_order_id;

  if v_reward.es_entrada then
    if v_tickets <> 1 or v_items <> 0 then
      raise exception 'La recompensa de entrada requiere una sola butaca y ningun producto';
    end if;

    update order_tickets set precio = 0 where order_id = p_order_id;
  else
    if v_items <> 1 or v_tickets <> 0 then
      raise exception 'La recompensa de producto requiere un unico item y ninguna butaca';
    end if;

    if not exists (
      select 1 from order_products
      where order_id = p_order_id
        and product_id = v_reward.product_id
        and cantidad = 1
    ) then
      raise exception 'El producto de la compra no coincide con la recompensa elegida';
    end if;

    update order_products set precio_unit = 0 where order_id = p_order_id;
  end if;

  update orders
  set estado        = 'pagada',
      subtotal      = 0,
      descuento     = 0,
      credito_usado = 0,
      puntos_usados = v_reward.costo_puntos,
      total         = 0,
      pagado_real   = 0
  where id = p_order_id;

  perform set_config('app.bypass_perfil', 'on', true);

  update profiles
  set puntos = puntos - v_reward.costo_puntos
  where id = auth.uid();

  insert into points_ledger (user_id, order_id, reward_id, puntos, motivo)
  values (auth.uid(), p_order_id, v_reward.id, -v_reward.costo_puntos, 'canje');

  return query
  select v_reward.costo_puntos, (v_puntos - v_reward.costo_puntos);
end;
$$;

grant execute on function canjear_recompensa(uuid, uuid) to authenticated;
