import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LABEL_STATUS, statusEstoque } from "@/lib/estoque";
import type { Perfil } from "@/lib/permissoes";
import { useDashboardData } from "@/lib/dashboard/useDashboardData";

export const Route = createFileRoute("/_painel/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Tintas Gestão" },
      { name: "description", content: "Relatórios gerenciais com dados reais do Supabase." },
      { property: "og:title", content: "Relatórios — Tintas Gestão" },
      {
        property: "og:description",
        content: "Relatórios gerenciais com dados reais do Supabase.",
      },
    ],
  }),
  component: RelatoriosPage,
});

type RelatorioId =
  | "producao-periodo"
  | "vendas-periodo"
  | "vendas-embalagem"
  | "vendas-cor"
  | "estoque-atual"
  | "estoque-minimo"
  | "perdas-motivo"
  | "atrasos-causa"
  | "paradas-equipamento"
  | "manutencoes";
type FormatoColuna = "numero" | "moeda" | "percentual" | "horas" | "data";
type Coluna = { key: string; label: string; formato?: FormatoColuna };
type Linha = Record<string, string | number | null>;
type ModeloRelatorio = { colunas: Coluna[]; linhas: Linha[]; observacao?: string };
type OcorrenciaRelatorio = {
  id: string;
  tipo: string;
  motivo: string;
  data_prevista: string;
  atraso_minutos: number | string;
  status: string;
};
type ManutencaoRelatorio = {
  id: string;
  equipamento_id: string;
  tipo: string;
  status: string;
  data_prevista: string;
  data_inicio: string | null;
  data_conclusao: string | null;
  descricao: string;
  responsavel_nome: string;
};
type Acumulado = { unidades: number; litros: number; receita: number; pedidos: Set<string> };
type CelulaCsv = { valor: string; texto: boolean };

const CONTROL_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TITULOS: Record<RelatorioId, string> = {
  "producao-periodo": "Produção por período",
  "vendas-periodo": "Vendas por período",
  "vendas-embalagem": "Vendas por embalagem",
  "vendas-cor": "Vendas por cor",
  "estoque-atual": "Estoque atual",
  "estoque-minimo": "Itens abaixo do mínimo",
  "perdas-motivo": "Perdas por motivo",
  "atrasos-causa": "Atrasos por causa",
  "paradas-equipamento": "Paradas por equipamento",
  manutencoes: "Manutenções realizadas",
};
const RELATORIOS: { id: RelatorioId; perfis: Perfil[] }[] = [
  { id: "producao-periodo", perfis: ["producao"] },
  { id: "vendas-periodo", perfis: ["vendas"] },
  { id: "vendas-embalagem", perfis: ["vendas"] },
  { id: "vendas-cor", perfis: ["vendas"] },
  { id: "estoque-atual", perfis: ["estoque", "vendas"] },
  { id: "estoque-minimo", perfis: ["estoque", "vendas"] },
  { id: "perdas-motivo", perfis: ["producao"] },
  { id: "atrasos-causa", perfis: ["producao", "vendas", "estoque", "manutencao"] },
  { id: "paradas-equipamento", perfis: ["manutencao"] },
  { id: "manutencoes", perfis: ["manutencao"] },
];

