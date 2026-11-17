-- =====================================================================
-- Sistema PCD Eventos — schema completo (Supabase / Postgres)
-- Rodar inteiro no SQL Editor do Supabase (uma vez).
-- =====================================================================

create extension if not exists pgcrypto;

-- ID em texto (compatível com os IDs que vieram do Base44)
create or replace function public.novo_id() returns text
language sql volatile as $$ select replace(gen_random_uuid()::text, '-', '') $$;

-- ---------------------------------------------------------------------
-- Perfis de usuário (ligados ao auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nome              text not null default '',
  email             text not null default '',
  role              text not null default 'user' check (role in ('admin','user','leitor')),
  acesso_conferidos boolean not null default true,
  acesso_abada      boolean not null default true,
  ativo             boolean not null default true,
  trocar_senha      boolean not null default false,
  created_at        timestamptz not null default now()
);

-- Papel do usuário logado (null se não tiver perfil ou estiver inativo)
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() in ('admin','user'), false)
$$;

-- ---------------------------------------------------------------------
-- Eventos
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id          text primary key default public.novo_id(),
  nome        text not null,
  data        date,
  local       text,
  descricao   text,
  ativo       boolean not null default true,
  imagem_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pessoas (cadastro PCD)
-- ---------------------------------------------------------------------
create table if not exists public.pessoas (
  id                text primary key default public.novo_id(),
  nome              text not null,
  cpf               text not null,
  cpf_digitos       text generated always as (regexp_replace(cpf, '\D', '', 'g')) stored,
  telefone          text,
  email             text,
  tipo_deficiencia  text,
  cid               text,
  acompanhante      text,
  cpf_acompanhante  text,
  observacoes       text,
  status            text not null default 'ativo' check (status in ('ativo','inativo')),
  foto_path         text,                      -- caminho no bucket "fotos"
  documentos        jsonb not null default '[]'::jsonb,  -- [{ nome, path }] no bucket "documentos"
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists pessoas_cpf_idx on public.pessoas (cpf_digitos);

-- ---------------------------------------------------------------------
-- Inscrições (pessoa x evento) com check-in e abadá
-- ---------------------------------------------------------------------
create table if not exists public.inscricoes (
  id                  bigint generated always as identity primary key,
  pessoa_id           text not null references public.pessoas(id) on delete cascade,
  evento_id           text not null references public.eventos(id) on delete cascade,
  status              text not null default 'ativa' check (status in ('ativa','cancelada')),
  motivo_cancelamento text,       -- manual | evento_desativado | expired_cancelled_event | importado
  inscrito_em         timestamptz not null default now(),
  cancelado_em        timestamptz,
  conferido           boolean not null default false,
  conferido_em        timestamptz,  -- null em conferidos antigos (sem horário registrado)
  conferido_por       text,
  abada               boolean not null default false,
  abada_em            timestamptz,
  abada_por           text,
  unique (pessoa_id, evento_id)
);
create index if not exists inscricoes_evento_idx on public.inscricoes (evento_id);

-- ---------------------------------------------------------------------
-- Histórico de cancelamentos
-- ---------------------------------------------------------------------
create table if not exists public.historico_cancelamento (
  id               text primary key default public.novo_id(),
  evento_id        text,
  evento_nome      text,
  pessoa_id        text,
  pessoa_nome      text,
  status_anterior  text,
  novo_status      text,
  data_alteracao   timestamptz not null default now(),
  origem           text,
  motivo           text
);

-- updated_at automático
create or replace function public.tg_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists eventos_upd on public.eventos;
create trigger eventos_upd before update on public.eventos for each row execute function public.tg_updated_at();
drop trigger if exists pessoas_upd on public.pessoas;
create trigger pessoas_upd before update on public.pessoas for each row execute function public.tg_updated_at();

-- Ao desativar um evento, cancela as inscrições ativas (regra do sistema original)
create or replace function public.tg_evento_desativado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.ativo and not new.ativo then
    insert into historico_cancelamento (evento_id, evento_nome, pessoa_id, pessoa_nome, status_anterior, novo_status, origem, motivo)
      select new.id, new.nome, p.id, p.nome, 'inscrito', 'desmarcado', 'evento_desativado', 'evento_desativado'
      from inscricoes i join pessoas p on p.id = i.pessoa_id
      where i.evento_id = new.id and i.status = 'ativa';
    update inscricoes set status = 'cancelada', motivo_cancelamento = 'evento_desativado', cancelado_em = now()
      where evento_id = new.id and status = 'ativa';
  end if;
  return new;
end $$;
drop trigger if exists evento_desativado on public.eventos;
create trigger evento_desativado after update of ativo on public.eventos
  for each row execute function public.tg_evento_desativado();

-- ---------------------------------------------------------------------
-- Funções chamadas pelo app
-- ---------------------------------------------------------------------

-- Cancela inscrições de eventos que já passaram ou estão inativos (registra histórico)
create or replace function public.cancelar_inscricoes_expiradas() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.meu_papel() is null and auth.uid() is not null then
    raise exception 'sem permissão';
  end if;
  insert into historico_cancelamento (evento_id, evento_nome, pessoa_id, pessoa_nome, status_anterior, novo_status, origem, motivo)
    select e.id, e.nome, p.id, p.nome, 'inscrito', 'desmarcado', 'automatic_system', 'expired_cancelled_event'
    from inscricoes i
    join eventos e on e.id = i.evento_id
    join pessoas p on p.id = i.pessoa_id
    where i.status = 'ativa'
      and (not e.ativo or e.data < (now() at time zone 'America/Sao_Paulo')::date);
  get diagnostics n = row_count;
  update inscricoes i set status = 'cancelada', motivo_cancelamento = 'expired_cancelled_event', cancelado_em = now()
    from eventos e
    where e.id = i.evento_id and i.status = 'ativa'
      and (not e.ativo or e.data < (now() at time zone 'America/Sao_Paulo')::date);
  return n;
end $$;

-- Check-in (conferir / desfazer). Leitor só confere, não desfaz.
create or replace function public.marcar_conferido(p_pessoa text, p_evento text, p_valor boolean)
returns public.inscricoes
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.meu_papel();
  v_nome text;
  v_ok   boolean;
  r      public.inscricoes;
begin
  select nome, acesso_conferidos into v_nome, v_ok from profiles where id = auth.uid();
  if v_role is null then raise exception 'sem permissão'; end if;
  if v_role = 'leitor' and not v_ok then raise exception 'sem acesso à conferência'; end if;
  if v_role = 'leitor' and not p_valor then raise exception 'leitor não pode desfazer conferência'; end if;

  if p_valor then
    update inscricoes set conferido = true,
           conferido_em  = coalesce(conferido_em, now()),
           conferido_por = coalesce(conferido_por, nullif(v_nome, ''))
     where pessoa_id = p_pessoa and evento_id = p_evento
     returning * into r;
  else
    update inscricoes set conferido = false, conferido_em = null, conferido_por = null
     where pessoa_id = p_pessoa and evento_id = p_evento
     returning * into r;
  end if;
  if r.id is null then raise exception 'pessoa não inscrita neste evento'; end if;
  return r;
end $$;

-- Retirada de abadá (retirar / desfazer). Leitor só retira, não desfaz.
create or replace function public.marcar_abada(p_pessoa text, p_evento text, p_valor boolean)
returns public.inscricoes
language plpgsql security definer set search_path = public as $$
declare
  v_role text := public.meu_papel();
  v_nome text;
  v_ok   boolean;
  r      public.inscricoes;
begin
  select nome, acesso_abada into v_nome, v_ok from profiles where id = auth.uid();
  if v_role is null then raise exception 'sem permissão'; end if;
  if v_role = 'leitor' and not v_ok then raise exception 'sem acesso à retirada de abadá'; end if;
  if v_role = 'leitor' and not p_valor then raise exception 'leitor não pode desfazer retirada'; end if;

  if p_valor then
    update inscricoes set abada = true,
           abada_em  = coalesce(abada_em, now()),
           abada_por = coalesce(abada_por, nullif(v_nome, ''))
     where pessoa_id = p_pessoa and evento_id = p_evento
     returning * into r;
  else
    update inscricoes set abada = false, abada_em = null, abada_por = null
     where pessoa_id = p_pessoa and evento_id = p_evento
     returning * into r;
  end if;
  if r.id is null then raise exception 'pessoa não inscrita neste evento'; end if;
  return r;
end $$;

-- Usuário marca que já trocou a senha provisória
create or replace function public.senha_alterada() returns void
language sql security definer set search_path = public as $$
  update profiles set trocar_senha = false where id = auth.uid()
$$;

-- Reset geral (somente admin): apaga pessoas, eventos, inscrições e histórico
create or replace function public.resetar_sistema() returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.meu_papel(), '') <> 'admin' then raise exception 'somente admin'; end if;
  delete from inscricoes where true;
  delete from historico_cancelamento where true;
  delete from pessoas where true;
  delete from eventos where true;
