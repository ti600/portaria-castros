create table if not exists public.logs_sistema (
  id uuid primary key default gen_random_uuid(),
  acao text not null,
  detalhes text,
  usuario_email text,
  usuario_nome text,
  created_at timestamptz not null default now()
);

alter table public.logs_sistema enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'logs_sistema'
      and policyname = 'logs_sistema_select_authenticated'
  ) then
    create policy logs_sistema_select_authenticated
    on public.logs_sistema
    for select
    to authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'logs_sistema'
      and policyname = 'logs_sistema_insert_authenticated'
  ) then
    create policy logs_sistema_insert_authenticated
    on public.logs_sistema
    for insert
    to authenticated
    with check (true);
  end if;
end $$;
