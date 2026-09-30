-- ============================================================
-- Tintas Gestão — Schema inicial
-- Ordem: 1) profiles.sql  2) perfis_acesso.sql  3) este arquivo
-- Supabase: SQL Editor → New query → colar → Run
-- ============================================================

-- ---------- 1. Tabela roles (descrição dos perfis) ----------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  codigo public.app_role not null unique,
  nome text not null,
  descricao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.roles (codigo, nome, descricao) values
  ('administrador', 'Administrador', 'Acesso completo ao sistema'),
  ('gestor', 'Gestor', 'Visualiza todos os módulos e aprova alterações importantes'),
  ('producao', 'Produção', 'Produção, envase e perdas'),
  ('estoque', 'Estoque', 'Estoque, compras e inventário'),
  ('vendas', 'Vendas', 'Clientes, pedidos e consulta de estoque'),
  ('manutencao', 'Manutenção', 'Equipamentos, manutenções e paradas')
on conflict (codigo) do nothing;

-- user_roles passa a apontar para roles
do $$ begin
  alter table public.user_roles
    add constraint user_roles_role_fkey foreign key (role) references public.roles (codigo);
exception when duplicate_object then null; end $$;
create index if not exists idx_user_roles_user on public.user_roles (user_id);

-- Função: pode editar (gestão ou um dos perfis informados)
create or replace function public.pode_editar(_roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_gestao(auth.uid()) or public.has_any_role(auth.uid(), _roles)
$$;

-- ---------- 2. Cadastros básicos ----------
create table if not exists public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  sigla text not null unique,
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.cores (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  hex text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.embalagens (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  capacidade numeric(12,3),
  unidade_medida_id uuid references public.unidades_medida (id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  descricao text,
  cor_id uuid references public.cores (id),
  embalagem_id uuid references public.embalagens (id),
  unidade_medida_id uuid references public.unidades_medida (id),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text unique, -- CPF/CNPJ
  email text,
  telefone text,
  cidade text,
  uf char(2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  documento text unique,
  email text,
  telefone text,
  cidade text,
  uf char(2),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.materiais (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  unidade_medida_id uuid references public.unidades_medida (id),
  fornecedor_padrao_id uuid references public.fornecedores (id) on delete set null,
  estoque_minimo numeric(14,3) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$ begin
  create type public.tipo_equipamento as enum ('tanque', 'motor', 'bomba', 'envase', 'maquina_pintura');
exception when duplicate_object then null; end $$;

create table if not exists public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  tipo public.tipo_equipamento not null,
  fabricante text,
  modelo text,
  numero_serie text,
  localizacao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Tanque = detalhe de um equipamento do tipo 'tanque'
create table if not exists public.tanques (
  id uuid primary key default gen_random_uuid(),
  equipamento_id uuid not null unique references public.equipamentos (id) on delete cascade,
  capacidade_litros numeric(12,2) not null check (capacidade_litros > 0),
  material_construcao text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.motivos_perda (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.motivos_atraso (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- 3. Índices ----------
create index if not exists idx_produtos_cor on public.produtos (cor_id);
create index if not exists idx_produtos_embalagem on public.produtos (embalagem_id);
create index if not exists idx_produtos_unidade on public.produtos (unidade_medida_id);
create index if not exists idx_produtos_ativo on public.produtos (ativo);
create index if not exists idx_produtos_nome on public.produtos (nome);
create index if not exists idx_embalagens_unidade on public.embalagens (unidade_medida_id);
create index if not exists idx_materiais_fornecedor on public.materiais (fornecedor_padrao_id);
create index if not exists idx_materiais_unidade on public.materiais (unidade_medida_id);
create index if not exists idx_materiais_ativo on public.materiais (ativo);
create index if not exists idx_clientes_nome on public.clientes (nome);
create index if not exists idx_clientes_ativo on public.clientes (ativo);
create index if not exists idx_fornecedores_nome on public.fornecedores (nome);
create index if not exists idx_fornecedores_ativo on public.fornecedores (ativo);
create index if not exists idx_equipamentos_tipo on public.equipamentos (tipo);
create index if not exists idx_equipamentos_ativo on public.equipamentos (ativo);
create index if not exists idx_cores_ativo on public.cores (ativo);
create index if not exists idx_profiles_ativo on public.profiles (ativo);

-- ---------- 4. Acesso, RLS, gatilho de atualização e regras ----------
-- Leitura: qualquer usuário logado. Criar/editar: gestão + perfis do módulo.
-- Excluir: somente administrador.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('roles',           array[]::text[]),
    ('unidades_medida', array[]::text[]),
    ('motivos_perda',   array[]::text[]),
    ('motivos_atraso',  array[]::text[]),
    ('cores',           array['producao','estoque']),
    ('embalagens',      array['producao','estoque']),
    ('produtos',        array['producao','estoque']),
    ('clientes',        array['vendas']),
    ('fornecedores',    array['estoque']),
    ('materiais',       array['estoque']),
    ('equipamentos',    array['manutencao']),
    ('tanques',         array['manutencao'])
  ) as v(tabela, perfis)
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.tabela);
    execute format('grant all on public.%I to service_role', t.tabela);
    execute format('alter table public.%I enable row level security', t.tabela);

    execute format('drop trigger if exists %I on public.%I', t.tabela || '_atualizado_em', t.tabela);
    execute format('create trigger %I before update on public.%I for each row execute function public.atualizar_atualizado_em()',
      t.tabela || '_atualizado_em', t.tabela);

    execute format('drop policy if exists "Logado le" on public.%I', t.tabela);
    execute format('create policy "Logado le" on public.%I for select to authenticated using (true)', t.tabela);

    execute format('drop policy if exists "Perfil do modulo cria" on public.%I', t.tabela);
    execute format('create policy "Perfil do modulo cria" on public.%I for insert to authenticated with check (public.pode_editar(%L::public.app_role[]))',
      t.tabela, t.perfis);

    execute format('drop policy if exists "Perfil do modulo edita" on public.%I', t.tabela);
    execute format('create policy "Perfil do modulo edita" on public.%I for update to authenticated using (public.pode_editar(%L::public.app_role[])) with check (public.pode_editar(%L::public.app_role[]))',
      t.tabela, t.perfis, t.perfis);

    execute format('drop policy if exists "Administrador exclui" on public.%I', t.tabela);
    execute format('create policy "Administrador exclui" on public.%I for delete to authenticated using (public.has_role(auth.uid(), ''administrador''))', t.tabela);
  end loop;
end $$;

-- ---------- 5. Dados básicos de demonstração ----------
insert into public.unidades_medida (sigla, nome) values
  ('L', 'Litro'), ('mL', 'Mililitro'), ('kg', 'Quilograma'), ('g', 'Grama'), ('un', 'Unidade')
on conflict (sigla) do nothing;

insert into public.motivos_perda (descricao) values
  ('Contaminação'), ('Vazamento'), ('Fora de especificação'), ('Embalagem danificada'), ('Validade vencida')
on conflict (descricao) do nothing;

insert into public.motivos_atraso (descricao) values
  ('Falta de matéria-prima'), ('Equipamento parado'), ('Falta de embalagem'), ('Reprocesso'), ('Falta de mão de obra')
on conflict (descricao) do nothing;

-- ---------- 6. Sem exclusão física nos cadastros ----------
-- Cadastros são apenas inativados (ativo = false) para preservar o histórico
-- de produção, pedidos, estoque e manutenção.
do $$
declare t text;
begin
  foreach t in array array['cores','embalagens','produtos','clientes','fornecedores','materiais',
                           'equipamentos','tanques','motivos_perda','motivos_atraso'] loop
    execute format('drop policy if exists "Administrador exclui" on public.%I', t);
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end $$;
