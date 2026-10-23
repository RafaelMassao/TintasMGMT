import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { podeAcessar, type Perfil } from "@/lib/permissoes";

export type TipoAlerta =
  | "materia_prima_baixa"
  | "produto_acabado_baixo"
  | "pedido_atrasado"
  | "lote_atrasado"
  | "manutencao_vencida"
  | "equipamento_parado"
  | "perda_acima_limite"
  | "compra_atrasada";
export type SeveridadeAlerta = "informativo" | "atencao" | "critico";

export type Alerta = {
  id: string;
  chave: string;
  tipo: TipoAlerta;
  titulo: string;
  descricao: string;
  severidade: SeveridadeAlerta;
  link: string;
  criado_em: string;
  lido_em: string | null;
};

type NovoAlerta = Omit<Alerta, "id" | "criado_em" | "lido_em">;
type Resposta<T> = { data: T | null; error: { message: string } | null };

const hoje = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const numero = (v: number | string | null | undefined) => Number(v ?? 0);
const gerarChave = (tipo: TipoAlerta, id: string) => `${tipo}:${id}`;

function falharSeErro(...respostas: (Resposta<unknown> | null)[]) {
  const respostaComErro = respostas.find((r) => r?.error);
  if (respostaComErro?.error) throw new Error(respostaComErro.error.message);
}

