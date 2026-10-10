-- ============================================================
-- PERDAS — registro auditável e integração transacional com estoque
-- Executar manualmente no Supabase SQL Editor depois de:
-- schema_inicial.sql, producao_envase.sql, pedidos.sql,
-- estoque_movimentacoes.sql e estoque_embalagens_materiais.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.perdas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data date NOT NULL DEFAULT current_date,
  item_tipo text NOT NULL CHECK (item_tipo IN ('material', 'produto', 'embalagem')),
  material_id uuid REFERENCES public.materiais(id) ON DELETE RESTRICT,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE RESTRICT,
  embalagem_id uuid REFERENCES public.embalagens(id) ON DELETE RESTRICT,
  embalagem_referencia_id uuid REFERENCES public.embalagens(id) ON DELETE SET NULL,
  cor_id uuid REFERENCES public.cores(id) ON DELETE SET NULL,
  lote text,
  etapa text NOT NULL CHECK (etapa IN ('materia_prima', 'mistura', 'bombeamento', 'envase', 'embalagem', 'qualidade', 'validade', 'estoque', 'transporte')),
  motivo text NOT NULL CHECK (nullif(btrim(motivo), '') IS NOT NULL),
  quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
  unidade text NOT NULL CHECK (nullif(btrim(unidade), '') IS NOT NULL),
  valor_estimado numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_estimado >= 0),
  observacao text,
  responsavel_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  responsavel_nome text NOT NULL DEFAULT '',
  gera_movimentacao_estoque boolean NOT NULL DEFAULT false,
  movimentacao_id uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT perdas_um_item CHECK (
    num_nonnulls(material_id, produto_id, embalagem_id) = 1
    AND ((item_tipo = 'material' AND material_id IS NOT NULL)
      OR (item_tipo = 'produto' AND produto_id IS NOT NULL)
      OR (item_tipo = 'embalagem' AND embalagem_id IS NOT NULL))
  )
);

