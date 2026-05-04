alter table public.registros
add column if not exists foto_url text;

insert into storage.buckets (id, name, public)
values ('registros-fotos', 'registros-fotos', true)
on conflict (id) do update set public = true;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'registros_fotos_select'
  ) then
    create policy registros_fotos_select
    on storage.objects
    for select
    using (bucket_id = 'registros-fotos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'registros_fotos_insert'
  ) then
    create policy registros_fotos_insert
    on storage.objects
    for insert
    to anon
    with check (bucket_id = 'registros-fotos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'registros_fotos_insert_authenticated'
  ) then
    create policy registros_fotos_insert_authenticated
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'registros-fotos');
  end if;
end $$;
