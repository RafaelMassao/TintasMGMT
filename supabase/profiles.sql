-- ============================================================
-- Tintas Gestão — Tabela de perfis de usuário
-- Execute este script no Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- 1. Tabela de perfis (ligada ao usuário autenticado)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  telefone text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- 2. Permissões de acesso
grant select, insert, update on public.profiles to authenticated;

-- 3. Segurança por linha: cada usuário só vê e edita o próprio perfil
alter table public.profiles enable row level security;

create policy "Usuario le o proprio perfil"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Usuario atualiza o proprio perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4. Atualiza o campo atualizado_em automaticamente
create or replace function public.atualizar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger profiles_atualizado_em
  before update on public.profiles
  for each row execute function public.atualizar_atualizado_em();

-- 5. Cria o perfil automaticamente quando um usuário se cadastra
create or replace function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, email, telefone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'telefone'
  );
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();
