-- =============================================================
-- Tintas Gestão — Complemento da tela de Pedidos
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run
-- Pode rodar mais de uma vez. Depende de: pedidos.sql, producao_envase.sql
-- =============================================================

-- 1. Não deixa marcar como entregue sem a data de entrega
alter table public.pedidos drop constraint if exists pedidos_entregue_com_data;
alter table public.pedidos
  add constraint pedidos_entregue_com_data
  check (status <> 'entregue' or data_entrega is not null);

-- 2. Vendas/gestão pode remover itens de pedidos ainda não entregues
drop policy if exists "Perfil do modulo remove item" on public.itens_pedido;
create policy "Perfil do modulo remove item" on public.itens_pedido
  for delete to authenticated
  using (
    public.pode_editar(array['vendas']::public.app_role[])
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_id and p.status not in ('entregue', 'cancelado')
    )
  );

-- 3. Estoque disponível por produto (provisório, até existir o módulo de Estoque)
--    em_estoque  = unidades aprovadas no envase − unidades já entregues
--    reservado   = itens de pedidos abertos ainda não entregues
--    disponivel  = em_estoque − reservado
create or replace view public.estoque_disponivel
with (security_invoker = true) as
select
  p.id as produto_id,
  coalesce(env.total, 0) as envasado,
  coalesce(ent.total, 0) as entregue,
  coalesce(res.total, 0) as reservado,
  coalesce(env.total, 0) - coalesce(ent.total, 0) as em_estoque,
  coalesce(env.total, 0) - coalesce(ent.total, 0) - coalesce(res.total, 0) as disponivel
from public.produtos p
left join (
  select l.produto_id, sum(e.quantidade_aprovada) as total
  from public.envases e join public.lotes_producao l on l.id = e.lote_id
  group by l.produto_id
) env on env.produto_id = p.id
left join (
  select produto_id, sum(quantidade_entregue) as total
  from public.itens_pedido group by produto_id
) ent on ent.produto_id = p.id
left join (
  select i.produto_id, sum(i.quantidade_solicitada - i.quantidade_entregue) as total
  from public.itens_pedido i join public.pedidos pe on pe.id = i.pedido_id
  where pe.status not in ('entregue', 'cancelado')
  group by i.produto_id
) res on res.produto_id = p.id;

grant select on public.estoque_disponivel to authenticated;