async function gerarAlertasAtivos(perfis: Perfil[]): Promise<NovoAlerta[]> {
  const dataHoje = hoje();
  const alerta: NovoAlerta[] = [];
  const podeEstoque = podeAcessar(perfis, "/estoque");
  const podePedidos = podeAcessar(perfis, "/pedidos");
  const podeProducao = podeAcessar(perfis, "/producao");
  const podeManutencao = podeAcessar(perfis, "/manutencao");
  const podePerdas = podeAcessar(perfis, "/perdas");
  const podeCompras = podeAcessar(perfis, "/compras");

  const [
    estoqueResp,
    pedidosResp,
    lotesResp,
    manutencaoResp,
    paradasResp,
    comprasResp,
    perdasConfigResp,
  ] = await Promise.all([
    podeEstoque
      ? Promise.all([
          supabase.from("v_estoque_saldo").select("item_id,tipo_item,saldo").limit(10000),
          supabase
            .from("materiais")
            .select("id,nome,estoque_minimo")
            .eq("ativo", true)
            .limit(10000),
          supabase.from("produtos").select("id,nome,estoque_minimo").eq("ativo", true).limit(10000),
        ])
      : Promise.resolve(null),
    podePedidos
      ? supabase
          .from("pedidos")
          .select("id,numero,prazo_prometido,status")
          .lt("prazo_prometido", dataHoje)
          .order("prazo_prometido")
          .limit(1000)
      : Promise.resolve(null),
    podeProducao
      ? supabase
          .from("lotes_producao")
          .select("id,numero_lote,data_planejada,status")
          .lt("data_planejada", dataHoje)
          .order("data_planejada")
          .limit(1000)
      : Promise.resolve(null),
    podeManutencao
      ? supabase
          .from("equipamentos")
          .select("id,nome,proxima_revisao_em")
          .eq("ativo", true)
          .lt("proxima_revisao_em", dataHoje)
          .limit(1000)
      : Promise.resolve(null),
    podeManutencao
      ? supabase
          .from("equipamentos")
          .select("id,nome")
          .eq("ativo", true)
          .eq("status_operacional", "parado")
          .limit(1000)
      : Promise.resolve(null),
    podeCompras
      ? supabase
          .from("pedidos_compra")
          .select("id,numero,previsao_entrega,status")
          .lt("previsao_entrega", dataHoje)
          .in("status", ["enviado", "parcial"])
          .order("previsao_entrega")
          .limit(1000)
      : Promise.resolve(null),
    podePerdas
      ? supabase
          .from("configuracao_alertas")
          .select("limite_perda_valor,periodo_perda_dias")
          .eq("id", 1)
          .maybeSingle()
      : Promise.resolve(null),
  ]);

  if (estoqueResp) falharSeErro(...estoqueResp);
  falharSeErro(pedidosResp, lotesResp, manutencaoResp, paradasResp, comprasResp, perdasConfigResp);

  if (estoqueResp) {
    const [saldosResult, materiaisResult, produtosResult] = estoqueResp;
    const saldos = (saldosResult.data ?? []) as {
      item_id: string;
      tipo_item: string;
      saldo: number | string;
    }[];
    const saldoPorItem = new Map(
      saldos.map((r) => [`${r.tipo_item}:${r.item_id}`, numero(r.saldo)]),
    );
    const materiais = new Map(
      (
        (materiaisResult.data ?? []) as {
          id: string;
          nome: string;
          estoque_minimo: number | string;
        }[]
      ).map((r) => [r.id, r]),
    );
    const produtos = new Map(
      (
        (produtosResult.data ?? []) as {
          id: string;
          nome: string;
          estoque_minimo: number | string;
        }[]
      ).map((r) => [r.id, r]),
    );
    for (const item of materiais.values()) {
      const saldo = saldoPorItem.get(`material:${item.id}`) ?? 0;
      const minimo = numero(item.estoque_minimo);
      if (minimo > 0 && saldo < minimo)
        alerta.push({
          chave: gerarChave("materia_prima_baixa", item.id),
          tipo: "materia_prima_baixa",
          titulo: "Matéria-prima abaixo do mínimo",
          descricao: `${item.nome}: saldo ${saldo}; mínimo ${minimo}.`,
          severidade: "atencao",
          link: "/estoque",
        });
    }
    for (const item of produtos.values()) {
      const saldo = saldoPorItem.get(`produto:${item.id}`) ?? 0;
      const minimo = numero(item.estoque_minimo);
      if (minimo > 0 && saldo < minimo)
        alerta.push({
          chave: gerarChave("produto_acabado_baixo", item.id),
          tipo: "produto_acabado_baixo",
          titulo: "Produto acabado abaixo do mínimo",
          descricao: `${item.nome}: saldo ${saldo}; mínimo ${minimo}.`,
          severidade: "atencao",
          link: "/estoque",
        });
    }
  }

  for (const row of (pedidosResp?.data ?? []) as {
    id: string;
    numero: string;
    prazo_prometido: string;
    status: string;
  }[]) {
    if (["entregue", "cancelado"].includes(row.status)) continue;
    alerta.push({
      chave: gerarChave("pedido_atrasado", row.id),
      tipo: "pedido_atrasado",
      titulo: "Pedido atrasado",
      descricao: `Pedido ${row.numero} venceu em ${row.prazo_prometido}.`,
      severidade: "critico",
      link: "/pedidos",
    });
  }
  for (const row of (lotesResp?.data ?? []) as {
    id: string;
    numero_lote: string;
    data_planejada: string;
    status: string;
  }[]) {
    if (["concluido", "parcialmente_concluido", "cancelado"].includes(row.status)) continue;
    alerta.push({
      chave: gerarChave("lote_atrasado", row.id),
      tipo: "lote_atrasado",
      titulo: "Lote atrasado",
      descricao: `Lote ${row.numero_lote} tinha previsão para ${row.data_planejada}.`,
      severidade: "critico",
      link: "/producao",
    });
  }
  for (const row of (manutencaoResp?.data ?? []) as {
    id: string;
    nome: string;
    proxima_revisao_em: string;
  }[]) {
    alerta.push({
      chave: gerarChave("manutencao_vencida", row.id),
      tipo: "manutencao_vencida",
      titulo: "Manutenção vencida",
      descricao: `Revisão de ${row.nome} venceu em ${row.proxima_revisao_em}.`,
      severidade: "atencao",
      link: "/manutencao",
    });
  }
  for (const row of (paradasResp?.data ?? []) as { id: string; nome: string }[]) {
    alerta.push({
      chave: gerarChave("equipamento_parado", row.id),
      tipo: "equipamento_parado",
      titulo: "Equipamento parado",
      descricao: `${row.nome} está marcado como parado.`,
      severidade: "critico",
      link: "/manutencao",
    });
  }
  for (const row of (comprasResp?.data ?? []) as {
    id: string;
    numero: string;
    previsao_entrega: string;
    status: string;
  }[]) {
    alerta.push({
      chave: gerarChave("compra_atrasada", row.id),
      tipo: "compra_atrasada",
      titulo: "Compra atrasada",
      descricao: `Pedido de compra ${row.numero} tinha previsão para ${row.previsao_entrega}.`,
      severidade: "atencao",
      link: "/compras",
    });
  }

  const config = perdasConfigResp?.data as {
    limite_perda_valor: number | string | null;
    periodo_perda_dias: number;
  } | null;
  const limite = numero(config?.limite_perda_valor);
  if (config?.limite_perda_valor != null && limite > 0) {
    const inicioPeriodo = new Date();
    inicioPeriodo.setDate(inicioPeriodo.getDate() - Number(config.periodo_perda_dias ?? 30));
    inicioPeriodo.setMinutes(inicioPeriodo.getMinutes() - inicioPeriodo.getTimezoneOffset());
    const inicioISO = inicioPeriodo.toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("perdas")
      .select("valor_estimado,data")
      .gte("data", inicioISO)
      .lte("data", dataHoje)
      .limit(10000);
    if (error) throw error;
    const perdas = (data ?? []) as { valor_estimado: number | string; data: string }[];
    if (perdas.length >= 10000)
      throw new Error(
        "A consulta de perdas atingiu o limite de linhas. O alerta foi omitido para evitar um total incompleto.",
      );
    const total = perdas.reduce((soma, p) => soma + numero(p.valor_estimado), 0);
    if (total > limite) {
      const chavePeriodo = `perda-acima-limite:${inicioISO}`;
      alerta.push({
        chave: chavePeriodo,
        tipo: "perda_acima_limite",
        titulo: "Perdas acima do limite",
        descricao: `Total estimado de R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} nos últimos ${config.periodo_perda_dias} dias; limite configurado: R$ ${limite.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
        severidade: "atencao",
        link: "/perdas",
      });
    }
  }

  return alerta;
}

export function useAlertas(perfis: Perfil[]) {
  const queryClient = useQueryClient();
  const tiposPermitidos: TipoAlerta[] = [];
  if (podeAcessar(perfis, "/estoque"))
    tiposPermitidos.push("materia_prima_baixa", "produto_acabado_baixo");
  if (podeAcessar(perfis, "/pedidos")) tiposPermitidos.push("pedido_atrasado");
  if (podeAcessar(perfis, "/producao")) tiposPermitidos.push("lote_atrasado");
  if (podeAcessar(perfis, "/manutencao"))
    tiposPermitidos.push("manutencao_vencida", "equipamento_parado");
  if (podeAcessar(perfis, "/perdas")) tiposPermitidos.push("perda_acima_limite");
  if (podeAcessar(perfis, "/compras")) tiposPermitidos.push("compra_atrasada");
  const query = useQuery({
    queryKey: ["central-alertas", [...perfis].sort()],
    queryFn: async () => {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user)
        throw new Error("Sessão expirada. Entre novamente para consultar os alertas.");

      const ativos = await gerarAlertasAtivos(perfis);
      if (ativos.length) {
        const { error } = await supabase.from("alertas_usuario").upsert(
          ativos.map((a) => ({ usuario_id: authData.user.id, ...a })),
          { onConflict: "usuario_id,chave", ignoreDuplicates: true },
        );
        if (error) throw error;
      }
      if (tiposPermitidos.length === 0) return [];
      const { data, error } = await supabase
        .from("alertas_usuario")
        .select("id,chave,tipo,titulo,descricao,severidade,link,criado_em,lido_em")
        .eq("usuario_id", authData.user.id)
        .in("tipo", tiposPermitidos)
        .order("criado_em", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Alerta[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });

  const marcarComoLido = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("alertas_usuario")
        .update({ lido_em: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["central-alertas"] });
    },
    [queryClient],
  );

  const marcarTodosComoLidos = useCallback(async () => {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error("Sessão expirada. Entre novamente.");
    const { error } = await supabase
      .from("alertas_usuario")
      .update({ lido_em: new Date().toISOString() })
      .eq("usuario_id", authData.user.id)
      .is("lido_em", null);
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["central-alertas"] });
  }, [queryClient]);

  return { ...query, marcarComoLido, marcarTodosComoLidos };
}