end $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles               enable row level security;
alter table public.eventos                enable row level security;
alter table public.pessoas                enable row level security;
alter table public.inscricoes             enable row level security;
alter table public.historico_cancelamento enable row level security;

drop policy if exists profiles_sel on public.profiles;
create policy profiles_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists eventos_sel on public.eventos;
create policy eventos_sel on public.eventos for select to authenticated using (public.meu_papel() is not null);
drop policy if exists eventos_ins on public.eventos;
create policy eventos_ins on public.eventos for insert to authenticated with check (public.is_staff());
drop policy if exists eventos_upd on public.eventos;
create policy eventos_upd on public.eventos for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists eventos_del on public.eventos;
create policy eventos_del on public.eventos for delete to authenticated using (public.is_staff());

drop policy if exists pessoas_sel on public.pessoas;
create policy pessoas_sel on public.pessoas for select to authenticated using (public.meu_papel() is not null);
drop policy if exists pessoas_ins on public.pessoas;
create policy pessoas_ins on public.pessoas for insert to authenticated with check (public.is_staff());
drop policy if exists pessoas_upd on public.pessoas;
create policy pessoas_upd on public.pessoas for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists pessoas_del on public.pessoas;
create policy pessoas_del on public.pessoas for delete to authenticated using (public.is_staff());

