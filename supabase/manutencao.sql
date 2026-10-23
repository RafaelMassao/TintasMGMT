-- ============================================================
-- MANUTENÇÃO — equipamentos, revisões, intervenções e paradas
-- Executar manualmente no Supabase SQL Editor depois de:
-- profiles.sql, perfis_acesso.sql e schema_inicial.sql.
-- ============================================================

-- O cadastro de equipamentos já existe no schema inicial. Acrescentamos
-- apenas os campos operacionais e de periodicidade que pertencem a este módulo.
ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS periodicidade_revisao_dias integer,
  ADD COLUMN IF NOT EXISTS ultima_revisao_em date,
  ADD COLUMN IF NOT EXISTS proxima_revisao_em date,
  ADD COLUMN IF NOT EXISTS status_operacional text NOT NULL DEFAULT 'operacional';

DO $$ BEGIN
  ALTER TABLE public.equipamentos
    ADD CONSTRAINT equipamentos_periodicidade_revisao_positiva
    CHECK (periodicidade_revisao_dias IS NULL OR periodicidade_revisao_dias > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.equipamentos
    ADD CONSTRAINT equipamentos_status_operacional_valido
    CHECK (status_operacional IN ('operacional', 'parado'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.manutencoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('preventiva', 'corretiva', 'inspecao')),
  status text NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada', 'em_andamento', 'concluida', 'cancelada')),
  data_prevista date NOT NULL,
  data_inicio timestamptz,
  data_conclusao timestamptz,
  descricao text NOT NULL CHECK (nullif(btrim(descricao), '') IS NOT NULL),
  observacao text,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text NOT NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manutencoes_conclusao_coerente CHECK (
    (status = 'concluida' AND data_conclusao IS NOT NULL)
    OR (status <> 'concluida' AND data_conclusao IS NULL)
  ),
  CONSTRAINT manutencoes_inicio_antes_conclusao CHECK (
    data_inicio IS NULL OR data_conclusao IS NULL OR data_conclusao >= data_inicio
  )
);

CREATE TABLE IF NOT EXISTS public.paradas_equipamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipamento_id uuid NOT NULL REFERENCES public.equipamentos(id) ON DELETE RESTRICT,
  manutencao_id uuid REFERENCES public.manutencoes(id) ON DELETE SET NULL,
  inicio_em timestamptz NOT NULL DEFAULT now(),
  fim_em timestamptz,
  causa text NOT NULL CHECK (nullif(btrim(causa), '') IS NOT NULL),
  descricao text,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_nome text NOT NULL,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT DEFAULT auth.uid(),
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paradas_fim_depois_inicio CHECK (fim_em IS NULL OR fim_em >= inicio_em)
);

CREATE INDEX IF NOT EXISTS manutencoes_equipamento_data_idx
  ON public.manutencoes (equipamento_id, data_prevista DESC);
CREATE INDEX IF NOT EXISTS manutencoes_status_data_idx
  ON public.manutencoes (status, data_prevista);
CREATE INDEX IF NOT EXISTS paradas_equipamento_inicio_idx
  ON public.paradas_equipamento (equipamento_id, inicio_em DESC);
CREATE INDEX IF NOT EXISTS paradas_abertas_idx
  ON public.paradas_equipamento (equipamento_id) WHERE fim_em IS NULL;

ALTER TABLE public.manutencoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paradas_equipamento ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.manutencoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.paradas_equipamento TO authenticated;
GRANT ALL ON public.manutencoes, public.paradas_equipamento TO service_role;
REVOKE DELETE ON public.manutencoes, public.paradas_equipamento FROM authenticated;

DROP POLICY IF EXISTS manutencoes_leitura ON public.manutencoes;
CREATE POLICY manutencoes_leitura ON public.manutencoes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS manutencoes_criar ON public.manutencoes;
CREATE POLICY manutencoes_criar ON public.manutencoes
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar(ARRAY['manutencao']::public.app_role[]));
DROP POLICY IF EXISTS manutencoes_editar ON public.manutencoes;
CREATE POLICY manutencoes_editar ON public.manutencoes
  FOR UPDATE TO authenticated
  USING (public.pode_editar(ARRAY['manutencao']::public.app_role[]))
  WITH CHECK (public.pode_editar(ARRAY['manutencao']::public.app_role[]));
DROP POLICY IF EXISTS paradas_equipamento_leitura ON public.paradas_equipamento;
CREATE POLICY paradas_equipamento_leitura ON public.paradas_equipamento
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS paradas_equipamento_criar ON public.paradas_equipamento;
CREATE POLICY paradas_equipamento_criar ON public.paradas_equipamento
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_editar(ARRAY['manutencao']::public.app_role[]));
DROP POLICY IF EXISTS paradas_equipamento_editar ON public.paradas_equipamento;
CREATE POLICY paradas_equipamento_editar ON public.paradas_equipamento
  FOR UPDATE TO authenticated
  USING (public.pode_editar(ARRAY['manutencao']::public.app_role[]))
  WITH CHECK (public.pode_editar(ARRAY['manutencao']::public.app_role[]));

DROP TRIGGER IF EXISTS manutencoes_atualizado_em ON public.manutencoes;
CREATE TRIGGER manutencoes_atualizado_em
  BEFORE UPDATE ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_atualizado_em();

-- Ao concluir uma manutenção, a revisão seguinte é calculada a partir da data
-- efetiva de conclusão, não da data prevista. Um ciclo semanal usa 7 dias.
CREATE OR REPLACE FUNCTION public.manutencao_atualizar_proxima_revisao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'concluida'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluida') THEN
    UPDATE public.equipamentos
       SET ultima_revisao_em = (NEW.data_conclusao AT TIME ZONE 'America/Sao_Paulo')::date,
           proxima_revisao_em = CASE
             WHEN periodicidade_revisao_dias IS NOT NULL
               THEN (NEW.data_conclusao AT TIME ZONE 'America/Sao_Paulo')::date + periodicidade_revisao_dias
             ELSE proxima_revisao_em
           END
     WHERE id = NEW.equipamento_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS manutencoes_atualizar_proxima_revisao ON public.manutencoes;