function dataLocal(data: Date) {
  return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function dataInicialPadrao() {
  const data = new Date();
  data.setDate(data.getDate() - 29);
  return dataLocal(data);
}
function inicioIso(dia: string) {
  return new Date(`${dia}T00:00:00`).toISOString();
}
function proximoDiaIso(dia: string) {
  const data = new Date(`${dia}T00:00:00`);
  data.setDate(data.getDate() + 1);
  return data.toISOString();
}
function numero(valor: unknown) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}
function dataCampo(valor: string | null | undefined) {
  return valor?.slice(0, 10) ?? "";
}
function dentroDoPeriodo(valor: string | null | undefined, de: string, ate: string) {
  const dia = dataCampo(valor);
  return !!dia && dia >= de && dia <= ate;
}
function diasNoPeriodo(de: string, ate: string) {
  return Math.ceil(
    (new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()) / 86_400_000,
  );
}
function modoPeriodo(de: string, ate: string): "dia" | "semana" | "mes" {
  const dias = diasNoPeriodo(de, ate);
  return dias <= 45 ? "dia" : dias <= 150 ? "semana" : "mes";
}
function chavePeriodo(valor: string, modo: "dia" | "semana" | "mes") {
  const data = new Date(`${valor.slice(0, 10)}T12:00:00`);
  if (modo === "mes") return `${valor.slice(0, 7)}-01`;
  if (modo === "semana") {
    data.setDate(data.getDate() - ((data.getDay() + 6) % 7));
    return dataLocal(data);
  }
  return valor.slice(0, 10);
}
function rotuloPeriodo(chave: string, modo: "dia" | "semana" | "mes") {
  const data = new Date(`${chave}T12:00:00`);
  if (modo === "mes")
    return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(data);
  const dia = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(data);
  return modo === "semana" ? `Semana de ${dia}` : dia;
}
function formatarNumero(valor: number, casas = 3) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(valor);
}
function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}
function textoErro(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Falha ao consultar o Supabase.";
}
function escaparCsv(valor: string, protegerFormula = false) {
  const seguro = protegerFormula && /^[\t\r\n ]*[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return `"${seguro.replaceAll('"', '""')}"`;
}

function gerarModelo(
  id: RelatorioId,
  de: string,
  ate: string,
  dashboard: ReturnType<typeof useDashboardData>,
  ocorrencias: OcorrenciaRelatorio[],
  manutencoes: ManutencaoRelatorio[],
): ModeloRelatorio {
  const catalogos = dashboard.catalogos.data;
  const produtos = new Map((catalogos?.produtos ?? []).map((item) => [item.id, item]));
  const cores = new Map((catalogos?.cores ?? []).map((item) => [item.id, item.nome]));
  const embalagens = new Map((catalogos?.embalagens ?? []).map((item) => [item.id, item]));
  const unidades = new Map((catalogos?.unidades ?? []).map((item) => [item.id, item.sigla]));
  const materiais = new Map((catalogos?.materiais ?? []).map((item) => [item.id, item]));
  const equipamentos = new Map((catalogos?.equipamentos ?? []).map((item) => [item.id, item.nome]));
  const opcaoEmbalagem = (produtoId: string) => {
    const produto = produtos.get(produtoId);
    return produto?.embalagem_id ? embalagens.get(produto.embalagem_id) : undefined;
  };
  const litrosPorUnidade = (produtoId: string) => {
    const produto = produtos.get(produtoId);
    if (!produto) return null;
    const siglaProduto = (unidades.get(produto.unidade_medida_id ?? "") ?? "").toLocaleLowerCase(
      "pt-BR",
    );
    if (["l", "lt", "litro", "litros"].includes(siglaProduto)) return 1;
    const embalagem = opcaoEmbalagem(produtoId);
    const volumeExplicito = numero(embalagem?.volume_litros);
    if (volumeExplicito > 0) return volumeExplicito;
    const siglaEmbalagem = (
      unidades.get(embalagem?.unidade_medida_id ?? "") ?? ""
    ).toLocaleLowerCase("pt-BR");
    const capacidade = numero(embalagem?.capacidade);
    return capacidade > 0 && ["l", "lt", "litro", "litros"].includes(siglaEmbalagem)
      ? capacidade
      : null;
  };
  const registrosVenda = () => {
    const pedidos = new Map(
      (dashboard.vendas.data?.pedidos ?? [])
        .filter(
          (pedido) => pedido.status === "entregue" && dentroDoPeriodo(pedido.data_entrega, de, ate),
        )
        .map((pedido) => [pedido.id, pedido]),
    );
    return (dashboard.vendas.data?.itens ?? [])
      .filter((item) => pedidos.has(item.pedido_id) && numero(item.quantidade_entregue) > 0)
      .map((item) => ({ item, pedido: pedidos.get(item.pedido_id)! }));
  };

  if (id === "producao-periodo") {
    const modo = modoPeriodo(de, ate);
    const grupos = new Map<
      string,
      { lotes: number; quantidade: number; litros: number; envases: number }
    >();
    const obter = (chave: string) => {
      const atual = grupos.get(chave) ?? { lotes: 0, quantidade: 0, litros: 0, envases: 0 };
      grupos.set(chave, atual);
      return atual;
    };
    for (const lote of dashboard.producao.data?.lotes ?? []) {
      if (lote.status === "cancelado") continue;
      const data = lote.fim_producao ?? lote.inicio_producao;
      if (!dentroDoPeriodo(data, de, ate)) continue;
      const grupo = obter(chavePeriodo(data!, modo));
      grupo.lotes += 1;
      grupo.quantidade += numero(lote.quantidade_produzida);
      grupo.litros += numero(lote.volume_produzido_litros);
    }
    for (const envase of dashboard.producao.data?.envases ?? []) {
      const data = envase.fim_envase ?? envase.inicio_envase;
      if (!dentroDoPeriodo(data, de, ate)) continue;
      obter(chavePeriodo(data!, modo)).envases += numero(envase.quantidade_aprovada);
    }
    return {
      colunas: [
        { key: "periodo", label: "Período" },
        { key: "lotes", label: "Lotes", formato: "numero" },
        { key: "quantidade", label: "Quantidade produzida", formato: "numero" },
        { key: "litros", label: "Volume produzido (L)", formato: "numero" },
        { key: "envases", label: "Unidades envasadas aprovadas", formato: "numero" },
      ],
      linhas: [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([chave, grupo]) => ({ periodo: rotuloPeriodo(chave, modo), ...grupo })),
      observacao:
        "Quantidade produzida e volume em litros são métricas distintas. Lotes e envases são agrupados pela data de conclusão; se ainda estiverem abertos, pela data de início.",
    };
  }

  if (id === "vendas-periodo") {
    const modo = modoPeriodo(de, ate);
    const grupos = new Map<string, Acumulado>();
    for (const { item, pedido } of registrosVenda()) {
      const data = pedido.data_entrega;
      if (!data) continue;
      const chave = chavePeriodo(data, modo);
      const grupo = grupos.get(chave) ?? {
        unidades: 0,
        litros: 0,
        receita: 0,
        pedidos: new Set<string>(),
      };
      const quantidade = numero(item.quantidade_entregue);
      grupo.unidades += quantidade;
      const litrosUnitarios = litrosPorUnidade(item.produto_id);
      if (litrosUnitarios !== null) grupo.litros += quantidade * litrosUnitarios;
      grupo.receita += quantidade * numero(item.preco_unitario);
      grupo.pedidos.add(pedido.id);
      grupos.set(chave, grupo);
    }
    return {
      colunas: [
        { key: "periodo", label: "Período" },
        { key: "pedidos", label: "Pedidos entregues", formato: "numero" },
        { key: "unidades", label: "Unidades vendidas", formato: "numero" },
        { key: "litros", label: "Volume vendido (L)", formato: "numero" },
        { key: "receita", label: "Receita estimada", formato: "moeda" },
      ],
      linhas: [...grupos.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([chave, grupo]) => ({
          periodo: rotuloPeriodo(chave, modo),
          pedidos: grupo.pedidos.size,
          unidades: grupo.unidades,
          litros: grupo.litros,
          receita: grupo.receita,
        })),
      observacao:
        "Vendas contabilizam pedidos com status entregue e quantidades efetivamente entregues. Litros são calculados apenas quando a unidade ou o volume da embalagem permitem conversão; não são inferidos para itens sem conversão cadastrada.",
    };
  }

  if (id === "vendas-embalagem") {
    const grupos = new Map<
      string,
      {
        embalagem: string;
        unidades: number;
        litros: number;
        receita: number;
        litrosConhecidos: boolean;
      }
    >();
    for (const { item } of registrosVenda()) {
      const produto = produtos.get(item.produto_id);
      const embalagem = opcaoEmbalagem(item.produto_id);
      const chave = produto?.embalagem_id ?? "sem-embalagem";
      const grupo = grupos.get(chave) ?? {
        embalagem: embalagem?.nome ?? "Sem embalagem cadastrada",
        unidades: 0,
        litros: 0,
        receita: 0,
        litrosConhecidos: true,
      };
      const quantidade = numero(item.quantidade_entregue);
      const litrosUnitarios = litrosPorUnidade(item.produto_id);
      grupo.unidades += quantidade;
      if (litrosUnitarios === null) grupo.litrosConhecidos = false;
      else grupo.litros += quantidade * litrosUnitarios;
      grupo.receita += quantidade * numero(item.preco_unitario);
      grupos.set(chave, grupo);
    }
    const base = [...grupos.values()];
    const porUnidades = [...base].sort((a, b) => b.unidades - a.unidades);
    const porLitros = [...base]
      .filter((item) => item.litrosConhecidos && item.litros > 0)
      .sort((a, b) => b.litros - a.litros);
    const posicaoUnidades = new Map(porUnidades.map((item, index) => [item.embalagem, index + 1]));
    const posicaoLitros = new Map(porLitros.map((item, index) => [item.embalagem, index + 1]));
    return {
      colunas: [
        { key: "posicaoUnidades", label: "Posição (unidades)", formato: "numero" },
        { key: "embalagem", label: "Embalagem" },
        { key: "unidades", label: "Unidades vendidas", formato: "numero" },
        { key: "posicaoLitros", label: "Posição (litros)", formato: "numero" },
        { key: "litros", label: "Volume vendido (L)", formato: "numero" },
        { key: "receita", label: "Receita estimada", formato: "moeda" },
      ],
      linhas: porUnidades.map((item) => ({
        posicaoUnidades: posicaoUnidades.get(item.embalagem) ?? null,
        embalagem: item.embalagem,
        unidades: item.unidades,
        posicaoLitros: posicaoLitros.get(item.embalagem) ?? null,
        litros: item.litrosConhecidos ? item.litros : null,
        receita: item.receita,
      })),
      observacao:
        "As posições de unidades e de litros são rankings independentes. Litros só entram no ranking quando todos os produtos daquela embalagem têm conversão cadastrada; itens sem volume conhecido permanecem no ranking de unidades.",
    };
  }

  if (id === "vendas-cor") {
    const grupos = new Map<
      string,
      { cor: string; unidades: number; litros: number; receita: number }
    >();
    for (const { item } of registrosVenda()) {
      const produto = produtos.get(item.produto_id);
      const chave = produto?.cor_id ?? "sem-cor";
      const grupo = grupos.get(chave) ?? {
        cor: produto?.cor_id
          ? (cores.get(produto.cor_id) ?? "Cor sem cadastro")
          : "Sem cor informada",
        unidades: 0,
        litros: 0,
        receita: 0,
      };
      const quantidade = numero(item.quantidade_entregue);
      grupo.unidades += quantidade;
      const litrosUnitarios = litrosPorUnidade(item.produto_id);
      if (litrosUnitarios !== null) grupo.litros += quantidade * litrosUnitarios;
      grupo.receita += quantidade * numero(item.preco_unitario);
      grupos.set(chave, grupo);
    }
    const lista = [...grupos.values()];
    const totalUnidades = lista.reduce((soma, item) => soma + item.unidades, 0);
    const totalLitros = lista.reduce((soma, item) => soma + item.litros, 0);
    const totalReceita = lista.reduce((soma, item) => soma + item.receita, 0);
    return {
      colunas: [
        { key: "cor", label: "Cor" },
        { key: "unidades", label: "Unidades vendidas", formato: "numero" },
        { key: "litros", label: "Volume vendido (L)", formato: "numero" },
        { key: "receita", label: "Receita estimada", formato: "moeda" },
        {
          key: "participacaoUnidades",
          label: "Participação das unidades (%)",
          formato: "percentual",
        },
        { key: "participacaoLitros", label: "Participação dos litros (%)", formato: "percentual" },
        { key: "participacaoReceita", label: "Participação da receita (%)", formato: "percentual" },
      ],
      linhas: lista
        .sort((a, b) => b.unidades - a.unidades)
        .map((item) => ({
          cor: item.cor,
          unidades: item.unidades,
          litros: item.litros,
          receita: item.receita,
          participacaoUnidades: totalUnidades > 0 ? (item.unidades / totalUnidades) * 100 : null,
          participacaoLitros: totalLitros > 0 ? (item.litros / totalLitros) * 100 : null,
          participacaoReceita: totalReceita > 0 ? (item.receita / totalReceita) * 100 : null,
        })),
      observacao:
        "Unidades e litros são totais distintos. A participação de litros considera apenas produtos com conversão cadastrada. A receita é estimada como quantidade entregue × preço unitário registrado.",
    };
  }

  if (id === "estoque-atual" || id === "estoque-minimo") {
    const linhas: Linha[] = [];
    for (const saldo of dashboard.estoque.data ?? []) {
      let nome = "Item sem cadastro ativo";
      let tipo: string = saldo.tipo_item;
      let minimo = 0;
      let maximo = 0;
      let unidade = "—";
      if (saldo.tipo_item === "material" && saldo.material_id) {
        const material = materiais.get(saldo.material_id);
        nome = material?.nome ?? nome;
        minimo = numero(material?.estoque_minimo);
        maximo = numero(material?.estoque_maximo);
        unidade = unidades.get(material?.unidade_medida_id ?? "") ?? unidade;
        tipo = "Matéria-prima";
      } else if (saldo.tipo_item === "produto" && saldo.produto_id) {
        const produto = produtos.get(saldo.produto_id);
        nome = produto?.nome ?? nome;
        minimo = numero(produto?.estoque_minimo);
        maximo = numero(produto?.estoque_maximo);
        unidade = unidades.get(produto?.unidade_medida_id ?? "") ?? unidade;
        tipo = "Produto acabado";
      } else if (saldo.tipo_item === "embalagem") {
        const embalagem = embalagens.get(saldo.item_id);
        nome = embalagem?.nome ?? nome;
        minimo = numero(embalagem?.estoque_minimo);
        maximo = numero(embalagem?.estoque_maximo);
        unidade = unidades.get(embalagem?.unidade_medida_id ?? "") ?? unidade;
        tipo = "Embalagem vazia";
      }
      const quantidade = numero(saldo.saldo);
      if (id === "estoque-minimo" && !(minimo > 0 && quantidade < minimo)) continue;
      const status = statusEstoque({
        saldo: quantidade,
        estoqueMinimo: minimo,
        estoqueMaximo: maximo,
      });
      linhas.push({
        item: nome,
        tipo,
        saldo: quantidade,
        unidade,
        estoqueMinimo: minimo,
        status: LABEL_STATUS[status],
      });
    }
    linhas.sort((a, b) => String(a["item"]).localeCompare(String(b["item"]), "pt-BR"));
    return {
      colunas: [
        { key: "item", label: "Item" },
        { key: "tipo", label: "Categoria" },
        { key: "saldo", label: "Saldo atual", formato: "numero" },
        { key: "unidade", label: "Unidade" },
        { key: "estoqueMinimo", label: "Estoque mínimo", formato: "numero" },
        { key: "status", label: "Status" },
      ],
      linhas,
      observacao:
        "Este relatório representa um snapshot do saldo atual, consultado no momento da geração. O Supabase não mantém snapshots históricos para recalcular saldos passados; o período selecionado é registrado no cabeçalho, mas não altera este saldo.",
    };
  }

  if (id === "perdas-motivo") {
    const grupos = new Map<
      string,
      { motivo: string; unidade: string; registros: number; quantidade: number; valor: number }
    >();
    for (const perda of dashboard.perdas.data ?? []) {
      const chave = `${perda.motivo}\u0000${perda.unidade}`;
      const grupo = grupos.get(chave) ?? {
        motivo: perda.motivo,
        unidade: perda.unidade,
        registros: 0,
        quantidade: 0,
        valor: 0,
      };
      grupo.registros += 1;
      grupo.quantidade += numero(perda.quantidade);
      grupo.valor += numero(perda.valor_estimado);
      grupos.set(chave, grupo);
    }
    return {
      colunas: [
        { key: "motivo", label: "Motivo" },
        { key: "unidade", label: "Unidade" },
        { key: "registros", label: "Registros", formato: "numero" },
        { key: "quantidade", label: "Quantidade perdida", formato: "numero" },
        { key: "valor", label: "Valor estimado", formato: "moeda" },
      ],
      linhas: [...grupos.values()].sort((a, b) => b.valor - a.valor),
      observacao:
        "As quantidades são agrupadas separadamente por unidade para não somar medidas incompatíveis.",
    };
  }

  if (id === "atrasos-causa") {
    const grupos = new Map<
      string,
      { causa: string; motivo: string; ocorrencias: number; atrasoHoras: number }
    >();
    for (const ocorrencia of ocorrencias) {
      const chave = `${ocorrencia.tipo}\u0000${ocorrencia.motivo}`;
      const grupo = grupos.get(chave) ?? {
        causa: ocorrencia.tipo,
        motivo: ocorrencia.motivo,
        ocorrencias: 0,
        atrasoHoras: 0,
      };
      grupo.ocorrencias += 1;
      grupo.atrasoHoras += numero(ocorrencia.atraso_minutos) / 60;
      grupos.set(chave, grupo);
    }
    return {
      colunas: [
        { key: "causa", label: "Causa" },
        { key: "motivo", label: "Motivo informado" },
        { key: "ocorrencias", label: "Ocorrências", formato: "numero" },
        { key: "atrasoHoras", label: "Atraso acumulado (h)", formato: "horas" },
      ],
      linhas: [...grupos.values()].sort((a, b) => b.atrasoHoras - a.atrasoHoras),
      observacao:
        "O período é aplicado à data prevista da ocorrência. Duração acumulada usa o atraso calculado pela view v_ocorrencias_atrasos; ocorrências canceladas são excluídas.",
    };
  }

  if (id === "paradas-equipamento") {
    const inicio = new Date(inicioIso(de)).getTime();
    const fim = new Date(proximoDiaIso(ate)).getTime();
    const grupos = new Map<
      string,
      { equipamento: string; motivo: string; paradas: number; horas: number }
    >();
    for (const parada of dashboard.paradas.data?.rows ?? []) {
      const inicioParada = new Date(parada.inicio_em).getTime();
      const fimParada = parada.fim_em ? new Date(parada.fim_em).getTime() : Date.now();
      const horas =
        Math.max(0, Math.min(fimParada, fim) - Math.max(inicioParada, inicio)) / 3_600_000;
      if (horas <= 0) continue;
      const equipamento = parada.equipamento_nome || "Equipamento sem nome";
      const chave = `${equipamento}\u0000${parada.motivo}`;
      const grupo = grupos.get(chave) ?? {
        equipamento,
        motivo: parada.motivo,
        paradas: 0,
        horas: 0,
      };
      grupo.paradas += 1;
      grupo.horas += horas;
      grupos.set(chave, grupo);
    }
    return {
      colunas: [
        { key: "equipamento", label: "Equipamento" },
        { key: "motivo", label: "Motivo" },
        { key: "paradas", label: "Número de paradas", formato: "numero" },
        { key: "horas", label: "Horas paradas no período", formato: "horas" },
      ],
      linhas: [...grupos.values()].sort((a, b) => b.horas - a.horas),
      observacao:
        "São incluídas as paradas cujo intervalo se sobrepõe ao período. A duração é recortada aos limites selecionados; paradas em andamento contam até agora.",
    };
  }

  const linhas = manutencoes
    .filter((item) => item.status === "concluida" && dentroDoPeriodo(item.data_conclusao, de, ate))
    .map((item) => ({
      equipamento: equipamentos.get(item.equipamento_id) ?? "Equipamento sem cadastro ativo",
      tipo: item.tipo,
      conclusao: item.data_conclusao,
      descricao: item.descricao,
      responsavel: item.responsavel_nome,
    }))
    .sort((a, b) => String(b.conclusao).localeCompare(String(a.conclusao)));
  return {
    colunas: [
      { key: "equipamento", label: "Equipamento" },
      { key: "tipo", label: "Tipo" },
      { key: "conclusao", label: "Data de conclusão", formato: "data" },
      { key: "descricao", label: "Descrição" },
      { key: "responsavel", label: "Responsável" },
    ],
    linhas,
  };
}

function valorTabela(valor: Linha[string] | undefined, formato?: FormatoColuna) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (formato === "data" && typeof valor === "string") {
    const data = new Date(valor);
    return Number.isNaN(data.getTime())
      ? valor
      : new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: valor.includes("T") ? "short" : undefined,
        }).format(data);
  }
  if (typeof valor === "number") {
    if (formato === "moeda") return formatarMoeda(valor);
    if (formato === "percentual") return `${formatarNumero(valor, 1)}%`;
    if (formato === "horas") return `${formatarNumero(valor, 2)} h`;
    return formatarNumero(valor);
  }
  return String(valor);
}