drop policy if exists insc_sel on public.inscricoes;
create policy insc_sel on public.inscricoes for select to authenticated using (public.meu_papel() is not null);
drop policy if exists insc_ins on public.inscricoes;
create policy insc_ins on public.inscricoes for insert to authenticated with check (public.is_staff());
drop policy if exists insc_upd on public.inscricoes;
create policy insc_upd on public.inscricoes for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists insc_del on public.inscricoes;
create policy insc_del on public.inscricoes for delete to authenticated using (public.is_staff());

drop policy if exists hist_sel on public.historico_cancelamento;
create policy hist_sel on public.historico_cancelamento for select to authenticated using (public.is_staff());
drop policy if exists hist_ins on public.historico_cancelamento;
create policy hist_ins on public.historico_cancelamento for insert to authenticated with check (public.is_staff());

-- Funções: só usuários logados
revoke execute on function public.marcar_conferido(text,text,boolean)  from public, anon;
revoke execute on function public.marcar_abada(text,text,boolean)      from public, anon;
revoke execute on function public.cancelar_inscricoes_expiradas()      from public, anon;
revoke execute on function public.resetar_sistema()                    from public, anon;
revoke execute on function public.senha_alterada()                     from public, anon;
grant  execute on function public.marcar_conferido(text,text,boolean)  to authenticated;
grant  execute on function public.marcar_abada(text,text,boolean)      to authenticated;
grant  execute on function public.cancelar_inscricoes_expiradas()      to authenticated;
grant  execute on function public.resetar_sistema()                    to authenticated;
grant  execute on function public.senha_alterada()                     to authenticated;

-- ---------------------------------------------------------------------
-- Storage: fotos e documentos privados (LGPD), imagens de evento públicas
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('fotos', 'fotos', false),
  ('documentos', 'documentos', false),
  ('eventos', 'eventos', true)
on conflict (id) do nothing;

drop policy if exists pcd_storage_sel on storage.objects;
create policy pcd_storage_sel on storage.objects for select to authenticated
  using (bucket_id in ('fotos','documentos','eventos') and public.meu_papel() is not null);
drop policy if exists pcd_storage_ins on storage.objects;
create policy pcd_storage_ins on storage.objects for insert to authenticated
  with check (bucket_id in ('fotos','documentos','eventos') and public.is_staff());
drop policy if exists pcd_storage_upd on storage.objects;
create policy pcd_storage_upd on storage.objects for update to authenticated
  using (bucket_id in ('fotos','documentos','eventos') and public.is_staff());
drop policy if exists pcd_storage_del on storage.objects;
create policy pcd_storage_del on storage.objects for delete to authenticated
  using (bucket_id in ('fotos','documentos','eventos') and public.is_staff());

-- ---------------------------------------------------------------------
-- (Opcional) rodar a limpeza todo dia às 04:00 de Brasília (07:00 UTC).
-- Ative a extensão pg_cron em Database > Extensions e descomente:
-- select cron.schedule('pcd-expiradas', '0 7 * * *', $$select public.cancelar_inscricoes_expiradas()$$);
-- ---------------------------------------------------------------------

-- Atualização em tempo real das conferências entre aparelhos (Supabase Realtime)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inscricoes') then
    alter publication supabase_realtime add table public.inscricoes;
  end if;
end $$;
