-- ============================================================
-- COMPRAS — fornecedores, pedidos e recebimentos de materiais
-- Executar no Supabase SQL Editor após:
-- profiles.sql, perfis_acesso.sql, schema_inicial.sql,
-- pedidos.sql e estoque_movimentacoes.sql.
-- Pode ser executado novamente com segurança.
-- ============================================================

-- 1) Prazo médio de entrega do fornecedor (usado nas sugestões de compra)
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS prazo_entrega_dias integer NOT NULL DEFAULT 7;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fornecedores'::regclass
      AND conname = 'fornecedores_prazo_entrega_check'
  ) THEN
    ALTER TABLE public.fornecedores
      ADD CONSTRAINT fornecedores_prazo_entrega_check
      CHECK (prazo_entrega_dias BETWEEN 0 AND 365);
  END IF;
END $$;

-- 2) Estados do pedido de compra
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_pedido_compra') THEN
    CREATE TYPE public.status_pedido_compra AS ENUM (
      'rascunho', 'enviado', 'parcial', 'recebido', 'cancelado'
    );
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.pedidos_compra_numero_seq;
CREATE SEQUENCE IF NOT EXISTS public.recebimentos_compra_numero_seq;

-- 3) Cabeçalho e linhas do pedido
CREATE TABLE IF NOT EXISTS public.pedidos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
  data_pedido date NOT NULL DEFAULT current_date,
  previsao_entrega date,
  status public.status_pedido_compra NOT NULL DEFAULT 'rascunho',
  observacoes text,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (previsao_entrega IS NULL OR previsao_entrega >= data_pedido)
);

CREATE TABLE IF NOT EXISTS public.itens_pedido_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_compra_id uuid NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE RESTRICT,
  quantidade_solicitada numeric(14,3) NOT NULL CHECK (quantidade_solicitada > 0),
  preco_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (preco_unitario >= 0),
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_compra_id, material_id)
);

-- 4) Lotes de matéria-prima: cadastro de rastreabilidade, sem saldo duplicado.
CREATE TABLE IF NOT EXISTS public.lotes_materiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.materiais(id) ON DELETE RESTRICT,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE RESTRICT,
  pedido_compra_id uuid REFERENCES public.pedidos_compra(id) ON DELETE SET NULL,
  numero_lote text,
  data_fabricacao date,
  validade date,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (validade IS NULL OR data_fabricacao IS NULL OR validade >= data_fabricacao)
);
CREATE UNIQUE INDEX IF NOT EXISTS lotes_materiais_identificacao_uidx
  ON public.lotes_materiais (material_id, fornecedor_id, numero_lote)
  WHERE numero_lote IS NOT NULL;
CREATE INDEX IF NOT EXISTS lotes_materiais_material_idx
  ON public.lotes_materiais (material_id, validade);

-- 5) Recebimentos e linhas: preservam histórico de entregas parciais/divergências.
CREATE TABLE IF NOT EXISTS public.recebimentos_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero text NOT NULL UNIQUE,
  pedido_compra_id uuid NOT NULL REFERENCES public.pedidos_compra(id) ON DELETE RESTRICT,
  data_recebimento date NOT NULL DEFAULT current_date,
  observacoes text,
  recebido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itens_recebimento_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recebimento_id uuid NOT NULL REFERENCES public.recebimentos_compra(id) ON DELETE RESTRICT,
  item_pedido_compra_id uuid NOT NULL REFERENCES public.itens_pedido_compra(id) ON DELETE RESTRICT,
  quantidade_recebida numeric(14,3) NOT NULL DEFAULT 0 CHECK (quantidade_recebida >= 0),
  lote_material_id uuid REFERENCES public.lotes_materiais(id) ON DELETE RESTRICT,
  observacoes text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recebimento_id, item_pedido_compra_id)
);

