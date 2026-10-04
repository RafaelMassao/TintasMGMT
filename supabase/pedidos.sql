-- =============================================================
-- Tintas Gestão — Pedidos e itens de pedido
-- Rode no Supabase: SQL Editor → New query → cole tudo → Run
-- Pode rodar mais de uma vez sem problema.
-- Depende de: profiles.sql, perfis_acesso.sql, schema_inicial.sql,
--             producao_envase.sql (para ligar o lote ao pedido)
-- =============================================================

-- ---------- 1. Status do pedido ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_pedido') then
    create type public.status_pedido as enum (
      'recebido',
      'aguardando_estoque',
      'em_producao',
      'em_separacao',
      'pronto',
      'entregue',
      'atrasado',
      'cancelado'
    );
  end if;
end $$;

-- ---------- 2. Tabela de pedidos ----------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  cliente_id uuid not null references public.clientes (id) on delete restrict,
  data_pedido date not null default current_date,
  prazo_prometido date,
  data_entrega date,
  status public.status_pedido not null default 'recebido',
  valor_total numeric(14,2) not null default 0 check (valor_total >= 0),
  observacoes text,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (prazo_prometido is null or prazo_prometido >= data_pedido),
  check (data_entrega is null or data_entrega >= data_pedido)
);

-- ---------- 3. Tabela de itens do pedido ----------
create table if not exists public.itens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete restrict,
  quantidade_solicitada numeric(14,3) not null check (quantidade_solicitada > 0),
  quantidade_entregue numeric(14,3) not null default 0 check (quantidade_entregue >= 0),
  preco_unitario numeric(14,2) not null check (preco_unitario >= 0),
  valor_total numeric(14,2) not null default 0 check (valor_total >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (quantidade_entregue <= quantidade_solicitada)
);

-- Liga o lote de produção ao pedido (a coluna pedido_id já existia sem ligação)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'lotes_producao_pedido_id_fkey'
  ) then
    alter table public.lotes_producao
      add constraint lotes_producao_pedido_id_fkey
      foreign key (pedido_id) references public.pedidos (id) on delete set null;
  end if;
end $$;

-- ---------- 4. Valor total sempre calculado dos itens ----------
-- 4a. O valor_total do item é sempre quantidade_solicitada × preco_unitario.
--     Mesmo que alguém tente gravar outro valor, o gatilho corrige.
create or replace function public.calcular_valor_item_pedido()
returns trigger
language plpgsql
as $$
begin
  new.valor_total := round(new.quantidade_solicitada * new.preco_unitario, 2);
  return new;
end $$;

drop trigger if exists itens_pedido_valor on public.itens_pedido;
create trigger itens_pedido_valor
  before insert or update of quantidade_solicitada, preco_unitario
  on public.itens_pedido
  for each row execute function public.calcular_valor_item_pedido();

-- 4b. O valor_total do pedido é sempre a soma dos itens.
--     Recalcula em qualquer inclusão, alteração ou remoção de item.
create or replace function public.recalcular_valor_pedido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid;
begin
  alvo := coalesce(new.pedido_id, old.pedido_id);
  update public.pedidos p
     set valor_total = coalesce((
           select sum(i.valor_total) from public.itens_pedido i where i.pedido_id = alvo
         ), 0),
         atualizado_em = now()
   where p.id = alvo;
  return coalesce(new, old);
end $$;

drop trigger if exists itens_pedido_recalcula_pedido on public.itens_pedido;
create trigger itens_pedido_recalcula_pedido
  after insert or update or delete on public.itens_pedido
  for each row execute function public.recalcular_valor_pedido();

-- ---------- 5. Índices ----------
create index if not exists idx_pedidos_cliente on public.pedidos (cliente_id);
create index if not exists idx_pedidos_status on public.pedidos (status);
create index if not exists idx_pedidos_data on public.pedidos (data_pedido);
create index if not exists idx_pedidos_prazo on public.pedidos (prazo_prometido);
create index if not exists idx_pedidos_numero on public.pedidos (numero);
create index if not exists idx_itens_pedido on public.itens_pedido (pedido_id);
create index if not exists idx_itens_produto on public.itens_pedido (produto_id);
create index if not exists idx_lotes_pedido on public.lotes_producao (pedido_id);

-- ---------- 6. Acesso, RLS e gatilho de atualização ----------
-- Leitura: qualquer usuário logado. Criar/editar: gestão + perfil vendas.
-- Excluir: somente administrador.
do $$
declare
  t text;
begin
  foreach t in array array['pedidos', 'itens_pedido'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop trigger if exists %I on public.%I', t || '_atualizado_em', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.atualizar_atualizado_em()',
      t || '_atualizado_em', t);

    execute format('drop policy if exists "Logado le" on public.%I', t);
    execute format('create policy "Logado le" on public.%I for select to authenticated using (true)', t);

    execute format('drop policy if exists "Perfil do modulo cria" on public.%I', t);
    execute format('create policy "Perfil do modulo cria" on public.%I for insert to authenticated with check (public.pode_editar(array[''vendas'']::public.app_role[]))', t);

    execute format('drop policy if exists "Perfil do modulo edita" on public.%I', t);
    execute format('create policy "Perfil do modulo edita" on public.%I for update to authenticated using (public.pode_editar(array[''vendas'']::public.app_role[])) with check (public.pode_editar(array[''vendas'']::public.app_role[]))', t);

    execute format('drop policy if exists "Administrador exclui" on public.%I', t);
    execute format('create policy "Administrador exclui" on public.%I for delete to authenticated using (public.has_role(auth.uid(), ''administrador''))', t);
  end loop;
end $$;
