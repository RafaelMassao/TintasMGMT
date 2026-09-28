-- ============================================================
-- Tintas Gestão — Perfis de acesso (rode DEPOIS do profiles.sql)
-- Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- 1. Lista de perfis
create type public.app_role as enum ('administrador', 'gestor', 'producao', 'estoque', 'vendas', 'manutencao');

-- 2. Tabela que liga usuário ↔ perfil (um usuário pode ter mais de um)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  criado_em timestamptz not null default now(),
  unique (user_id, role)
);

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- 3. Funções de verificação (usadas pelas regras de segurança)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = any(_roles))
$$;

-- Administrador ou gestor (visão total / aprovações)
create or replace function public.is_gestao(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['administrador','gestor']::public.app_role[])
$$;

-- 4. Regras da tabela user_roles
create policy "Usuario ve os proprios perfis" on public.user_roles
  for select to authenticated using (auth.uid() = user_id or public.is_gestao(auth.uid()));

create policy "Somente administrador cria perfis" on public.user_roles
  for insert to authenticated with check (public.has_role(auth.uid(), 'administrador'));

create policy "Somente administrador altera perfis" on public.user_roles
  for update to authenticated using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

create policy "Somente administrador remove perfis" on public.user_roles
  for delete to authenticated using (public.has_role(auth.uid(), 'administrador'));

-- 5. Regras extras na tabela profiles: gestão vê todos, admin edita todos
create policy "Gestao le todos os perfis" on public.profiles
  for select to authenticated using (public.is_gestao(auth.uid()));

create policy "Administrador atualiza qualquer perfil" on public.profiles
  for update to authenticated using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

-- ============================================================
-- 6. PRIMEIRO ADMINISTRADOR — troque o e-mail e rode:
-- insert into public.user_roles (user_id, role)
-- select id, 'administrador' from auth.users where email = 'SEU_EMAIL_AQUI';
-- ============================================================

-- Modelo para as próximas tabelas (ex.: ordens de produção):
--   using (public.is_gestao(auth.uid()) or public.has_role(auth.uid(), 'producao'))
