-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 11: canje de entradas integrado a la compra
-- ============================================================

-- El canje de entrada gratis deja de ser una orden aparte: ahora
-- finalizar_compra acepta cuantas entradas se canjean con puntos.
-- Las N butacas mas baratas de la orden quedan en cero, el resto
-- se paga normal (cupon y credito aplican sobre lo que queda).
-- Los puntos se siguen ganando solo sobre el dinero real pagado,
-- asi que un canje no genera puntos nuevos.

drop function if exists finalizar_compra(uuid, text, boolean);

create or replace function finalizar_compra(
  p_order_id         uuid,
  p_codigo_cupon     text default null,
  p_usar_credito     boolean default false,
  p_canjear_entradas integer default 0
)
returns table (
  subtotal       numeric,
  descuento      numeric,
  credito_usado  numeric,
  total          numeric,
  pagado_real    numeric,
  puntos_ganados integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order       orders%rowtype;
  v_perfil      profiles%rowtype;
  v_cupon       coupons%rowtype;
  v_reward      rewards%rowtype;
  v_subtotal    numeric := 0;
  v_descuento   numeric := 0;
  v_credito     numeric := 0;
  v_total       numeric := 0;
  v_pagado      numeric := 0;
  v_puntos      integer := 0;
  v_canje_total integer := 0;
  v_tasa        numeric;
  v_edad        integer;
  v_entradas    integer;
begin
  select * into v_order from orders where id = p_order_id;

  if not found then
    raise exception 'La compra no existe';
  end if;

  if v_order.user_id is distinct from auth.uid() and v_order.user_id is not null then
    raise exception 'No podes cerrar una compra ajena';
  end if;

  if v_order.estado <> 'pendiente' then
    raise exception 'La compra ya fue procesada';
  end if;

  if v_order.user_id is not null then
    select * into v_perfil from profiles where id = v_order.user_id;
    v_edad := edad_de(v_perfil.fecha_nacimiento);
  end if;

  -- Canje de entradas con puntos
  if coalesce(p_canjear_entradas, 0) > 0 then
    if v_order.user_id is null then
      raise exception 'El canje de puntos requiere una cuenta';
    end if;

    select * into v_reward
    from rewards
    where es_entrada and activo
    order by costo_puntos
    limit 1;

    if not found then
      raise exception 'No hay recompensa de entrada activa';
    end if;

    select count(*) into v_entradas
    from order_tickets where order_id = p_order_id and activo;

    if p_canjear_entradas > v_entradas then
      raise exception 'No podes canjear mas entradas que las elegidas';
    end if;

    v_canje_total := p_canjear_entradas * v_reward.costo_puntos;

    if v_perfil.puntos < v_canje_total then
      raise exception 'No tenes puntos suficientes para ese canje';
    end if;

    -- Se canjean las butacas mas baratas; las VIP se pagan
    -- salvo que no haya otra opcion.
    update order_tickets
    set precio = 0
    where id in (
      select id from order_tickets
      where order_id = p_order_id and activo
      order by precio, id
      limit p_canjear_entradas
    );
  end if;

  select coalesce(sum(precio), 0) into v_subtotal
  from order_tickets where order_id = p_order_id and activo;

  select v_subtotal + coalesce(sum(precio_unit * cantidad), 0) into v_subtotal
  from order_products where order_id = p_order_id;

  -- Cupon
  if p_codigo_cupon is not null and length(trim(p_codigo_cupon)) > 0 then
    select * into v_cupon
    from coupons
    where upper(coupons.codigo) = upper(trim(p_codigo_cupon)) and coupons.activo;

    if not found then
      raise exception 'El cupon no existe o no esta vigente';
    end if;

    if v_cupon.valido_desde is not null and now() < v_cupon.valido_desde then
      raise exception 'El cupon todavia no esta vigente';
    end if;

    if v_cupon.valido_hasta is not null and now() > v_cupon.valido_hasta then
      raise exception 'El cupon esta vencido';
    end if;

    if v_cupon.usos_maximos is not null
       and v_cupon.usos_realizados >= v_cupon.usos_maximos then
      raise exception 'El cupon alcanzo su limite de usos';
    end if;

    if v_cupon.primera_compra then
      if v_order.user_id is null then
        raise exception 'El cupon de primera compra requiere una cuenta';
      end if;

      if not v_perfil.primera_compra then
        raise exception 'El cupon de primera compra ya fue utilizado';
      end if;
    end if;

    if v_cupon.edad_minima is not null then
      if v_order.user_id is null then
        raise exception 'Ese cupon requiere una cuenta para verificar la edad';
      end if;

      if v_edad < v_cupon.edad_minima then
        raise exception 'Ese cupon es para mayores de % anos', v_cupon.edad_minima;
      end if;
    end if;

    v_descuento := round(v_subtotal * v_cupon.descuento_pct / 100, 2);

    update coupons
    set usos_realizados = usos_realizados + 1
    where id = v_cupon.id;
  end if;

  v_total := v_subtotal - v_descuento;

  -- Credito de cancelaciones previas
  if p_usar_credito and v_order.user_id is not null and v_perfil.credito > 0 then
    v_credito := least(v_perfil.credito, v_total);
  end if;

  v_pagado := v_total - v_credito;

  -- Puntos: solo sobre dinero efectivamente abonado
  if v_order.user_id is not null then
    select (valor #>> '{}')::numeric into v_tasa
    from app_config where clave = 'puntos_por_peso';

    v_puntos := floor(v_pagado * coalesce(v_tasa, 1))::integer;
  end if;

  update orders
  set estado        = 'pagada',
      subtotal      = v_subtotal,
      descuento     = v_descuento,
      credito_usado = v_credito,
      puntos_usados = v_canje_total,
      total         = v_total,
      pagado_real   = v_pagado,
      coupon_id     = v_cupon.id
  where id = p_order_id;

  if v_order.user_id is not null then
    perform set_config('app.bypass_perfil', 'on', true);

    update profiles
    set credito        = credito - v_credito,
        puntos         = puntos + v_puntos - v_canje_total,
        primera_compra = false
    where id = v_order.user_id;

    if v_credito > 0 then
      insert into credit_ledger (user_id, order_id, monto, motivo)
      values (v_order.user_id, p_order_id, -v_credito, 'compra');
    end if;

    if v_puntos > 0 then
      insert into points_ledger (user_id, order_id, puntos, motivo)
      values (v_order.user_id, p_order_id, v_puntos, 'compra');
    end if;

    if v_canje_total > 0 then
      insert into points_ledger (user_id, order_id, reward_id, puntos, motivo)
      values (v_order.user_id, p_order_id, v_reward.id, -v_canje_total, 'canje');
    end if;
  end if;

  return query
  select v_subtotal, v_descuento, v_credito, v_total, v_pagado, v_puntos;
end;
$$;

grant execute on function finalizar_compra(uuid, text, boolean, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- La cancelacion tambien devuelve los puntos canjeados:
-- se revierten los ganados por la compra y se restituyen
-- los gastados en canje de entradas.
-- ------------------------------------------------------------

create or replace function cancelar_compra(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order        orders%rowtype;
  v_inicio       timestamptz;
  v_horas        integer;
  v_puntos       integer;
  v_puntos_canje integer;
begin
  select * into v_order from orders where id = p_order_id;

  if not found then
    raise exception 'La compra no existe';
  end if;

  if v_order.user_id is distinct from auth.uid() and not es_admin() then
    raise exception 'No podes cancelar una compra ajena';
  end if;

  if v_order.estado <> 'pagada' then
    raise exception 'La compra no esta activa';
  end if;

  select min(s.inicio) into v_inicio
  from order_tickets t
  join showtimes s on s.id = t.showtime_id
  where t.order_id = p_order_id;

  select (valor #>> '{}')::integer into v_horas
  from app_config where clave = 'horas_limite_cancelacion';

  v_horas := coalesce(v_horas, 2);

  if v_inicio is null or (v_inicio - (v_horas * interval '1 hour')) < now() then
    raise exception 'Solo se puede cancelar hasta % horas antes de la funcion', v_horas;
  end if;

  update order_tickets set activo = false where order_id = p_order_id;

  update orders
  set estado = 'cancelada', cancelada_at = now()
  where id = p_order_id;

  if v_order.user_id is not null then
    select coalesce(sum(puntos), 0) into v_puntos
    from points_ledger
    where order_id = p_order_id and motivo = 'compra';

    select coalesce(sum(-puntos), 0) into v_puntos_canje
    from points_ledger
    where order_id = p_order_id and motivo = 'canje';

    perform set_config('app.bypass_perfil', 'on', true);

    update profiles
    set credito = credito + v_order.total,
        puntos  = greatest(puntos - v_puntos + v_puntos_canje, 0)
    where id = v_order.user_id;

    insert into credit_ledger (user_id, order_id, monto, motivo)
    values (v_order.user_id, p_order_id, v_order.total, 'cancelacion');

    if v_puntos > 0 then
      insert into points_ledger (user_id, order_id, puntos, motivo)
      values (v_order.user_id, p_order_id, -v_puntos, 'cancelacion');
    end if;

    if v_puntos_canje > 0 then
      insert into points_ledger (user_id, order_id, puntos, motivo)
      values (v_order.user_id, p_order_id, v_puntos_canje, 'cancelacion');
    end if;
  end if;

  return v_order.total;
end;
$$;

grant execute on function cancelar_compra(uuid) to authenticated;