CREATE INDEX IF NOT EXISTS pedidos_compra_fornecedor_idx ON public.pedidos_compra (fornecedor_id);
CREATE INDEX IF NOT EXISTS pedidos_compra_status_idx ON public.pedidos_compra (status);
CREATE INDEX IF NOT EXISTS pedidos_compra_data_idx ON public.pedidos_compra (data_pedido DESC);
CREATE INDEX IF NOT EXISTS itens_pedido_compra_pedido_idx ON public.itens_pedido_compra (pedido_compra_id);
CREATE INDEX IF NOT EXISTS itens_pedido_compra_material_idx ON public.itens_pedido_compra (material_id);
CREATE INDEX IF NOT EXISTS recebimentos_compra_pedido_idx ON public.recebimentos_compra (pedido_compra_id, data_recebimento DESC);
CREATE INDEX IF NOT EXISTS itens_recebimento_compra_item_idx ON public.itens_recebimento_compra (item_pedido_compra_id);

-- 6) Liga a movimentação de estoque ao pedido de compra e ao lote recebido.
ALTER TABLE public.estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS pedido_compra_id uuid
    REFERENCES public.pedidos_compra(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lote_material_id uuid
    REFERENCES public.lotes_materiais(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS estoque_mov_pedido_compra_idx
  ON public.estoque_movimentacoes (pedido_compra_id)
  WHERE pedido_compra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS estoque_mov_lote_material_idx
  ON public.estoque_movimentacoes (lote_material_id)
  WHERE lote_material_id IS NOT NULL;

-- 7) RLS: leitura autenticada. A escrita é feita pelas RPCs transacionais abaixo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pedidos_compra', 'itens_pedido_compra'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS compras_leitura ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS compras_cria ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS compras_edita ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS compras_exclui ON public.%I', t);
    EXECUTE format('CREATE POLICY compras_leitura ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recebimentos_compra', 'itens_recebimento_compra', 'lotes_materiais'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS compras_leitura ON public.%I', t);
    EXECUTE format('CREATE POLICY compras_leitura ON public.%I FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.marcar_pedido_compra_enviado(_pedido_compra_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status public.status_pedido_compra;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(ARRAY['estoque']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para enviar pedido de compra';
  END IF;
  SELECT status INTO v_status
  FROM public.pedidos_compra
  WHERE id = _pedido_compra_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de compra não encontrado'; END IF;
  IF v_status <> 'rascunho' THEN RAISE EXCEPTION 'Somente rascunhos podem ser enviados'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.itens_pedido_compra WHERE pedido_compra_id = _pedido_compra_id) THEN
    RAISE EXCEPTION 'O pedido não possui itens';
  END IF;
  UPDATE public.pedidos_compra
  SET status = 'enviado', atualizado_em = now()
  WHERE id = _pedido_compra_id;
END;
$$;

-- 8) Criação atômica do pedido: cabeçalho e linhas são gravados juntos.
CREATE OR REPLACE FUNCTION public.criar_pedido_compra(
  _fornecedor_id uuid,
  _data_pedido date,
  _previsao_entrega date,
  _observacoes text,
  _itens jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_numero text;
  v_linha jsonb;
  v_material_id uuid;
  v_quantidade numeric(14,3);
  v_preco numeric(14,4);
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(ARRAY['estoque']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para criar pedido de compra';
  END IF;
  IF _data_pedido IS NULL OR (_previsao_entrega IS NOT NULL AND _previsao_entrega < _data_pedido) THEN
    RAISE EXCEPTION 'Datas do pedido inválidas';
  END IF;
  IF coalesce(jsonb_typeof(_itens), '') <> 'array' THEN
    RAISE EXCEPTION 'Inclua ao menos um material no pedido';
  END IF;
  IF jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um material no pedido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fornecedores WHERE id = _fornecedor_id AND ativo) THEN
    RAISE EXCEPTION 'Fornecedor não encontrado ou inativo';
  END IF;

  v_numero := 'OC-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.pedidos_compra_numero_seq')::text, 6, '0');
  INSERT INTO public.pedidos_compra
    (numero, fornecedor_id, data_pedido, previsao_entrega, status, observacoes, criado_por)
  VALUES
    (v_numero, _fornecedor_id, _data_pedido, _previsao_entrega, 'rascunho', nullif(btrim(_observacoes), ''), auth.uid())
  RETURNING id INTO v_id;

  FOR v_linha IN SELECT value FROM jsonb_array_elements(_itens) LOOP
    v_material_id := nullif(v_linha->>'material_id', '')::uuid;
    v_quantidade := nullif(v_linha->>'quantidade_solicitada', '')::numeric;
    v_preco := coalesce(nullif(v_linha->>'preco_unitario', '')::numeric, 0);
    IF v_material_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 OR v_preco < 0 THEN
      RAISE EXCEPTION 'Material, quantidade positiva e preço válido são obrigatórios';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.materiais WHERE id = v_material_id AND ativo) THEN
      RAISE EXCEPTION 'Material não encontrado ou inativo';
    END IF;
    INSERT INTO public.itens_pedido_compra
      (pedido_compra_id, material_id, quantidade_solicitada, preco_unitario)
    VALUES (v_id, v_material_id, v_quantidade, v_preco);
  END LOOP;
  RETURN v_id;
