import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Produto = {
  id: string;
  nome: string;
  cor_id: string | null;
  embalagem_id: string | null;
  unidade_medida_id: string | null;
  estoque_minimo: number | string | null;
  estoque_maximo: number | string | null;
};
type Cor = { id: string; nome: string };
type Embalagem = {
  id: string;
  nome: string;
  volume_litros: number | string | null;
  capacidade: number | string | null;
  estoque_minimo: number | string | null;
  estoque_maximo: number | string | null;
};
type Unidade = { id: string; sigla: string };
type Material = {
  id: string;
  nome: string;
  estoque_minimo: number | string | null;
  estoque_maximo: number | string | null;
};
type Equipamento = { id: string; nome: string };
type Tanque = { id: string; equipamento_id: string };
type Lote = {
  id: string;
  numero_lote: string;
  produto_id: string;
  tanque_id: string | null;
  pedido_id: string | null;
  quantidade_produzida: number | string | null;
  volume_produzido_litros: number | string | null;
  inicio_producao: string | null;
  fim_producao: string | null;
  status: string;
};
type Envase = {
  id: string;
  lote_id: string;
  embalagem_id: string;
  quantidade_aprovada: number | string | null;
  inicio_envase: string | null;
  fim_envase: string | null;
};
type Pedido = {
  id: string;
  numero: string;
  status: string;
  prazo_prometido: string | null;
  data_entrega: string | null;
};
type ItemPedido = {
  id: string;
  pedido_id: string;
  produto_id: string;
  quantidade_solicitada: number | string;
  quantidade_entregue: number | string;
  preco_unitario: number | string;
};
type Saldo = {
  item_id: string;
  tipo_item: "material" | "produto" | "embalagem";
  material_id: string | null;
  produto_id: string | null;
  embalagem_id: string | null;
  saldo: number | string;
};
type Perda = {
  id: string;
  data: string;
  produto_id: string | null;
  material_id: string | null;
  embalagem_id: string | null;
  embalagem_referencia_id: string | null;
  cor_id: string | null;
  motivo: string;
  quantidade: number | string;
  unidade: string;
  valor_estimado: number | string;
};
type Parada = {
  id: string;
  equipamento_id: string;
  equipamento_nome: string;
  manutencao_tipo: string | null;
  inicio_em: string;
  fim_em: string | null;
  motivo: string;
  lote_id: string | null;
  pedido_id: string | null;
};
type ManutencaoDashboard = {
  id: string;
  equipamento_id: string;
  tipo: "preventiva" | "corretiva" | "inspecao";
  status: string;
  data_prevista: string;
  data_conclusao: string | null;
};
type Filtros = {
  produto: string;
  cor: string;
  embalagem: string;
  status: string;
  equipamento: string;
};
type SeriePeriodo = { periodo: string; producao: number; vendas: number };
type SerieSimples = { nome: string; valor: number; secundario?: number };

function inicioIso(dia: string) {
  return new Date(`${dia}T00:00:00`).toISOString();
}
function fimExclusivoIso(dia: string) {
  const data = new Date(`${dia}T00:00:00`);
  data.setDate(data.getDate() + 1);
  return data.toISOString();
}
function fimInclusivoIso(dia: string) {
  return new Date(new Date(fimExclusivoIso(dia)).getTime() - 1).toISOString();
}