ALTER TABLE public.perdas
  ADD COLUMN IF NOT EXISTS responsavel_nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS embalagem_referencia_id uuid REFERENCES public.embalagens(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS perdas_data_idx ON public.perdas (data DESC);
CREATE INDEX IF NOT EXISTS perdas_etapa_idx ON public.perdas (etapa, data DESC);
CREATE INDEX IF NOT EXISTS perdas_material_idx ON public.perdas (material_id) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS perdas_produto_idx ON public.perdas (produto_id) WHERE produto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS perdas_cor_idx ON public.perdas (cor_id) WHERE cor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS perdas_motivo_idx ON public.perdas (motivo);

ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS perda_id uuid REFERENCES public.perdas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS estoque_mov_perda_idx
  ON public.estoque_movimentacoes (perda_id) WHERE perda_id IS NOT NULL;

ALTER TABLE public.perdas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.perdas TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.perdas FROM authenticated;
GRANT ALL ON public.perdas TO service_role;
DROP POLICY IF EXISTS perdas_leitura ON public.perdas;
CREATE POLICY perdas_leitura ON public.perdas FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.registrar_perda(
  _data date,
  _item_tipo text,
  _material_id uuid,
  _produto_id uuid,
  _embalagem_id uuid,
  _embalagem_referencia_id uuid,
  _cor_id uuid,
  _lote text,
  _etapa text,
  _motivo text,
  _quantidade numeric,
  _unidade text,
  _valor_estimado numeric,
  _observacao text,
  _gera_movimentacao_estoque boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_mov_id uuid;
  v_motivo_mov text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(ARRAY['producao']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar perdas';
  END IF;
  IF _data IS NULL OR _item_tipo NOT IN ('material', 'produto', 'embalagem') THEN
    RAISE EXCEPTION 'Data e tipo de item são obrigatórios';
  END IF;
  IF num_nonnulls(_material_id, _produto_id, _embalagem_id) <> 1
    OR (_item_tipo = 'material' AND _material_id IS NULL)
    OR (_item_tipo = 'produto' AND _produto_id IS NULL)
    OR (_item_tipo = 'embalagem' AND _embalagem_id IS NULL) THEN
    RAISE EXCEPTION 'Selecione exatamente um produto, material ou embalagem';
  END IF;
  IF _etapa NOT IN ('materia_prima', 'mistura', 'bombeamento', 'envase', 'embalagem', 'qualidade', 'validade', 'estoque', 'transporte') THEN
    RAISE EXCEPTION 'Etapa de perda inválida';
  END IF;
  IF nullif(btrim(coalesce(_motivo, '')), '') IS NULL OR nullif(btrim(coalesce(_unidade, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Motivo e unidade são obrigatórios';
  END IF;
  IF _quantidade IS NULL OR _quantidade <= 0 OR coalesce(_valor_estimado, 0) < 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser positiva e valor estimado não pode ser negativo';
  END IF;
  IF _gera_movimentacao_estoque AND _etapa <> 'estoque' THEN
    RAISE EXCEPTION 'A baixa automática está disponível somente para perdas da etapa Estoque';
  END IF;

  IF (_item_tipo = 'material' AND NOT EXISTS (SELECT 1 FROM public.materiais WHERE id = _material_id AND ativo))
    OR (_item_tipo = 'produto' AND NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = _produto_id AND ativo))
    OR (_item_tipo = 'embalagem' AND NOT EXISTS (SELECT 1 FROM public.embalagens WHERE id = _embalagem_id AND ativo)) THEN
    RAISE EXCEPTION 'O item selecionado não existe ou está inativo';
  END IF;
  IF _cor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cores WHERE id = _cor_id AND ativo) THEN
    RAISE EXCEPTION 'A cor selecionada não existe ou está inativa';
  END IF;

  INSERT INTO public.perdas (
    data, item_tipo, material_id, produto_id, embalagem_id, embalagem_referencia_id, cor_id, lote,
    etapa, motivo, quantidade, unidade, valor_estimado, observacao,
    responsavel_id, responsavel_nome, gera_movimentacao_estoque
  ) VALUES (
    _data, _item_tipo, _material_id, _produto_id, _embalagem_id, _embalagem_referencia_id, _cor_id,
    nullif(btrim(_lote), ''), _etapa, btrim(_motivo), _quantidade,
    btrim(_unidade), coalesce(_valor_estimado, 0), nullif(btrim(_observacao), ''),
    auth.uid(), coalesce((SELECT nullif(btrim(p.nome), '') FROM public.profiles p WHERE p.id = auth.uid()), auth.jwt() ->> 'email', 'Usuário autenticado'),
    coalesce(_gera_movimentacao_estoque, false)
  ) RETURNING id INTO v_id;

  IF coalesce(_gera_movimentacao_estoque, false) THEN
    v_motivo_mov := 'Perda de estoque (' || v_id::text || '): ' || btrim(_motivo);
    INSERT INTO public.estoque_movimentacoes (
      material_id, produto_id, embalagem_id, tipo_movimentacao,
      quantidade, unidade_medida, data_movimentacao, motivo,
      usuario_id, perda_id
    ) VALUES (
      _material_id, _produto_id, _embalagem_id, 'saida_perda',
      _quantidade, btrim(_unidade), _data::timestamptz, v_motivo_mov,
      auth.uid(), v_id
    ) RETURNING id INTO v_mov_id;

    UPDATE public.perdas SET movimentacao_id = v_mov_id WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_perda(date, text, uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, numeric, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_perda(date, text, uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, numeric, text, boolean) TO authenticated;

COMMENT ON TABLE public.perdas IS 'Registros auditáveis de perda operacional. Se a etapa for estoque, a RPC pode gravar a perda e a saída_perda na mesma transação.';
COMMENT ON FUNCTION public.registrar_perda(date, text, uuid, uuid, uuid, uuid, uuid, text, text, text, numeric, text, numeric, text, boolean) IS 'Registra perda sob validação de perfil e, quando solicitado para etapa estoque, cria atomicamente movimento saida_perda.';