function RelatoriosPage() {
  const { perfis } = Route.useRouteContext();
  const elevado = perfis.some((perfil) => perfil === "administrador" || perfil === "gestor");
  const podeProducao = elevado || perfis.includes("producao");
  const podeVendas = elevado || perfis.includes("vendas");
  const podeEstoque = elevado || perfis.includes("estoque") || perfis.includes("vendas");
  const podePerdas = elevado || perfis.includes("producao");
  const podeOcorrencias =
    elevado ||
    perfis.some((perfil) => ["producao", "vendas", "estoque", "manutencao"].includes(perfil));
  const podeManutencao = elevado || perfis.includes("manutencao");
  const disponiveis = RELATORIOS.filter(({ id, perfis: perfisRelatorio }) => {
    if (elevado) return true;
    if (id.startsWith("producao") || id === "perdas-motivo") return podeProducao;
    if (id.startsWith("vendas")) return podeVendas;
    if (id.startsWith("estoque")) return podeEstoque;
    if (id === "atrasos-causa") return podeOcorrencias;
    if (id === "paradas-equipamento" || id === "manutencoes") return podeManutencao;
    return perfisRelatorio.some((perfil) => perfis.includes(perfil));
  });
  const [relatorioEscolhido, setRelatorioEscolhido] = useState<RelatorioId>(
    disponiveis[0]?.id ?? "producao-periodo",
  );
  const relatorio =
    disponiveis.find((item) => item.id === relatorioEscolhido)?.id ?? disponiveis[0]?.id;
  const [periodoDe, setPeriodoDe] = useState(dataInicialPadrao);
  const [periodoAte, setPeriodoAte] = useState(() => dataLocal(new Date()));
  const periodoValido = !!periodoDe && !!periodoAte && periodoDe <= periodoAte;
  const dashboard = useDashboardData({
    podeProducao,
    podeVendas,
    podeEstoque,
    podePerdas,
    podeParadas: podeManutencao,
    periodoDe,
    periodoAte,
    incluirCatalogosInativos: true,
  });
  const atrasos = useQuery({
    queryKey: ["relatorios-atrasos-reais", periodoDe, periodoAte],
    enabled: podeOcorrencias && periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ocorrencias_atrasos")
        .select("id,tipo,motivo,data_prevista,atraso_minutos,status")
        .gte("data_prevista", inicioIso(periodoDe))
        .lt("data_prevista", proximoDiaIso(periodoAte))
        .neq("status", "cancelada")
        .order("data_prevista", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as unknown as OcorrenciaRelatorio[];
    },
    staleTime: 30_000,
    retry: false,
  });
  const manutencoesQuery = useQuery({
    queryKey: ["relatorios-manutencoes-realizadas", periodoDe, periodoAte],
    enabled: podeManutencao && periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencoes")
        .select(
          "id,equipamento_id,tipo,status,data_prevista,data_inicio,data_conclusao,descricao,responsavel_nome",
        )
        .eq("status", "concluida")
        .gte("data_conclusao", inicioIso(periodoDe))
        .lt("data_conclusao", proximoDiaIso(periodoAte))
        .order("data_conclusao", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as unknown as ManutencaoRelatorio[];
    },
    staleTime: 30_000,
    retry: false,
  });

  if (!relatorio) {
    return (
      <>
        <PageHeader
          title="Relatórios"
          description="Relatórios gerenciais com dados reais do Supabase."
        />
        <EmptyState
          title="Nenhum relatório disponível"
          description="Seu perfil não possui acesso aos módulos de relatório configurados."
        />
      </>
    );
  }

  const usaCatalogos =
    relatorio.startsWith("vendas") ||
    relatorio.startsWith("estoque") ||
    relatorio === "manutencoes";
  let carregando = false;
  let erro: unknown = null;
  if (relatorio === "producao-periodo") {
    carregando = dashboard.producao.isLoading;
    erro = dashboard.producao.error;
  } else if (relatorio.startsWith("vendas")) {
    carregando = dashboard.vendas.isLoading || (usaCatalogos && dashboard.catalogos.isLoading);
    erro = dashboard.vendas.error ?? (usaCatalogos ? dashboard.catalogos.error : null);
  } else if (relatorio.startsWith("estoque")) {
    carregando = dashboard.estoque.isLoading || dashboard.catalogos.isLoading;
    erro = dashboard.estoque.error ?? dashboard.catalogos.error;
  } else if (relatorio === "perdas-motivo") {
    carregando = dashboard.perdas.isLoading;
    erro = dashboard.perdas.error;
  } else if (relatorio === "atrasos-causa") {
    carregando = atrasos.isLoading;
    erro = atrasos.error;
  } else if (relatorio === "paradas-equipamento") {
    carregando = dashboard.paradas.isLoading;
    erro = dashboard.paradas.error;
  } else {
    carregando = manutencoesQuery.isLoading || dashboard.catalogos.isLoading;
    erro = manutencoesQuery.error ?? dashboard.catalogos.error;
  }

  const modelo = gerarModelo(
    relatorio,
    periodoDe,
    periodoAte,
    dashboard,
    atrasos.data ?? [],
    manutencoesQuery.data ?? [],
  );
  const catalogos = dashboard.catalogos.data;
  const catalogoNoLimite =
    (catalogos?.produtos.length ?? 0) >= 5000 ||
    (catalogos?.cores.length ?? 0) >= 5000 ||
    (catalogos?.embalagens.length ?? 0) >= 5000 ||
    (catalogos?.unidades.length ?? 0) >= 1000 ||
    (catalogos?.materiais.length ?? 0) >= 5000 ||
    (catalogos?.equipamentos.length ?? 0) >= 5000 ||
    (catalogos?.tanques.length ?? 0) >= 5000;
  const limiteAtingido = (() => {
    if (usaCatalogos && catalogoNoLimite) return true;
    if (relatorio === "producao-periodo") {
      return (
        (dashboard.producao.data?.lotes.length ?? 0) >= 5000 ||
        (dashboard.producao.data?.envases.length ?? 0) >= 5000
      );
    }
    if (relatorio.startsWith("vendas")) {
      return (
        (dashboard.vendas.data?.pedidos.length ?? 0) >= 5000 ||
        (dashboard.vendas.data?.itens.length ?? 0) >= 10000
      );
    }
    if (relatorio.startsWith("estoque")) return (dashboard.estoque.data?.length ?? 0) >= 10000;
    if (relatorio === "perdas-motivo") return (dashboard.perdas.data?.length ?? 0) >= 10000;
    if (relatorio === "atrasos-causa") return (atrasos.data?.length ?? 0) >= 10000;
    if (relatorio === "paradas-equipamento") {
      return (dashboard.paradas.data?.rows.length ?? 0) >= 10000;
    }
    return (manutencoesQuery.data?.length ?? 0) >= 10000;
  })();

  function exportarCsv() {
    const relatorioExportado = relatorio;
    if (!relatorioExportado) return;
    const geradoEm = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date());
    const metadados: string[][] = [
      ["Relatório", TITULOS[relatorioExportado]],
      ["Data de geração", geradoEm],
      ["Período inicial", periodoDe],
      ["Período final", periodoAte],
      ["Filtros aplicados", `Período de ${periodoDe} até ${periodoAte}`],
      ...(modelo.observacao ? [["Observação", modelo.observacao]] : []),
    ];
    const linhasCsv: CelulaCsv[][] = [
      ...metadados.map((linha) => linha.map((valor) => ({ valor, texto: true }))),
      [],
      modelo.colunas.map((coluna) => ({ valor: coluna.label, texto: true })),
      ...modelo.linhas.map((linha) =>
        modelo.colunas.map((coluna) => {
          const valor = linha[coluna.key];
          return {
            valor: valorTabela(valor, coluna.formato),
            texto: typeof valor === "string",
          };
        }),
      ),
    ];
    const conteudo = `\uFEFF${linhasCsv.map((linha) => linha.map((celula) => escaparCsv(celula.valor, celula.texto)).join(";")).join("\r\n")}`;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-${relatorioExportado}-${periodoDe}-${periodoAte}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Consulte e exporte relatórios com dados reais do Supabase."
      />
      <section className="space-y-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.5fr)_1fr_1fr_auto] lg:items-end">
          <label className="space-y-1.5 text-sm font-medium">
            Relatório
            <select
              className={CONTROL_CLASS}
              value={relatorio}
              onChange={(evento) => setRelatorioEscolhido(evento.target.value as RelatorioId)}
            >
              {disponiveis.map((item) => (
                <option key={item.id} value={item.id}>
                  {TITULOS[item.id]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Período inicial
            <input
              className={CONTROL_CLASS}
              type="date"
              value={periodoDe}
              max={periodoAte}
              onChange={(evento) => setPeriodoDe(evento.target.value)}
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Período final
            <input
              className={CONTROL_CLASS}
              type="date"
              value={periodoAte}
              min={periodoDe}
              max={dataLocal(new Date())}
              onChange={(evento) => setPeriodoAte(evento.target.value)}
            />
          </label>
          <Button
            onClick={exportarCsv}
            disabled={!periodoValido || carregando || !!erro || limiteAtingido}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{TITULOS[relatorio]}</span>
          <span>
            Período aplicado: {periodoDe} a {periodoAte}
          </span>
        </div>
        {!periodoValido && (
          <div
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            Informe um período válido: a data inicial deve ser anterior ou igual à data final.
          </div>
        )}
        {relatorio.startsWith("estoque") && (
          <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
            O estoque é um snapshot do saldo atual. Como o banco não mantém snapshots históricos, o
            período escolhido não altera o saldo; ele será registrado no cabeçalho do CSV.
          </p>
        )}
        {!carregando && !erro && periodoValido && limiteAtingido && (
          <div
            role="alert"
            className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-900 dark:text-amber-200"
          >
            Uma consulta atingiu o limite de linhas configurado. Os dados podem estar incompletos e
            a exportação foi desativada para evitar um CSV parcial. Reduza o período nos relatórios
            temporais; no estoque atual, será necessária paginação para exportar um volume maior.
          </div>
        )}
        {carregando && periodoValido && (
          <div
            className="flex items-center gap-2 py-10 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados do Supabase…
          </div>
        )}
        {!carregando && !!erro && periodoValido && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Não foi possível carregar este relatório.</strong>
              <p className="mt-1">{textoErro(erro)}</p>
            </div>
          </div>
        )}
        {!carregando && !erro && periodoValido && modelo.linhas.length === 0 && (
          <EmptyState
            title="Nenhum dado no período"
            description="Não foram encontrados registros para este relatório e os filtros selecionados."
          />
        )}
        {!carregando && !erro && periodoValido && modelo.linhas.length > 0 && (
          <>
            {modelo.observacao && (
              <p className="text-sm text-muted-foreground">{modelo.observacao}</p>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {modelo.colunas.map((coluna) => (
                      <th className="px-4 py-3 font-semibold" key={coluna.key}>
                        {coluna.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {modelo.linhas.map((linha, indice) => (
                    <tr className="hover:bg-muted/30" key={`${relatorio}-${indice}`}>
                      {modelo.colunas.map((coluna) => (
                        <td className="max-w-[360px] px-4 py-3 align-top" key={coluna.key}>
                          {valorTabela(linha[coluna.key], coluna.formato)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