export function useDashboardData({
  podeProducao,
  podeVendas,
  podeEstoque,
  podePerdas,
  podeParadas,
  periodoDe,
  periodoAte,
}: {
  podeProducao: boolean;
  podeVendas: boolean;
  podeEstoque: boolean;
  podePerdas: boolean;
  podeParadas: boolean;
  periodoDe: string;
  periodoAte: string;
}) {
  const periodoValido = !!periodoDe && !!periodoAte && periodoDe <= periodoAte;
  const catalogos = useQuery({
    queryKey: ["dashboard-catalogos-reais"],
    queryFn: async () => {
      const [produtosR, coresR, embalagensR, unidadesR, materiaisR, equipamentosR, tanquesR] =
        await Promise.all([
          supabase
            .from("produtos")
            .select("id,nome,cor_id,embalagem_id,unidade_medida_id,estoque_minimo,estoque_maximo")
            .eq("ativo", true)
            .order("nome")
            .limit(5000),
          supabase.from("cores").select("id,nome").eq("ativo", true).order("nome").limit(5000),
          supabase
            .from("embalagens")
            .select("id,nome,volume_litros,capacidade,estoque_minimo,estoque_maximo")
            .eq("ativo", true)
            .order("nome")
            .limit(5000),
          supabase.from("unidades_medida").select("id,sigla").eq("ativo", true).limit(1000),
          supabase
            .from("materiais")
            .select("id,nome,estoque_minimo,estoque_maximo")
            .eq("ativo", true)
            .order("nome")
            .limit(5000),
          supabase
            .from("equipamentos")
            .select("id,nome")
            .eq("ativo", true)
            .order("nome")
            .limit(5000),
          supabase.from("tanques").select("id,equipamento_id").eq("ativo", true).limit(5000),
        ]);
      const falha = [
        produtosR,
        coresR,
        embalagensR,
        unidadesR,
        materiaisR,
        equipamentosR,
        tanquesR,
      ].find((resposta) => resposta.error);
      if (falha?.error) throw falha.error;
      return {
        produtos: (produtosR.data ?? []) as unknown as Produto[],
        cores: (coresR.data ?? []) as unknown as Cor[],
        embalagens: (embalagensR.data ?? []) as unknown as Embalagem[],
        unidades: (unidadesR.data ?? []) as unknown as Unidade[],
        materiais: (materiaisR.data ?? []) as unknown as Material[],
        equipamentos: (equipamentosR.data ?? []) as unknown as Equipamento[],
        tanques: (tanquesR.data ?? []) as unknown as Tanque[],
      };
    },
    staleTime: 60_000,
    retry: false,
  });

  const producao = useQuery({
    queryKey: ["dashboard-producao-real", periodoDe, periodoAte],
    enabled: podeProducao && periodoValido,
    queryFn: async () => {
      const de = inicioIso(periodoDe);
      const ate = fimExclusivoIso(periodoAte);
      const [lotesR, envasesR] = await Promise.all([
        supabase
          .from("lotes_producao")
          .select(
            "id,numero_lote,produto_id,tanque_id,pedido_id,quantidade_produzida,volume_produzido_litros,inicio_producao,fim_producao,status",
          )
          .or(
            `and(inicio_producao.gte.${de},inicio_producao.lt.${ate}),and(fim_producao.gte.${de},fim_producao.lt.${ate})`,
          )
          .limit(5000),
        supabase
          .from("envases")
          .select("id,lote_id,embalagem_id,quantidade_aprovada,inicio_envase,fim_envase")
          .or(
            `and(inicio_envase.gte.${de},inicio_envase.lt.${ate}),and(fim_envase.gte.${de},fim_envase.lt.${ate})`,
          )
          .limit(5000),
      ]);
      const falha = [lotesR, envasesR].find((resposta) => resposta.error);
      if (falha?.error) throw falha.error;
      const lotes = (lotesR.data ?? []) as unknown as Lote[];
      const envases = (envasesR.data ?? []) as unknown as Envase[];
      const idsFaltantes = [...new Set(envases.map((envase) => envase.lote_id))].filter(
        (id) => !lotes.some((lote) => lote.id === id),
      );
      if (!idsFaltantes.length) return { lotes, envases };
      const relacionadosR = await supabase
        .from("lotes_producao")
        .select(
          "id,numero_lote,produto_id,tanque_id,pedido_id,quantidade_produzida,volume_produzido_litros,inicio_producao,fim_producao,status",
        )
        .in("id", idsFaltantes);
      if (relacionadosR.error) throw relacionadosR.error;
      return { lotes: [...lotes, ...((relacionadosR.data ?? []) as unknown as Lote[])], envases };
    },
    staleTime: 30_000,
    retry: false,
  });

  const vendas = useQuery({
    queryKey: ["dashboard-vendas-reais", periodoDe, periodoAte],
    enabled: podeVendas && periodoValido,
    queryFn: async () => {
      const [entreguesR, prazosR] = await Promise.all([
        supabase
          .from("pedidos")
          .select("id,numero,status,prazo_prometido,data_entrega")
          .eq("status", "entregue")
          .gte("data_entrega", periodoDe)
          .lte("data_entrega", periodoAte)
          .limit(5000),
        supabase
          .from("pedidos")
          .select("id,numero,status,prazo_prometido,data_entrega")
          .gte("prazo_prometido", periodoDe)
          .lte("prazo_prometido", periodoAte)
          .limit(5000),
      ]);
      const falha = [entreguesR, prazosR].find((resposta) => resposta.error);
      if (falha?.error) throw falha.error;
      const mapaPedidos = new Map<string, Pedido>();
      for (const pedido of [
        ...(entreguesR.data ?? []),
        ...(prazosR.data ?? []),
      ] as unknown as Pedido[]) {
        mapaPedidos.set(pedido.id, pedido);
      }
      const ids = [...mapaPedidos.keys()];
      if (!ids.length) return { pedidos: [], itens: [] as ItemPedido[] };
      const itensR = await supabase
        .from("itens_pedido")
        .select("id,pedido_id,produto_id,quantidade_solicitada,quantidade_entregue,preco_unitario")
        .in("pedido_id", ids)
        .limit(10000);
      if (itensR.error) throw itensR.error;
      return {
        pedidos: [...mapaPedidos.values()],
        itens: (itensR.data ?? []) as unknown as ItemPedido[],
      };
    },
    staleTime: 30_000,
    retry: false,
  });

  const estoque = useQuery({
    queryKey: ["dashboard-estoque-real"],
    enabled: podeEstoque,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_estoque_saldo")
        .select("item_id,tipo_item,material_id,produto_id,embalagem_id,saldo")
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as unknown as Saldo[];
    },
    staleTime: 30_000,
    retry: false,
  });

  const perdas = useQuery({
    queryKey: ["dashboard-perdas-reais", periodoDe, periodoAte],
    enabled: podePerdas && periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perdas")
        .select(
          "id,data,produto_id,material_id,embalagem_id,embalagem_referencia_id,cor_id,motivo,quantidade,unidade,valor_estimado",
        )
        .gte("data", periodoDe)
        .lte("data", periodoAte)
        .order("data", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as unknown as Perda[];
    },
    staleTime: 30_000,
    retry: false,
  });

  const paradas = useQuery({
    queryKey: ["dashboard-paradas-reais", periodoDe, periodoAte],
    enabled: podeParadas && periodoValido,
    queryFn: async () => {
      const de = inicioIso(periodoDe);
      const ate = fimInclusivoIso(periodoAte);
      const paradasR = await supabase
        .from("v_paradas_impacto")
        .select(
          "id,equipamento_id,equipamento_nome,manutencao_tipo,inicio_em,fim_em,motivo,lote_id,pedido_id",
        )
        .lte("inicio_em", ate)
        .or(`fim_em.is.null,fim_em.gte.${de}`)
        .limit(10000);
      if (paradasR.error) throw paradasR.error;
      const rows = (paradasR.data ?? []) as unknown as Parada[];
      const loteIds = [
        ...new Set(rows.map((row) => row.lote_id).filter((id): id is string => !!id)),
      ];
      const pedidoIds = [
        ...new Set(rows.map((row) => row.pedido_id).filter((id): id is string => !!id)),
      ];
      const [lotesR, itensR] = await Promise.all([
        loteIds.length
          ? supabase
              .from("lotes_producao")
              .select(
                "id,numero_lote,produto_id,tanque_id,pedido_id,quantidade_produzida,volume_produzido_litros,inicio_producao,fim_producao,status",
              )
              .in("id", loteIds)
          : Promise.resolve({ data: [], error: null }),
        pedidoIds.length
          ? supabase
              .from("itens_pedido")
              .select(
                "id,pedido_id,produto_id,quantidade_solicitada,quantidade_entregue,preco_unitario",
              )
              .in("pedido_id", pedidoIds)
              .limit(10000)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (lotesR.error) throw lotesR.error;
      if (itensR.error) throw itensR.error;
      return {
        rows,
        lotesRelacionados: (lotesR.data ?? []) as unknown as Lote[],
        itensRelacionados: (itensR.data ?? []) as unknown as ItemPedido[],
      };
    },
    staleTime: 30_000,
    retry: false,
  });

  const manutencoes = useQuery({
    queryKey: ["dashboard-manutencoes-reais", periodoDe, periodoAte],
    enabled: podeParadas && periodoValido,
    queryFn: async () => {
      const de = inicioIso(periodoDe);
      const ate = fimExclusivoIso(periodoAte);
      const [previstasR, concluidasR] = await Promise.all([
        supabase
          .from("manutencoes")
          .select("id,equipamento_id,tipo,status,data_prevista,data_conclusao")
          .gte("data_prevista", periodoDe)
          .lte("data_prevista", periodoAte)
          .limit(10000),
        supabase
          .from("manutencoes")
          .select("id,equipamento_id,tipo,status,data_prevista,data_conclusao")
          .gte("data_conclusao", de)
          .lt("data_conclusao", ate)
          .limit(10000),
      ]);
      const falha = [previstasR, concluidasR].find((resposta) => resposta.error);
      if (falha?.error) throw falha.error;
      const unicas = new Map<string, ManutencaoDashboard>();
      for (const item of [...(previstasR.data ?? []), ...(concluidasR.data ?? [])]) {
        unicas.set(item.id, item as unknown as ManutencaoDashboard);
      }
      return [...unicas.values()].filter((item) => {
        const dataReferencia = (item.data_conclusao ?? item.data_prevista).slice(0, 10);
        return dataReferencia >= periodoDe && dataReferencia <= periodoAte;
      });
    },
    staleTime: 30_000,
    retry: false,
  });

  return { catalogos, producao, vendas, estoque, perdas, paradas, manutencoes };
}

export type {
  Produto,
  Cor,
  Embalagem,
  Unidade,
  Material,
  Equipamento,
  Tanque,
  Lote,
  Envase,
  Pedido,
  ItemPedido,
  Saldo,
  Perda,
  Parada,
  Filtros,
  SeriePeriodo,
  SerieSimples,
};
