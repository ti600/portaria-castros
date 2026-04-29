alter table public.registros
  add column if not exists entrada_evento boolean not null default false,
  add column if not exists evento_nome text,
  add column if not exists itens_entrada text;
