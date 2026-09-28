-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 13: suscripciones a notificaciones push
-- ============================================================

-- Cada navegador que acepta notificaciones genera una suscripcion
-- (endpoint + claves). Un usuario puede tener varias (PC, celular).
-- El envio lo hace la Edge Function notificar-estrenos con la
-- service role, que no pasa por RLS.

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_user on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists "suscripciones propias" on push_subscriptions;
create policy "suscripciones propias" on push_subscriptions
  for select using (user_id = auth.uid());

drop policy if exists "borrar suscripcion propia" on push_subscriptions;
create policy "borrar suscripcion propia" on push_subscriptions
  for delete using (user_id = auth.uid());

-- El alta pasa por esta funcion y no por un insert directo:
-- si el mismo navegador ya estaba suscripto con otra cuenta,
-- la suscripcion se reasigna al usuario actual en vez de fallar
-- por el endpoint unico.
create or replace function registrar_suscripcion_push(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesion para recibir notificaciones';
  end if;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh  = excluded.p256dh,
        auth    = excluded.auth;
end;
$$;

grant execute on function registrar_suscripcion_push(text, text, text) to authenticated;