CREATE TRIGGER manutencoes_atualizar_proxima_revisao
  AFTER INSERT OR UPDATE ON public.manutencoes
  FOR EACH ROW EXECUTE FUNCTION public.manutencao_atualizar_proxima_revisao();

-- Uma parada aberta marca o equipamento como parado. Ao encerrá-la, o estado
-- só volta para operacional quando não existir outra parada aberta.
CREATE OR REPLACE FUNCTION public.paradas_sincronizar_status_equipamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_equipamento_id uuid := NEW.equipamento_id;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.paradas_equipamento p
     WHERE p.equipamento_id = v_equipamento_id AND p.fim_em IS NULL
  ) THEN
    UPDATE public.equipamentos SET status_operacional = 'parado' WHERE id = v_equipamento_id;
  ELSE
    UPDATE public.equipamentos SET status_operacional = 'operacional' WHERE id = v_equipamento_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS paradas_sincronizar_status_equipamento ON public.paradas_equipamento;
CREATE TRIGGER paradas_sincronizar_status_equipamento
  AFTER INSERT OR UPDATE ON public.paradas_equipamento
  FOR EACH ROW EXECUTE FUNCTION public.paradas_sincronizar_status_equipamento();

-- Indicadores calculados sem persistir durações ou disponibilidade duplicadas.
CREATE OR REPLACE VIEW public.v_manutencao_indicadores_equipamento
WITH (security_invoker = true)
AS
SELECT
  e.id AS equipamento_id,
  e.codigo,
  e.nome,
  e.tipo,
  e.localizacao,
  e.ativo,
  e.periodicidade_revisao_dias,
  e.ultima_revisao_em,
  e.proxima_revisao_em,
  e.status_operacional,
  (e.ativo AND e.proxima_revisao_em IS NOT NULL AND e.proxima_revisao_em < CURRENT_DATE) AS revisao_vencida,
  EXISTS (
    SELECT 1 FROM public.paradas_equipamento p
     WHERE p.equipamento_id = e.id AND p.fim_em IS NULL
  ) AS tem_parada_aberta,
  COALESCE((
    SELECT count(*)::integer FROM public.manutencoes m
     WHERE m.equipamento_id = e.id AND m.tipo = 'corretiva'
       AND m.criado_em >= now() - interval '30 days'
       AND m.status <> 'cancelada'
  ), 0) AS falhas_30_dias,
  COALESCE((
    SELECT floor(sum(extract(epoch FROM (COALESCE(p.fim_em, now()) - GREATEST(p.inicio_em, now() - interval '30 days'))) / 60))::bigint
      FROM public.paradas_equipamento p
     WHERE p.equipamento_id = e.id
       AND COALESCE(p.fim_em, now()) > now() - interval '30 days'
  ), 0) AS minutos_parado_30_dias,
  COALESCE((
    SELECT floor(sum(extract(epoch FROM (COALESCE(p.fim_em, now()) - p.inicio_em)) / 60))::bigint
      FROM public.paradas_equipamento p
     WHERE p.equipamento_id = e.id
  ), 0) AS minutos_parado_total,
  ROUND(GREATEST(0::numeric, 100 - COALESCE((
    SELECT sum(extract(epoch FROM (COALESCE(p.fim_em, now()) - GREATEST(p.inicio_em, now() - interval '30 days')))) / 25920
      FROM public.paradas_equipamento p
     WHERE p.equipamento_id = e.id
       AND COALESCE(p.fim_em, now()) > now() - interval '30 days'
  ), 0))::numeric, 1) AS disponibilidade_30_dias_pct
FROM public.equipamentos e;
GRANT SELECT ON public.v_manutencao_indicadores_equipamento TO authenticated;

-- Seed solicitado: inserir somente se o código ainda não existir, sem sobrescrever
-- dados de equipamentos já cadastrados pelo usuário.
INSERT INTO public.equipamentos (codigo, nome, tipo, localizacao) VALUES
  ('EQ-TQ-TINTA-2000L', 'Tanque de tinta de 2.000 litros', 'tanque', 'Fábrica'),
  ('EQ-MTR-TRIT-01', 'Motor triturador 1', 'motor', 'Fábrica'),
  ('EQ-MTR-TRIT-02', 'Motor triturador 2', 'motor', 'Fábrica'),
  ('EQ-MTR-TRIT-03', 'Motor triturador 3', 'motor', 'Fábrica'),
  ('EQ-BOM-TINTA', 'Bomba de tinta', 'bomba', 'Fábrica'),
  ('EQ-TQ-AGUA', 'Tanque de água', 'tanque', 'Fábrica'),
  ('EQ-ENVASE', 'Equipamento de envase', 'envase', 'Fábrica'),
  ('EQ-MAQ-PINTURA', 'Máquinas de pintura', 'maquina_pintura', 'Fábrica')
ON CONFLICT (codigo) DO NOTHING;

COMMENT ON TABLE public.manutencoes IS 'Agenda e histórico de manutenções preventivas, corretivas e inspeções.';
COMMENT ON TABLE public.paradas_equipamento IS 'Intervalos de indisponibilidade; a duração é calculada a partir do início e fim.';
COMMENT ON VIEW public.v_manutencao_indicadores_equipamento IS 'Disponibilidade, falhas, paradas e revisões vencidas calculadas a partir do histórico.';
