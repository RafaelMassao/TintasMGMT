-- ============================================================
-- IMPACTO DAS PARADAS — contexto produtivo e visão consolidada
-- Executar manualmente no Supabase SQL Editor depois de:
-- schema_inicial.sql, producao_envase.sql, pedidos.sql e manutencao.sql.
-- ============================================================

ALTER TABLE public.paradas_equipamento
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes_producao(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantidade_nao_produzida numeric(14,3),
  ADD COLUMN IF NOT EXISTS unidade_nao_produzida text NOT NULL DEFAULT 'L',
  ADD COLUMN IF NOT EXISTS atraso_causado_minutos integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.paradas_equipamento
    ADD CONSTRAINT paradas_quantidade_perdida_nao_negativa
    CHECK (quantidade_nao_produzida IS NULL OR quantidade_nao_produzida >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.paradas_equipamento
    ADD CONSTRAINT paradas_unidade_perdida_nao_vazia
    CHECK (nullif(btrim(unidade_nao_produzida), '') IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.paradas_equipamento
    ADD CONSTRAINT paradas_atraso_causado_nao_negativo
    CHECK (atraso_causado_minutos >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS paradas_lote_impactado_idx
  ON public.paradas_equipamento (lote_id) WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS paradas_pedido_impactado_idx
  ON public.paradas_equipamento (pedido_id) WHERE pedido_id IS NOT NULL;

-- Duração em minutos é calculada a partir das datas; parada ainda aberta vai
-- até o instante atual. O atraso causado é um valor operacional informado no
-- registro, pois depende da programação e não é igual à duração da parada.
CREATE OR REPLACE VIEW public.v_paradas_impacto
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.equipamento_id,
  e.codigo AS equipamento_codigo,
  e.nome AS equipamento_nome,
  p.manutencao_id,
  m.tipo AS manutencao_tipo,
  p.causa AS motivo,
  p.descricao,
  p.inicio_em,
  p.fim_em,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(p.fim_em, now()) - p.inicio_em)) / 60))::bigint
    AS duracao_minutos,
  p.lote_id,
  l.numero_lote AS lote_numero,
  COALESCE(p.pedido_id, l.pedido_id) AS pedido_id,
  pe.numero AS pedido_numero,
  p.quantidade_nao_produzida,
  p.unidade_nao_produzida,
  p.atraso_causado_minutos,
  p.responsavel_nome
FROM public.paradas_equipamento p
JOIN public.equipamentos e ON e.id = p.equipamento_id
LEFT JOIN public.manutencoes m ON m.id = p.manutencao_id
LEFT JOIN public.lotes_producao l ON l.id = p.lote_id
LEFT JOIN public.pedidos pe ON pe.id = COALESCE(p.pedido_id, l.pedido_id);

GRANT SELECT ON public.v_paradas_impacto TO authenticated;
COMMENT ON VIEW public.v_paradas_impacto IS 'Visão de impacto das paradas; duração é derivada do início/fim e perdas/atrasos são informados no registro.';
COMMENT ON COLUMN public.paradas_equipamento.atraso_causado_minutos IS 'Atraso de produção ou entrega atribuído à parada, informado em minutos; não representa a duração física da parada.';
