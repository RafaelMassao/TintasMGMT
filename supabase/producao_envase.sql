-- ============================================================
-- Tintas Gestão — Produção e envase
-- Rodar DEPOIS do schema_inicial.sql. Pode rodar mais de uma vez.
-- ============================================================

-- ---------- Status do lote ----------
do $$ begin
  create type public.status_lote as enum (
    'planejado', 'em_preparacao', 'em_producao', 'aguardando_envase',
    'concluido', 'parcialmente_concluido', 'atrasado', 'cancelado'
  );
exception when duplicate_object then null; end $$;

-- ---------- 1. Lotes de produção ----------
create table if not exists public.lotes_producao (
  id uuid primary key default gen_random_uuid(),
  numero_lote text not null unique,
  produto_id uuid not null references public.produtos (id),
  tanque_id uuid references public.tanques (id),
  pedido_id uuid, -- FK será adicionada quando a tabela de pedidos existir
  quantidade_planejada numeric(14,3) not null default 0 check (quantidade_planejada >= 0),
  quantidade_produzida numeric(14,3) not null default 0 check (quantidade_produzida >= 0),
  volume_planejado_litros numeric(14,3) not null default 0 check (volume_planejado_litros >= 0),
  volume_produzido_litros numeric(14,3) not null default 0 check (volume_produzido_litros >= 0),
  data_planejada date,
  inicio_producao timestamptz,
  fim_producao timestamptz,
  status public.status_lote not null default 'planejado',
  observacoes text,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim_producao is null or inicio_producao is null or fim_producao >= inicio_producao)
);

-- ---------- 2. Envases ----------
create table if not exists public.envases (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_producao (id) on delete restrict,
  embalagem_id uuid not null references public.embalagens (id),
  quantidade_planejada numeric(14,3) not null default 0 check (quantidade_planejada >= 0),
  quantidade_aprovada numeric(14,3) not null default 0 check (quantidade_aprovada >= 0),
  quantidade_rejeitada numeric(14,3) not null default 0 check (quantidade_rejeitada >= 0),
  inicio_envase timestamptz,
  fim_envase timestamptz,
  operador_id uuid references auth.users (id),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (fim_envase is null or inicio_envase is null or fim_envase >= inicio_envase),
  check (quantidade_aprovada + quantidade_rejeitada <= quantidade_planejada or quantidade_planejada = 0)
);

-- ---------- 3. Índices ----------
create index if not exists idx_lotes_produto on public.lotes_producao (produto_id);
create index if not exists idx_lotes_tanque on public.lotes_producao (tanque_id);
create index if not exists idx_lotes_status on public.lotes_producao (status);
create index if not exists idx_lotes_data_planejada on public.lotes_producao (data_planejada);
create index if not exists idx_lotes_inicio on public.lotes_producao (inicio_producao);
create index if not exists idx_lotes_numero on public.lotes_producao (numero_lote);
create index if not exists idx_envases_lote on public.envases (lote_id);
create index if not exists idx_envases_embalagem on public.envases (embalagem_id);
create index if not exists idx_envases_inicio on public.envases (inicio_envase);

-- ---------- 4. Acesso, RLS e gatilho de atualização ----------
-- Leitura: qualquer usuário logado. Criar/editar: gestão + perfil produção.
-- Excluir: somente administrador.
do $$
declare
  t text;
begin
  foreach t in array array['lotes_producao', 'envases'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop trigger if exists %I on public.%I', t || '_atualizado_em', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.atualizar_atualizado_em()',
      t || '_atualizado_em', t);

    execute format('drop policy if exists "Logado le" on public.%I', t);
    execute format('create policy "Logado le" on public.%I for select to authenticated using (true)', t);

    execute format('drop policy if exists "Perfil do modulo cria" on public.%I', t);
    execute format('create policy "Perfil do modulo cria" on public.%I for insert to authenticated with check (public.pode_editar(array[''producao'']::public.app_role[]))', t);

    execute format('drop policy if exists "Perfil do modulo edita" on public.%I', t);
    execute format('create policy "Perfil do modulo edita" on public.%I for update to authenticated using (public.pode_editar(array[''producao'']::public.app_role[])) with check (public.pode_editar(array[''producao'']::public.app_role[]))', t);

    execute format('drop policy if exists "Administrador exclui" on public.%I', t);
    execute format('create policy "Administrador exclui" on public.%I for delete to authenticated using (public.has_role(auth.uid(), ''administrador''))', t);
  end loop;
end $$;
