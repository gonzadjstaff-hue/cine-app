-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 9: precio calculado en la base y preventa
--
-- Hasta aca el precio de cada butaca lo insertaba el cliente.
-- finalizar_compra sumaba ese valor, asi que alguien podia
-- comprar a cualquier precio modificando la peticion.
-- Ahora el precio lo calcula la base y el cierre de compra
-- reescribe lo que haya enviado el navegador.
-- ============================================================

create or replace function precio_de_butaca(p_showtime_id uuid, p_seat_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base    numeric;
  v_movie   uuid;
  v_tipo    seat_type;
  v_recargo numeric;
  v_activa  boolean;
  v_inicio  timestamptz;
  v_fin     timestamptz;
  v_precio  numeric;
begin
  select s.precio_base, s.movie_id
    into v_base, v_movie
  from showtimes s
  where s.id = p_showtime_id;

  if v_base is null then
    raise exception 'La funcion no existe';
  end if;

  select m.preventa_activa, m.preventa_inicio, m.preventa_fin, m.preventa_precio
    into v_activa, v_inicio, v_fin, v_precio
  from movies m
  where m.id = v_movie;

  -- Precio de preventa mientras la ventana este vigente.
  -- Al terminar, vuelve solo al precio normal de la funcion.
  if coalesce(v_activa, false)
     and v_inicio is not null and v_fin is not null
     and now() >= v_inicio and now() <= v_fin then
    v_base := v_precio;
  end if;

  select tipo into v_tipo from seats where id = p_seat_id;

  if v_tipo = 'vip' then
    select (valor #>> '{}')::numeric into v_recargo
    from app_config where clave = 'recargo_vip_pct';

    v_base := round(v_base * (1 + coalesce(v_recargo, 0) / 100));
  end if;

  return v_base;
end;
$$;

grant execute on function precio_de_butaca(uuid, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- finalizar_compra recalcula el precio de cada entrada antes
-- de sumar el subtotal.
-- ------------------------------------------------------------

create or replace function finalizar_compra(
  p_order_id      uuid,
  p_codigo_cupon  text default null,
  p_usar_credito  boolean default false
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
  v_order     orders%rowtype;
  v_perfil    profiles%rowtype;
  v_cupon     coupons%rowtype;
  v_subtotal  numeric := 0;
  v_descuento numeric := 0;
  v_credito   numeric := 0;
  v_total     numeric := 0;
  v_pagado    numeric := 0;
  v_puntos    integer := 0;
  v_tasa      numeric;
  v_edad      integer;
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

  -- El precio lo fija la base, no el navegador
  update order_tickets t
  set precio = precio_de_butaca(t.showtime_id, t.seat_id)
  where t.order_id = p_order_id;

  -- Y los productos se cobran al precio vigente del catalogo
  update order_products p
  set precio_unit = pr.precio
  from products pr
  where p.product_id = pr.id and p.order_id = p_order_id;

  update order_products p
  set precio_unit = cb.precio
  from combos cb
  where p.combo_id = cb.id and p.order_id = p_order_id;

  select coalesce(sum(precio), 0) into v_subtotal
  from order_tickets where order_id = p_order_id and activo;

  select v_subtotal + coalesce(sum(precio_unit * cantidad), 0) into v_subtotal
  from order_products where order_id = p_order_id;

  if v_order.user_id is not null then
    select * into v_perfil from profiles where id = v_order.user_id;
    v_edad := edad_de(v_perfil.fecha_nacimiento);
  end if;

  if p_codigo_cupon is not null and length(trim(p_codigo_cupon)) > 0 then
    select * into v_cupon
    from coupons
    where upper(codigo) = upper(trim(p_codigo_cupon)) and activo;

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

    update coupons set usos_realizados = usos_realizados + 1 where id = v_cupon.id;
  end if;

  v_total := v_subtotal - v_descuento;

  if p_usar_credito and v_order.user_id is not null and v_perfil.credito > 0 then
    v_credito := least(v_perfil.credito, v_total);
  end if;

  v_pagado := v_total - v_credito;

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
      total         = v_total,
      pagado_real   = v_pagado,
      coupon_id     = v_cupon.id
  where id = p_order_id;

  if v_order.user_id is not null then
    perform set_config('app.bypass_perfil', 'on', true);

    update profiles
    set credito        = credito - v_credito,
        puntos         = puntos + v_puntos,
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
  end if;

  return query
  select v_subtotal, v_descuento, v_credito, v_total, v_pagado, v_puntos;
end;
$$;

grant execute on function finalizar_compra(uuid, text, boolean) to anon, authenticated;
