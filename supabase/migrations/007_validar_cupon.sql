-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 7: validacion previa de cupon
--
-- finalizar_compra valida el cupon al cerrar la compra, cuando la
-- orden y las entradas ya estan creadas. Si el cupon es invalido,
-- la compra se deshace y el usuario pierde su seleccion de butacas.
-- Esta funcion permite validar el cupon ANTES de empezar la compra,
-- con exactamente las mismas reglas.
-- ============================================================

create or replace function validar_cupon(
  p_codigo   text,
  p_subtotal numeric default 0
)
returns table (
  codigo        text,
  descripcion   text,
  descuento_pct numeric,
  descuento     numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cupon  coupons%rowtype;
  v_perfil profiles%rowtype;
  v_edad   integer;
begin
  select * into v_cupon
  from coupons
  where upper(codigo) = upper(trim(p_codigo)) and activo;

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

  if auth.uid() is not null then
    select * into v_perfil from profiles where id = auth.uid();
    v_edad := edad_de(v_perfil.fecha_nacimiento);
  end if;

  if v_cupon.primera_compra then
    if auth.uid() is null then
      raise exception 'El cupon de primera compra requiere una cuenta';
    end if;

    if not v_perfil.primera_compra then
      raise exception 'El cupon de primera compra ya fue utilizado';
    end if;
  end if;

  if v_cupon.edad_minima is not null then
    if auth.uid() is null then
      raise exception 'Ese cupon requiere una cuenta para verificar la edad';
    end if;

    if v_edad < v_cupon.edad_minima then
      raise exception 'Ese cupon es para mayores de % anos', v_cupon.edad_minima;
    end if;
  end if;

  return query
  select v_cupon.codigo,
         v_cupon.descripcion,
         v_cupon.descuento_pct,
         round(p_subtotal * v_cupon.descuento_pct / 100, 2);
end;
$$;

grant execute on function validar_cupon(text, numeric) to anon, authenticated;
