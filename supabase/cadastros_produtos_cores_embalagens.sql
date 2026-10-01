-- ============================================================
-- Tintas Gestão — Produtos, cores e embalagens (melhorias)
-- Rodar DEPOIS do schema_inicial.sql. Pode rodar mais de uma vez.
-- ============================================================

-- ---------- Cores: família ----------
alter table public.cores add column if not exists familia text;
do $$ begin
  alter table public.cores add constraint cores_familia_check check (familia is null or familia in
    ('brancos','neutros','pretos','amarelos','laranjas','vermelhos','rosas','violetas','azuis','verdes','marrons'));
exception when duplicate_object then null; end $$;
create index if not exists idx_cores_familia on public.cores (familia);

-- ---------- Embalagens: volume em litros, código opcional ----------
alter table public.embalagens alter column codigo drop not null;
alter table public.embalagens add column if not exists volume_litros numeric(12,3);
do $$ begin
  alter table public.embalagens add constraint embalagens_volume_check check (volume_litros is null or volume_litros > 0);
exception when duplicate_object then null; end $$;
create unique index if not exists uq_embalagens_nome on public.embalagens (lower(nome));
create index if not exists idx_embalagens_volume on public.embalagens (volume_litros);

-- ---------- Produtos: tipo de tinta e estoque mínimo/máximo ----------
alter table public.produtos add column if not exists tipo_tinta text;
alter table public.produtos add column if not exists estoque_minimo numeric(14,3) not null default 0;
alter table public.produtos add column if not exists estoque_maximo numeric(14,3) not null default 0;
do $$ begin
  alter table public.produtos add constraint produtos_tipo_tinta_check check (tipo_tinta is null or tipo_tinta in
    ('acrilica','latex_pva','esmalte','epoxi','verniz','textura','fundo','outra'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.produtos add constraint produtos_estoque_check
    check (estoque_minimo >= 0 and estoque_maximo >= 0 and estoque_maximo >= estoque_minimo);
exception when duplicate_object then null; end $$;
create index if not exists idx_produtos_tipo_tinta on public.produtos (tipo_tinta);

-- ---------- Códigos duplicados (sem diferenciar maiúsculas) ----------
create unique index if not exists uq_produtos_codigo_ci on public.produtos (lower(codigo));
create unique index if not exists uq_cores_codigo_ci on public.cores (lower(codigo));

-- ---------- Embalagens padrão ----------
insert into public.embalagens (nome, volume_litros, unidade_medida_id)
select v.nome, v.vol, (select id from public.unidades_medida where sigla = 'L')
from (values ('Lata 1 L', 1.0), ('Galão 3,6 L', 3.6), ('Balde 18 L', 18.0)) as v(nome, vol)
where not exists (select 1 from public.embalagens e where lower(e.nome) = lower(v.nome));
