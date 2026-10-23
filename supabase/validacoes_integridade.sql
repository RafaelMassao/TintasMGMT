-- ============================================================
-- VALIDAÇÕES DE INTEGRIDADE — TintasMGMT
-- Executar manualmente no Supabase SQL Editor após pedidos.sql.
-- Este script não altera nem corrige registros históricos.
-- ============================================================

-- A criação/edição do pedido e de suas linhas passa a ocorrer em uma única
-- transação. Assim, falha em uma linha não deixa cabeçalho sem itens.
CREATE OR REPLACE FUNCTION public.salvar_pedido_com_itens(
  _pedido_id uuid,
  _numero text,
  _cliente_id uuid,
  _data_pedido date,
  _prazo_prometido date,
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
  v_linha jsonb;
  v_item_id uuid;
  v_produto_id uuid;
  v_quantidade numeric(14,3);
  v_preco numeric(14,2);
  v_entregue numeric(14,3);
  v_produto_anterior uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.pode_editar(ARRAY['vendas']::public.app_role[]) THEN
    RAISE EXCEPTION 'Seu perfil não tem permissão para salvar pedidos';
  END IF;
  IF nullif(btrim(coalesce(_numero, '')), '') IS NULL OR _cliente_id IS NULL OR _data_pedido IS NULL THEN
    RAISE EXCEPTION 'Número, cliente e data do pedido são obrigatórios';
  END IF;
  IF _prazo_prometido IS NOT NULL AND _prazo_prometido < _data_pedido THEN
    RAISE EXCEPTION 'O prazo prometido não pode ser anterior à data do pedido';
  END IF;
  IF coalesce(jsonb_typeof(_itens), '') <> 'array' THEN
    RAISE EXCEPTION 'Inclua ao menos um item no pedido';
  END IF;
  IF jsonb_array_length(_itens) = 0 THEN
    RAISE EXCEPTION 'Inclua ao menos um item no pedido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = _cliente_id AND ativo) THEN
    RAISE EXCEPTION 'Selecione um cliente ativo';
  END IF;

  IF _pedido_id IS NULL THEN
    INSERT INTO public.pedidos (numero, cliente_id, data_pedido, prazo_prometido, observacoes, criado_por)
    VALUES (btrim(_numero), _cliente_id, _data_pedido, _prazo_prometido,
      nullif(btrim(_observacoes), ''), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT id INTO v_id FROM public.pedidos WHERE id = _pedido_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
    UPDATE public.pedidos
       SET numero = btrim(_numero), cliente_id = _cliente_id, data_pedido = _data_pedido,
           prazo_prometido = _prazo_prometido, observacoes = nullif(btrim(_observacoes), '')
     WHERE id = v_id;
  END IF;

  FOR v_linha IN SELECT value FROM jsonb_array_elements(_itens) LOOP
    v_item_id := nullif(v_linha->>'id', '')::uuid;
    v_produto_id := nullif(v_linha->>'produto_id', '')::uuid;
    v_quantidade := nullif(v_linha->>'quantidade_solicitada', '')::numeric;
    v_preco := nullif(v_linha->>'preco_unitario', '')::numeric;
    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_preco IS NULL
       OR v_quantidade::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_preco::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_quantidade <= 0 OR v_preco < 0 THEN
      RAISE EXCEPTION 'Cada item exige produto, quantidade positiva e preço não negativo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.produtos WHERE id = v_produto_id AND ativo) THEN
      RAISE EXCEPTION 'O produto selecionado não existe ou está inativo';
    END IF;
    -- A aplicação sinaliza duplicidade; a função também protege chamadas diretas.
    IF (SELECT count(*) FROM jsonb_array_elements(_itens) x
         WHERE nullif(x->>'produto_id', '')::uuid = v_produto_id) > 1 THEN
      RAISE EXCEPTION 'Cada produto deve aparecer apenas uma vez no pedido';
    END IF;

    v_entregue := 0;
    IF v_item_id IS NOT NULL THEN
      SELECT quantidade_entregue, produto_id INTO v_entregue, v_produto_anterior
        FROM public.itens_pedido WHERE id = v_item_id AND pedido_id = v_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Um item informado não pertence a este pedido'; END IF;
      IF v_entregue > v_quantidade THEN
        RAISE EXCEPTION 'A quantidade solicitada não pode ficar abaixo do que já foi entregue';
      END IF;
      IF v_entregue > 0 AND v_produto_anterior <> v_produto_id THEN
        RAISE EXCEPTION 'Não é possível trocar o produto de uma linha já entregue';
      END IF;
      UPDATE public.itens_pedido
         SET produto_id = v_produto_id, quantidade_solicitada = v_quantidade, preco_unitario = v_preco
       WHERE id = v_item_id AND pedido_id = v_id;
      v_ids := array_append(v_ids, v_item_id);
    ELSE
      INSERT INTO public.itens_pedido (pedido_id, produto_id, quantidade_solicitada, preco_unitario)
      VALUES (v_id, v_produto_id, v_quantidade, v_preco)
      RETURNING id INTO v_item_id;
      v_ids := array_append(v_ids, v_item_id);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.itens_pedido i
     WHERE i.pedido_id = v_id AND NOT (i.id = ANY(v_ids)) AND i.quantidade_entregue > 0
  ) THEN
    RAISE EXCEPTION 'Não é possível remover um item que já possui quantidade entregue';
  END IF;
  DELETE FROM public.itens_pedido i
   WHERE i.pedido_id = v_id AND NOT (i.id = ANY(v_ids));

  IF NOT EXISTS (SELECT 1 FROM public.itens_pedido WHERE pedido_id = v_id) THEN
    RAISE EXCEPTION 'O pedido deve possuir pelo menos um item';
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_pedido_com_itens(uuid, text, uuid, date, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.salvar_pedido_com_itens(uuid, text, uuid, date, date, text, jsonb) TO authenticated;

-- Impede criação direta de cabeçalhos vazios por clientes autenticados.
-- A RPC SECURITY DEFINER acima realiza as inserções atômicas após validar perfil.
REVOKE INSERT ON public.pedidos FROM authenticated;
REVOKE INSERT, DELETE ON public.itens_pedido FROM authenticated;

COMMENT ON FUNCTION public.salvar_pedido_com_itens(uuid, text, uuid, date, date, text, jsonb)
IS 'Cria/edita cabeçalho e itens do pedido atomicamente, exigindo ao menos um item e validando quantidades, preços, datas e permissões.';
