alter table public.registros
  add column if not exists entrada_evento boolean not null default false,
  add column if not exists operador_entrada_nome text,
  add column if not exists operador_entrada_email text,
  add column if not exists evento_nome text,
  add column if not exists evento_os_numero text,
  add column if not exists evento_recebimento_em text,
  add column if not exists evento_responsavel text,
  add column if not exists evento_fone text,
  add column if not exists evento_lista_foto_url text,
  add column if not exists evento_materiais jsonb,
  add column if not exists itens_entrada text;
