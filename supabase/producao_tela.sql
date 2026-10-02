-- ============================================================
-- Tintas Gestão — Tela de Produção: observações e histórico dos lotes
-- Rodar DEPOIS do producao_envase.sql. Pode rodar mais de uma vez.
-- ============================================================

-- ---------- Observações registradas no lote ----------
create table if not exists public.lote_observacoes (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_producao (id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  autor_id uuid references auth.users (id) default auth.uid(),
  autor_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_lote_obs_lote on public.lote_observacoes (lote_id, criado_em desc);

-- ---------- Histórico de alterações (preenchido automaticamente) ----------
create table if not exists public.lote_historico (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.lotes_producao (id) on delete cascade,
  acao text not null,
  status_anterior public.status_lote,
  status_novo public.status_lote,
  alteracoes jsonb,
  usuario_id uuid default auth.uid(),
  usuario_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_lote_hist_lote on public.lote_historico (lote_id, criado_em desc);

grant select, insert on public.lote_observacoes to authenticated;
grant select on public.lote_historico to authenticated;
grant all on public.lote_observacoes to service_role;
grant all on public.lote_historico to service_role;

alter table public.lote_observacoes enable row level security;
alter table public.lote_historico enable row level security;

drop policy if exists "lote_obs_ler" on public.lote_observacoes;
create policy "lote_obs_ler" on public.lote_observacoes for select to authenticated using (true);
drop policy if exists "lote_obs_criar" on public.lote_observacoes;
create policy "lote_obs_criar" on public.lote_observacoes for insert to authenticated
  with check (autor_id = auth.uid() and (public.is_gestao(auth.uid()) or public.has_role(auth.uid(), 'producao')));

drop policy if exists "lote_hist_ler" on public.lote_historico;
create policy "lote_hist_ler" on public.lote_historico for select to authenticated using (true);
-- Ninguém escreve direto no histórico: só o gatilho abaixo.

create or replace function public.registrar_historico_lote()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mudancas jsonb := '{}'::jsonb;
  campo text;
  nome text;
begin
  select p.nome into nome from public.profiles p where p.id = auth.uid();
  if tg_op = 'INSERT' then
    insert into public.lote_historico (lote_id, acao, status_novo, usuario_id, usuario_nome)
    values (new.id, 'criado', new.status, auth.uid(), nome);
    return new;
  end if;
  foreach campo in array array['numero_lote','produto_id','tanque_id','quantidade_planejada','quantidade_produzida',
    'volume_planejado_litros','volume_produzido_litros','data_planejada','inicio_producao','fim_producao','observacoes'] loop
    if (to_jsonb(old) -> campo) is distinct from (to_jsonb(new) -> campo) then
      mudancas := mudancas || jsonb_build_object(campo, jsonb_build_object('de', to_jsonb(old) -> campo, 'para', to_jsonb(new) -> campo));
    end if;
  end loop;
  if old.status is distinct from new.status or mudancas <> '{}'::jsonb then
    insert into public.lote_historico (lote_id, acao, status_anterior, status_novo, alteracoes, usuario_id, usuario_nome)
    values (new.id, case when old.status is distinct from new.status then 'status' else 'editado' end,
      old.status, new.status, nullif(mudancas, '{}'::jsonb), auth.uid(), nome);
  end if;
  return new;
end $$;

drop trigger if exists lotes_producao_historico on public.lotes_producao;
create trigger lotes_producao_historico after insert or update on public.lotes_producao
  for each row execute function public.registrar_historico_lote();

-- ---------- Regra no banco: não concluir sem quantidade produzida ----------
alter table public.lotes_producao drop constraint if exists lotes_concluido_com_quantidade;
alter table public.lotes_producao add constraint lotes_concluido_com_quantidade
  check (status not in ('concluido', 'parcialmente_concluido') or quantidade_produzida > 0) not valid;
