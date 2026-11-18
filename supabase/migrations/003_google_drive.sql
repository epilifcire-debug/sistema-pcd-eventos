-- =====================================================================
-- Sistema PCD Eventos — documentos no Google Drive
-- Rodar no SQL Editor (uma vez).
-- =====================================================================

-- Pasta do Drive vinculada a cada cadastro
alter table public.pessoas add column if not exists drive_pasta_id text;

-- Conexão com a conta Google (só a Edge Function lê; o app nunca vê o token)
create table if not exists public.google_config (
  id              int primary key default 1 check (id = 1),
  email           text,
  refresh_token   text,
  root_folder_id  text,
  conectado_em    timestamptz,
  conectado_por   uuid
);
alter table public.google_config enable row level security;   -- sem políticas = ninguém do app acessa

-- Estado temporário do login do Google (proteção do retorno do OAuth)
create table if not exists public.google_oauth_state (
  state      text primary key,
  user_id    uuid,
  expira_em  timestamptz not null default now() + interval '15 minutes'
);
alter table public.google_oauth_state enable row level security;

-- O app só pergunta "está conectado? com qual conta?"
create or replace function public.google_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.meu_papel() is null then jsonb_build_object('conectado', false)
         else coalesce(
           (select jsonb_build_object('conectado', refresh_token is not null, 'email', email,
                                      'pasta_raiz', root_folder_id, 'conectado_em', conectado_em)
              from public.google_config where id = 1),
           jsonb_build_object('conectado', false)) end
$$;
revoke execute on function public.google_status() from public, anon;
grant execute on function public.google_status() to authenticated;
