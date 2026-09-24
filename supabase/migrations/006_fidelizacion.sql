-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 6: cupones, credito, puntos y cancelacion
-- ============================================================

-- ------------------------------------------------------------
-- 1. El trigger que protege el perfil debe dejar pasar a las
--    funciones internas que acreditan credito y puntos.
--    La bandera es local a la transaccion y solo la activan
--    las funciones security definer de este archivo.
-- ------------------------------------------------------------

create or replace function proteger_campos_perfil()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null
     or es_admin()
     or coalesce(current_setting('app.bypass_perfil', true), '') = 'on' then
    return new;
  end if;

  new.rol     := old.rol;
  new.credito := old.credito;
  new.puntos  := old.puntos;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2. Cierre de compra: recalcula el total desde la base,
--    aplica cupon y credito, y acredita puntos.
--    El subtotal NUNCA se toma del cliente.
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

  select coalesce(sum(precio), 0) into v_subtotal
  from order_tickets where order_id = p_order_id and activo;

  select v_subtotal + coalesce(sum(precio_unit * cantidad), 0) into v_subtotal
  from order_products where order_id = p_order_id;

  if v_order.user_id is not null then
    select * into v_perfil from profiles where id = v_order.user_id;
    v_edad := edad_de(v_perfil.fecha_nacimiento);
  end if;

  -- Cupon
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

-- ------------------------------------------------------------
-- 3. Cancelacion: libera butacas y devuelve el importe
--    como credito de cuenta, nunca como dinero.
-- ------------------------------------------------------------

create or replace function cancelar_compra(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  orders%rowtype;
  v_inicio timestamptz;
  v_horas  integer;
  v_puntos integer;
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

    perform set_config('app.bypass_perfil', 'on', true);

    update profiles
    set credito = credito + v_order.total,
        puntos  = greatest(puntos - v_puntos, 0)
    where id = v_order.user_id;

    insert into credit_ledger (user_id, order_id, monto, motivo)
    values (v_order.user_id, p_order_id, v_order.total, 'cancelacion');

    if v_puntos > 0 then
      insert into points_ledger (user_id, order_id, puntos, motivo)
      values (v_order.user_id, p_order_id, -v_puntos, 'cancelacion');
    end if;
  end if;

  return v_order.total;
end;
$$;

grant execute on function cancelar_compra(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Politica de borrado para el rollback del checkout.
--    Si finalizar_compra falla, el cliente borra la orden a medio
--    armar. Sin esta politica el borrado se ignoraba en silencio
--    y la orden huerfana seguia ocupando butacas.
--    Solo alcanza a ordenes propias que nunca se cerraron.
-- ------------------------------------------------------------

drop policy if exists "borrar compra pendiente" on orders;

create policy "borrar compra pendiente" on orders
  for delete using (
    estado = 'pendiente'
    and (user_id = auth.uid() or user_id is null)
  );