END;
$$;

-- 9) Recebimento atômico: grava o evento, cria/reutiliza o lote,
-- lança cada entrada em estoque e recalcula o status do pedido.
CREATE OR REPLACE FUNCTION public.registrar_recebimento_compra(
  _pedido_compra_id uuid,
  _data_recebimento date,
  _observacoes text,
  _itens jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos_compra%ROWTYPE;
  v_recebimento_id uuid;
  v_numero text;
  v_linha jsonb;
  v_item_id uuid;
  v_material_id uuid;
  v_unidade text;
  v_quantidade numeric(14,3);
  v_numero_lote text;
  v_data_fabricacao date;
  v_validade date;
  v_lote_id uuid;
  v_obs text;
  v_status public.status_pedido_compra;
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(ARRAY['estoque']::public.app_role[]) THEN
    RAISE EXCEPTION 'Sem permissão para registrar recebimento';
  END IF;
  IF _data_recebimento IS NULL THEN
    RAISE EXCEPTION 'Informe a data do recebimento';
  END IF;
  IF coalesce(jsonb_typeof(_itens), '') <> 'array' THEN
    RAISE EXCEPTION 'Informe as quantidades recebidas';
  END IF;
  IF jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Informe as quantidades recebidas';
  END IF;

  SELECT * INTO v_pedido
  FROM public.pedidos_compra
  WHERE id = _pedido_compra_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido de compra não encontrado'; END IF;
  IF v_pedido.status NOT IN ('enviado', 'parcial') THEN
    RAISE EXCEPTION 'Somente pedidos enviados ou parcialmente recebidos podem ser recebidos';
  END IF;

  v_numero := 'RC-' || to_char(_data_recebimento, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.recebimentos_compra_numero_seq')::text, 6, '0');
  INSERT INTO public.recebimentos_compra
    (numero, pedido_compra_id, data_recebimento, observacoes, recebido_por)
  VALUES
    (v_numero, _pedido_compra_id, _data_recebimento, nullif(btrim(_observacoes), ''), auth.uid())
  RETURNING id INTO v_recebimento_id;

  FOR v_linha IN SELECT value FROM jsonb_array_elements(_itens) LOOP
    v_item_id := nullif(v_linha->>'item_id', '')::uuid;
    v_quantidade := coalesce(nullif(v_linha->>'quantidade_recebida', '')::numeric, 0);
    v_numero_lote := nullif(btrim(v_linha->>'numero_lote'), '');
    v_data_fabricacao := nullif(v_linha->>'data_fabricacao', '')::date;
    v_validade := nullif(v_linha->>'validade', '')::date;
    v_obs := nullif(btrim(v_linha->>'observacoes'), '');
    IF v_item_id IS NULL OR v_quantidade < 0 THEN
      RAISE EXCEPTION 'Linha de recebimento inválida';
    END IF;
    IF v_data_fabricacao IS NOT NULL AND v_validade IS NOT NULL AND v_validade < v_data_fabricacao THEN
      RAISE EXCEPTION 'A validade não pode ser anterior à fabricação';
    END IF;

    SELECT i.material_id, coalesce(um.sigla, 'un')
      INTO v_material_id, v_unidade
    FROM public.itens_pedido_compra i
    JOIN public.materiais m ON m.id = i.material_id
    LEFT JOIN public.unidades_medida um ON um.id = m.unidade_medida_id
    WHERE i.id = v_item_id AND i.pedido_compra_id = _pedido_compra_id
    FOR UPDATE OF i;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item não pertence a este pedido de compra'; END IF;

    v_lote_id := NULL;
    IF v_quantidade > 0 AND (v_numero_lote IS NOT NULL OR v_data_fabricacao IS NOT NULL OR v_validade IS NOT NULL) THEN
      IF v_numero_lote IS NOT NULL THEN
        INSERT INTO public.lotes_materiais
          (material_id, fornecedor_id, pedido_compra_id, numero_lote, data_fabricacao, validade)
        VALUES
          (v_material_id, v_pedido.fornecedor_id, _pedido_compra_id, v_numero_lote, v_data_fabricacao, v_validade)
        ON CONFLICT (material_id, fornecedor_id, numero_lote) WHERE numero_lote IS NOT NULL
        DO UPDATE SET
          data_fabricacao = coalesce(public.lotes_materiais.data_fabricacao, EXCLUDED.data_fabricacao),
          validade = coalesce(public.lotes_materiais.validade, EXCLUDED.validade)
        RETURNING id INTO v_lote_id;
      ELSE
        INSERT INTO public.lotes_materiais
          (material_id, fornecedor_id, pedido_compra_id, data_fabricacao, validade)
        VALUES
          (v_material_id, v_pedido.fornecedor_id, _pedido_compra_id, v_data_fabricacao, v_validade)
        RETURNING id INTO v_lote_id;
      END IF;
    END IF;

    INSERT INTO public.itens_recebimento_compra
      (recebimento_id, item_pedido_compra_id, quantidade_recebida, lote_material_id, observacoes)
    VALUES
      (v_recebimento_id, v_item_id, v_quantidade, v_lote_id, v_obs);

    IF v_quantidade > 0 THEN
      INSERT INTO public.estoque_movimentacoes
        (material_id, tipo_movimentacao, quantidade, unidade_medida, data_movimentacao,
         lote_material_id, pedido_compra_id, fornecedor_id, motivo, usuario_id)
      VALUES
        (v_material_id, 'entrada_compra', v_quantidade, v_unidade,
         (_data_recebimento::timestamp AT TIME ZONE 'America/Sao_Paulo'),
         v_lote_id, _pedido_compra_id, v_pedido.fornecedor_id,
         'Recebimento ' || v_numero, auth.uid());
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.itens_pedido_compra i
    LEFT JOIN (
      SELECT r.item_pedido_compra_id, sum(r.quantidade_recebida) AS total
      FROM public.itens_recebimento_compra r
      JOIN public.recebimentos_compra h ON h.id = r.recebimento_id
      WHERE h.pedido_compra_id = _pedido_compra_id
      GROUP BY r.item_pedido_compra_id
    ) x ON x.item_pedido_compra_id = i.id
    WHERE i.pedido_compra_id = _pedido_compra_id
      AND coalesce(x.total, 0) < i.quantidade_solicitada
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.itens_recebimento_compra r
      JOIN public.recebimentos_compra h ON h.id = r.recebimento_id
      WHERE h.pedido_compra_id = _pedido_compra_id AND r.quantidade_recebida > 0
    ) THEN
      v_status := 'parcial';
    ELSE
      v_status := 'enviado';
    END IF;
  ELSE
    v_status := 'recebido';
  END IF;

  UPDATE public.pedidos_compra
  SET status = v_status, atualizado_em = now()
  WHERE id = _pedido_compra_id;
  RETURN v_recebimento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_pedido_compra(uuid, date, date, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.marcar_pedido_compra_enviado(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_recebimento_compra(uuid, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_pedido_compra(uuid, date, date, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_pedido_compra_enviado(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_recebimento_compra(uuid, date, text, jsonb) TO authenticated;

COMMENT ON TABLE public.pedidos_compra IS 'Pedidos de compra a fornecedores; o status de recebimento é recalculado a cada recebimento.';
COMMENT ON TABLE public.recebimentos_compra IS 'Cabeçalho imutável de cada evento de recebimento de materiais.';
COMMENT ON TABLE public.itens_recebimento_compra IS 'Quantidade recebida por item em cada evento; quantidade zero registra falta no recebimento.';
COMMENT ON TABLE public.lotes_materiais IS 'Identificação e validade de lotes de matéria-prima, sem armazenar saldo duplicado.';
