-- ============================================================
-- CENTRAL DE ALERTAS — estado de leitura por usuário e limite configurável
-- Execute manualmente no Supabase SQL Editor após os scripts base
-- (profiles.sql, perfis_acesso.sql, pedidos.sql, producao_envase.sql,
-- compras.sql, manutencao.sql, perdas.sql, estoque_embalagens_materiais.sql
-- e cadastros_produtos_cores_embalagens.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.alertas_usuario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chave text NOT NULL CHECK (nullif(btrim(chave), '') IS NOT NULL),
  tipo text NOT NULL CHECK (tipo IN (
    'materia_prima_baixa', 'produto_acabado_baixo', 'pedido_atrasado',
    'lote_atrasado', 'manutencao_vencida', 'equipamento_parado',
    'perda_acima_limite', 'compra_atrasada'
  )),
  titulo text NOT NULL,
  descricao text NOT NULL,
  severidade text NOT NULL CHECK (severidade IN ('informativo', 'atencao', 'critico')),
  link text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  lido_em timestamptz,
  UNIQUE (usuario_id, chave)
);

CREATE INDEX IF NOT EXISTS alertas_usuario_nao_lidos_idx
  ON public.alertas_usuario (usuario_id, criado_em DESC)
  WHERE lido_em IS NULL;

ALTER TABLE public.alertas_usuario ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.alertas_usuario TO authenticated;
GRANT UPDATE (lido_em) ON public.alertas_usuario TO authenticated;
GRANT ALL ON public.alertas_usuario TO service_role;

CREATE OR REPLACE FUNCTION public.usuario_pode_acessar_alerta(_tipo text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN public.has_role(auth.uid(), 'administrador')
      OR public.has_role(auth.uid(), 'gestor') THEN true
    WHEN _tipo IN ('materia_prima_baixa', 'produto_acabado_baixo') THEN
      public.has_role(auth.uid(), 'estoque') OR public.has_role(auth.uid(), 'vendas')
    WHEN _tipo = 'pedido_atrasado' THEN public.has_role(auth.uid(), 'vendas')
    WHEN _tipo = 'lote_atrasado' THEN public.has_role(auth.uid(), 'producao')
    WHEN _tipo IN ('manutencao_vencida', 'equipamento_parado') THEN public.has_role(auth.uid(), 'manutencao')
    WHEN _tipo = 'perda_acima_limite' THEN public.has_role(auth.uid(), 'producao')
    WHEN _tipo = 'compra_atrasada' THEN public.has_role(auth.uid(), 'estoque')
    ELSE false
  END
$$;
REVOKE ALL ON FUNCTION public.usuario_pode_acessar_alerta(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_pode_acessar_alerta(text) TO authenticated;

DROP POLICY IF EXISTS alertas_usuario_leitura_propria ON public.alertas_usuario;
CREATE POLICY alertas_usuario_leitura_propria
  ON public.alertas_usuario FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() AND public.usuario_pode_acessar_alerta(tipo));

DROP POLICY IF EXISTS alertas_usuario_criacao_propria ON public.alertas_usuario;
CREATE POLICY alertas_usuario_criacao_propria
  ON public.alertas_usuario FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() AND public.usuario_pode_acessar_alerta(tipo));

DROP POLICY IF EXISTS alertas_usuario_atualizacao_propria ON public.alertas_usuario;
CREATE POLICY alertas_usuario_atualizacao_propria
  ON public.alertas_usuario FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid() AND public.usuario_pode_acessar_alerta(tipo))
  WITH CHECK (usuario_id = auth.uid() AND public.usuario_pode_acessar_alerta(tipo));

-- Sem limite configurado, a categoria "perda acima do limite" não é emitida.
-- Defina o valor real do negócio manualmente após executar este script.
CREATE TABLE IF NOT EXISTS public.configuracao_alertas (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  limite_perda_valor numeric(14,2) CHECK (limite_perda_valor IS NULL OR limite_perda_valor > 0),
  periodo_perda_dias integer NOT NULL DEFAULT 30 CHECK (periodo_perda_dias BETWEEN 1 AND 365),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.configuracao_alertas (id, limite_perda_valor, periodo_perda_dias)
VALUES (1, NULL, 30)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.configuracao_alertas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.configuracao_alertas TO authenticated;
GRANT ALL ON public.configuracao_alertas TO service_role;

DROP POLICY IF EXISTS configuracao_alertas_leitura_logados ON public.configuracao_alertas;
CREATE POLICY configuracao_alertas_leitura_logados
  ON public.configuracao_alertas FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.alertas_usuario IS
  'Alertas materializados por usuário; a chave única evita duplicação e lido_em registra a leitura individual.';
COMMENT ON TABLE public.configuracao_alertas IS
  'Configuração dos limites para geração de alertas; limite de perdas permanece desativado até ser definido.';
