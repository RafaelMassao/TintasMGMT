-- ============================================================
-- Extensão do estoque para embalagens vazias e limites de materiais
-- Executar no Supabase SQL Editor antes de usar a aba Estoque.
-- Pré-requisito: tabela estoque_movimentacoes e view v_estoque_saldo
-- já criadas, junto a materiais, produtos e embalagens.
-- Pode ser executado novamente com segurança.
-- ============================================================

-- Materiais já possuem estoque_minimo; acrescentamos estoque_maximo.
ALTER TABLE public.materiais
  ADD COLUMN IF NOT EXISTS estoque_maximo numeric(14,3) NOT NULL DEFAULT 0;

UPDATE public.materiais
SET estoque_maximo = estoque_minimo
WHERE estoque_maximo < estoque_minimo;

ALTER TABLE public.embalagens
  ADD COLUMN IF NOT EXISTS estoque_minimo numeric(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_maximo numeric(14,3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.materiais'::regclass
      AND conname = 'materiais_estoque_limites_check'
  ) THEN
    ALTER TABLE public.materiais
      ADD CONSTRAINT materiais_estoque_limites_check
      CHECK (estoque_minimo >= 0 AND estoque_maximo >= estoque_minimo);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.embalagens'::regclass
      AND conname = 'embalagens_estoque_limites_check'
  ) THEN
    ALTER TABLE public.embalagens
      ADD CONSTRAINT embalagens_estoque_limites_check
      CHECK (estoque_minimo >= 0 AND estoque_maximo >= estoque_minimo);
  END IF;
END $$;

-- Movimentações existentes suportavam material OU produto. Agora também
-- aceitam uma embalagem vazia, mantendo a regra de exatamente um item por linha.
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS embalagem_id uuid
    REFERENCES public.embalagens(id) ON DELETE RESTRICT;

ALTER TABLE public.estoque_movimentacoes
  DROP CONSTRAINT IF EXISTS estoque_mov_um_item;
ALTER TABLE public.estoque_movimentacoes
  ADD CONSTRAINT estoque_mov_um_item
  CHECK (num_nonnulls(material_id, produto_id, embalagem_id) = 1);

CREATE INDEX IF NOT EXISTS estoque_mov_embalagem_idx
  ON public.estoque_movimentacoes (embalagem_id)
  WHERE embalagem_id IS NOT NULL;

-- Saldo calculado sob demanda, sem duplicar saldo em uma tabela.
-- Mantém produto_id, material_id, saldo, total_movimentacoes e
-- ultima_movimentacao nas posições atuais; os campos novos vêm ao final.
CREATE OR REPLACE VIEW public.v_estoque_saldo AS
WITH saldos AS (
  SELECT
    material_id,
    produto_id,
    embalagem_id,
    SUM(
      CASE
        WHEN tipo_movimentacao IN ('entrada_compra', 'entrada_producao', 'ajuste_positivo')
          THEN quantidade
        WHEN tipo_movimentacao IN ('saida_producao', 'saida_venda', 'saida_perda', 'ajuste_negativo')
          THEN -quantidade
        WHEN tipo_movimentacao = 'transferencia'
          THEN 0
      END
    ) AS saldo,
    COUNT(*) AS total_movimentacoes,
    MAX(data_movimentacao) AS ultima_movimentacao
  FROM public.estoque_movimentacoes
  GROUP BY material_id, produto_id, embalagem_id
)
SELECT
  p.id AS produto_id,
  NULL::uuid AS material_id,
  COALESCE(s.saldo, 0::numeric) AS saldo,
  COALESCE(s.total_movimentacoes, 0::bigint) AS total_movimentacoes,
  s.ultima_movimentacao,
  p.id AS item_id,
  'produto'::text AS tipo_item,
  NULL::uuid AS embalagem_id
FROM public.produtos p
LEFT JOIN saldos s ON s.produto_id = p.id
UNION ALL
SELECT
  NULL::uuid AS produto_id,
  m.id AS material_id,
  COALESCE(s.saldo, 0::numeric) AS saldo,
  COALESCE(s.total_movimentacoes, 0::bigint) AS total_movimentacoes,
  s.ultima_movimentacao,
  m.id AS item_id,
  'material'::text AS tipo_item,
  NULL::uuid AS embalagem_id
FROM public.materiais m
LEFT JOIN saldos s ON s.material_id = m.id
UNION ALL
SELECT
  NULL::uuid AS produto_id,
  NULL::uuid AS material_id,
  COALESCE(s.saldo, 0::numeric) AS saldo,
  COALESCE(s.total_movimentacoes, 0::bigint) AS total_movimentacoes,
  s.ultima_movimentacao,
  e.id AS item_id,
  'embalagem'::text AS tipo_item,
  e.id AS embalagem_id
FROM public.embalagens e
LEFT JOIN saldos s ON s.embalagem_id = e.id;

COMMENT ON VIEW public.v_estoque_saldo IS
  'Saldo atual por produto, material e embalagem, calculado a partir do livro-razão; não armazena saldo duplicado.';

GRANT SELECT ON public.v_estoque_saldo TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estoque_movimentacoes TO authenticated;
GRANT ALL ON public.estoque_movimentacoes TO service_role;
ALTER TABLE public.estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
