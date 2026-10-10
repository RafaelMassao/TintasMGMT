-- ============================================================
-- ATRASOS E OCORRÊNCIAS — registro, acompanhamento e duração calculada
-- Executar manualmente no Supabase SQL Editor depois de:
-- schema_inicial.sql, perfis_acesso.sql, profiles.sql,
-- producao_envase.sql e pedidos.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ocorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN (
    'atraso_producao', 'atraso_entrega', 'falta_materia_prima',
    'falta_embalagem', 'manutencao_maquina', 'retrabalho',
    'problema_qualidade', 'atraso_fornecedor', 'falha_programacao'
  )),
  origem text NOT NULL CHECK (nullif(btrim(origem), '') IS NOT NULL),
  lote_id uuid REFERENCES public.lotes_producao(id) ON DELETE SET NULL,
  pedido_id uuid REFERENCES public.pedidos(id) ON DELETE SET NULL,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE SET NULL,
  data_prevista timestamptz NOT NULL,
  data_real timestamptz,
  motivo text NOT NULL CHECK (nullif(btrim(motivo), '') IS NOT NULL),
  descricao text NOT NULL CHECK (nullif(btrim(descricao), '') IS NOT NULL),
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text NOT NULL,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'resolvida', 'cancelada')),
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocorrencias_um_vinculo CHECK (lote_id IS NULL OR pedido_id IS NULL),
  CONSTRAINT ocorrencias_resolvida_com_data CHECK (status <> 'resolvida' OR data_real IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS ocorrencias_prevista_idx ON public.ocorrencias (data_prevista DESC);
CREATE INDEX IF NOT EXISTS ocorrencias_tipo_status_prevista_idx ON public.ocorrencias (tipo, status, data_prevista);
CREATE INDEX IF NOT EXISTS ocorrencias_produto_idx ON public.ocorrencias (produto_id) WHERE produto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ocorrencias_responsavel_idx ON public.ocorrencias (responsavel_id) WHERE responsavel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ocorrencias_lote_idx ON public.ocorrencias (lote_id) WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ocorrencias_pedido_idx ON public.ocorrencias (pedido_id) WHERE pedido_id IS NOT NULL;

ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.ocorrencias TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ocorrencias FROM authenticated;
GRANT ALL ON public.ocorrencias TO service_role;
DROP POLICY IF EXISTS ocorrencias_leitura ON public.ocorrencias;
CREATE POLICY ocorrencias_leitura ON public.ocorrencias
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS ocorrencias_atualizado_em ON public.ocorrencias;
CREATE TRIGGER ocorrencias_atualizado_em
  BEFORE UPDATE ON public.ocorrencias
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em();

-- A duração não é armazenada duplicada. Ocorrência aberta/em andamento é
-- calculada até agora; ocorrências encerradas usam a data real registrada.
CREATE OR REPLACE VIEW public.v_ocorrencias_atrasos
WITH (security_invoker = true)
AS
SELECT
  o.*,
  GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(o.data_real, now()) - o.data_prevista)) / 60))::bigint
    AS atraso_minutos,
  p.nome AS produto_nome,
  l.numero_lote,
  pe.numero AS pedido_numero
