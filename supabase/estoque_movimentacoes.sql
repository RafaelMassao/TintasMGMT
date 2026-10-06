-- ============================================================
-- ESTOQUE — MOVIMENTAÇÕES
-- Rode este arquivo no SQL Editor do Supabase (New query → Run).
-- Pode rodar mais de uma vez sem problema.
-- Depende de: schema_inicial.sql, producao_envase.sql, pedidos.sql
-- ============================================================

-- 1) Tipos de movimentação permitidos
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_movimentacao') then
    create type public.tipo_movimentacao as enum (
      'entrada_compra',
      'entrada_producao',
      'saida_producao',
      'saida_venda',
      'saida_perda',
      'ajuste_positivo',
      'ajuste_negativo',
      'transferencia'
    );
  end if;
end $$;

-- 2) Tabela de movimentações
create table if not exists public.estoque_movimentacoes (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references public.materiais(id) on delete restrict,
  produto_id uuid references public.produtos(id) on delete restrict,
  tipo_movimentacao public.tipo_movimentacao not null,
  quantidade numeric(14,3) not null,
  unidade_medida text not null,
  data_movimentacao timestamptz not null default now(),
  lote_id uuid references public.lotes_producao(id) on delete set null,
  pedido_id uuid references public.pedidos(id) on delete set null,
  fornecedor_id uuid references public.fornecedores(id) on delete set null,
  motivo text,
  usuario_id uuid references auth.users(id) default auth.uid(),
  criado_em timestamptz not null default now(),

  -- Quantidade sempre positiva (o tipo da movimentação define se entra ou sai)
  constraint estoque_mov_quantidade_positiva check (quantidade > 0),

  -- Cada movimentação é de UM item: ou material, ou produto (nunca os dois, nunca nenhum)
  constraint estoque_mov_um_item check (
    (material_id is not null and produto_id is null)
    or (material_id is null and produto_id is not null)
  ),

  -- Toda movimentação precisa de uma origem (lote, pedido ou fornecedor) ou de um motivo
  constraint estoque_mov_origem_ou_motivo check (
    lote_id is not null
    or pedido_id is not null
    or fornecedor_id is not null
    or nullif(btrim(coalesce(motivo, '')), '') is not null
  ),

  -- Ajustes e transferências sempre exigem motivo escrito
  constraint estoque_mov_ajuste_exige_motivo check (
    tipo_movimentacao not in ('ajuste_positivo', 'ajuste_negativo', 'transferencia')
    or nullif(btrim(coalesce(motivo, '')), '') is not null
  )
);

comment on table public.estoque_movimentacoes is
  'Livro-razão do estoque: cada linha é uma entrada ou saída. O saldo é sempre calculado a partir destas linhas (view v_estoque_saldo), nunca armazenado à parte.';

-- 3) Índices para filtros e relatórios
create index if not exists estoque_mov_produto_idx on public.estoque_movimentacoes (produto_id) where produto_id is not null;
create index if not exists estoque_mov_material_idx on public.estoque_movimentacoes (material_id) where material_id is not null;
create index if not exists estoque_mov_tipo_idx on public.estoque_movimentacoes (tipo_movimentacao);
create index if not exists estoque_mov_data_idx on public.estoque_movimentacoes (data_movimentacao desc);
create index if not exists estoque_mov_lote_idx on public.estoque_movimentacoes (lote_id) where lote_id is not null;
create index if not exists estoque_mov_pedido_idx on public.estoque_movimentacoes (pedido_id) where pedido_id is not null;
create index if not exists estoque_mov_fornecedor_idx on public.estoque_movimentacoes (fornecedor_id) where fornecedor_id is not null;

-- 4) Saldo atual por item (view — calculada na hora, sem saldo duplicado)
--    Entradas somam, saídas subtraem; ajuste_positivo soma, ajuste_negativo subtrai.
create or replace view public.v_estoque_saldo as
select
  coalesce(produto_id, material_id) as item_id,
  case when produto_id is not null then 'produto' else 'material' end as tipo_item,
  produto_id,
  material_id,
  sum(
    case
      when tipo_movimentacao in ('entrada_compra', 'entrada_producao', 'ajuste_positivo') then quantidade
      when tipo_movimentacao in ('saida_producao', 'saida_venda', 'saida_perda', 'ajuste_negativo') then -quantidade
      else 0 -- transferencia: o saldo é movido por um par de movimentações (saída + entrada)
    end
  ) as saldo,
  count(*) as total_movimentacoes,
  max(data_movimentacao) as ultima_movimentacao
from public.estoque_movimentacoes
group by produto_id, material_id;

comment on view public.v_estoque_saldo is
  'Saldo atual de cada produto/material, calculado a partir das movimentações. Transferências devem ser registradas em pares (ajuste_negativo na origem + ajuste_positivo no destino) ou tratadas na aplicação.';

-- 5) Segurança (RLS)
alter table public.estoque_movimentacoes enable row level security;

-- Leitura: qualquer usuário logado
drop policy if exists estoque_mov_select on public.estoque_movimentacoes;
create policy estoque_mov_select on public.estoque_movimentacoes
  for select to authenticated using (true);

-- Registrar movimentação: estoque, produção, vendas, gestor e administrador
drop policy if exists estoque_mov_insert on public.estoque_movimentacoes;
create policy estoque_mov_insert on public.estoque_movimentacoes
  for insert to authenticated
  with check (
    public.is_gestao()
    or public.has_any_role(array['estoque', 'producao', 'vendas']::public.app_role[])
  );

-- Corrigir ou apagar movimentação: só administrador (o histórico é sagrado)
drop policy if exists estoque_mov_update on public.estoque_movimentacoes;
create policy estoque_mov_update on public.estoque_movimentacoes
  for update to authenticated
  using (public.has_role('administrador'))
  with check (public.has_role('administrador'));

drop policy if exists estoque_mov_delete on public.estoque_movimentacoes;
create policy estoque_mov_delete on public.estoque_movimentacoes
  for delete to authenticated
  using (public.has_role('administrador'));
