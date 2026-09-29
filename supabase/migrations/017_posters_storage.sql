-- ============================================================
-- TP 1 - Programacion IV - 2026 C2
-- Archivo 17: posters en Supabase Storage
-- ============================================================

-- El admin sube el poster desde su computadora; el archivo queda en
-- el bucket "posters" y su URL publica se guarda en movies.poster_url.
-- Bucket publico: cualquiera puede ver las imagenes por URL (la
-- cartelera es publica), pero solo el admin puede escribir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posters',
  'posters',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "posters admin sube" on storage.objects;
drop policy if exists "posters admin modifica" on storage.objects;
drop policy if exists "posters admin borra" on storage.objects;

create policy "posters admin sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posters' and public.es_admin());

create policy "posters admin modifica" on storage.objects
  for update to authenticated
  using (bucket_id = 'posters' and public.es_admin())
  with check (bucket_id = 'posters' and public.es_admin());

create policy "posters admin borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'posters' and public.es_admin());