FROM public.ocorrencias o
LEFT JOIN public.produtos p ON p.id = o.produto_id
LEFT JOIN public.lotes_producao l ON l.id = o.lote_id
LEFT JOIN public.pedidos pe ON pe.id = o.pedido_id;
GRANT SELECT ON public.v_ocorrencias_atrasos TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_ocorrencia(
  _tipo text,
  _origem text,
  _lote_id uuid,
  _pedido_id uuid,
  _produto_id uuid,
  _data_prevista timestamptz,
  _data_real timestamptz,
  _motivo text,
  _descricao text,
  _status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_produto_lote uuid;
  v_produto uuid := _produto_id;
  v_status text := COALESCE(_status, 'aberta');
  v_data_real timestamptz := _data_real;
  v_responsavel_nome text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(
    ARRAY['producao', 'vendas', 'estoque', 'manutencao']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar ocorrências';
  END IF;
  IF _tipo NOT IN (
    'atraso_producao', 'atraso_entrega', 'falta_materia_prima',
    'falta_embalagem', 'manutencao_maquina', 'retrabalho',
    'problema_qualidade', 'atraso_fornecedor', 'falha_programacao'
  ) THEN
    RAISE EXCEPTION 'Tipo de ocorrência inválido';
  END IF;
  IF nullif(btrim(COALESCE(_origem, '')), '') IS NULL
    OR nullif(btrim(COALESCE(_motivo, '')), '') IS NULL
    OR nullif(btrim(COALESCE(_descricao, '')), '') IS NULL
    OR _data_prevista IS NULL THEN
    RAISE EXCEPTION 'Origem, data prevista, motivo e descrição são obrigatórios';
  END IF;
  IF v_status NOT IN ('aberta', 'em_andamento', 'resolvida', 'cancelada') THEN
    RAISE EXCEPTION 'Status de ocorrência inválido';
  END IF;
  IF _lote_id IS NOT NULL AND _pedido_id IS NOT NULL THEN
    RAISE EXCEPTION 'Relacione a ocorrência a um lote ou a um pedido, não aos dois';
  END IF;
  IF _lote_id IS NOT NULL THEN
    SELECT produto_id INTO v_produto_lote FROM public.lotes_producao WHERE id = _lote_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
    IF v_produto IS NOT NULL AND v_produto <> v_produto_lote THEN
      RAISE EXCEPTION 'O produto selecionado não corresponde ao lote';
    END IF;
    v_produto := COALESCE(v_produto, v_produto_lote);
  END IF;
  IF _pedido_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pedidos WHERE id = _pedido_id) THEN
    RAISE EXCEPTION 'Pedido não encontrado';
  END IF;
  IF _pedido_id IS NOT NULL AND v_produto IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.itens_pedido WHERE pedido_id = _pedido_id AND produto_id = v_produto
  ) THEN
    RAISE EXCEPTION 'O produto selecionado não pertence ao pedido';
  END IF;
  IF v_produto IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto) THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
  IF v_status IN ('resolvida', 'cancelada') THEN
    v_data_real := COALESCE(v_data_real, now());
  ELSE
    v_data_real := NULL;
  END IF;
  SELECT COALESCE(
    (SELECT nullif(btrim(p.nome), '') FROM public.profiles p WHERE p.id = auth.uid()),
    auth.jwt() ->> 'email', 'Usuário autenticado'
  ) INTO v_responsavel_nome;

  INSERT INTO public.ocorrencias (
    tipo, origem, lote_id, pedido_id, produto_id, data_prevista, data_real,
    motivo, descricao, responsavel_id, responsavel_nome, status, criado_por
  ) VALUES (
    _tipo, btrim(_origem), _lote_id, _pedido_id, v_produto, _data_prevista, v_data_real,
    btrim(_motivo), btrim(_descricao), auth.uid(), v_responsavel_nome, v_status, auth.uid()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.atualizar_status_ocorrencia(
  _ocorrencia_id uuid,
  _status text,
  _data_real timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_data_real timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(
    ARRAY['producao', 'vendas', 'estoque', 'manutencao']::public.app_role[]
  ) THEN
    RAISE EXCEPTION 'Sem permissão para atualizar ocorrências';
  END IF;
  IF _status NOT IN ('aberta', 'em_andamento', 'resolvida', 'cancelada') THEN
    RAISE EXCEPTION 'Status de ocorrência inválido';
  END IF;
  IF _status IN ('resolvida', 'cancelada') THEN
    v_data_real := COALESCE(_data_real, now());
  ELSE
    v_data_real := NULL;
  END IF;
  UPDATE public.ocorrencias
     SET status = _status, data_real = v_data_real
   WHERE id = _ocorrencia_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência não encontrada'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_ocorrencia(text, text, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ocorrencia(text, text, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.atualizar_status_ocorrencia(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atualizar_status_ocorrencia(uuid, text, timestamptz) TO authenticated;

COMMENT ON TABLE public.ocorrencias IS 'Registro rastreável de atrasos e ocorrências operacionais, com datas previstas e reais.';
COMMENT ON VIEW public.v_ocorrencias_atrasos IS 'Duração calculada em minutos sem persistir saldos de atraso duplicados; registros ativos contam até agora.';
COMMENT ON FUNCTION public.registrar_ocorrencia(text, text, uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) IS 'Cria ocorrência com validações de perfil, vínculo, datas e responsável autenticado.';
COMMENT ON FUNCTION public.atualizar_status_ocorrencia(uuid, text, timestamptz) IS 'Atualiza status sob validação de perfil e registra data real ao encerrar/cancelar.';
