import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Boxes, ClipboardList, Factory, PackageCheck, Timer } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { SimpleBarChart, SimpleLineChart } from "@/components/shared/ChartCard";
import { DashboardChartFrame } from "@/components/dashboard/DashboardChartFrame";
import { Button } from "@/components/ui/button";
import { LABEL_STATUS, statusEstoque, type ItemEstoque, type StatusEstoque } from "@/lib/estoque";
import type { Perfil } from "@/lib/permissoes";
import {
  useDashboardData,
  type Filtros,
  type Produto,
  type Cor,
  type Embalagem,
  type Unidade,
  type Material,
  type Equipamento,
  type Tanque,
  type Lote,
  type Envase,
  type Pedido,
  type ItemPedido,
  type Saldo,
  type Perda,
  type Parada,
  type SeriePeriodo,
  type SerieSimples,
} from "@/lib/dashboard/useDashboardData";

export const Route = createFileRoute("/_painel/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Tintas Gestão" },
      {
        name: "description",
        content: "Indicadores reais de produção, vendas, estoque, perdas e paradas.",
      },
      { property: "og:title", content: "Dashboard — Tintas Gestão" },
      {
        property: "og:description",
        content: "Indicadores reais de produção, vendas, estoque, perdas e paradas.",
      },
    ],
  }),
  component: DashboardPage,
});

const SELECT_CLASS =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";
const STATUS_LOTE: { value: string; label: string }[] = [
  { value: "planejado", label: "Lote: Planejado" },
  { value: "em_preparacao", label: "Lote: Em preparação" },
  { value: "em_producao", label: "Lote: Em produção" },
  { value: "aguardando_envase", label: "Lote: Aguardando envase" },
  { value: "concluido", label: "Lote: Concluído" },
  { value: "parcialmente_concluido", label: "Lote: Parcialmente concluído" },
  { value: "atrasado", label: "Lote: Atrasado" },
  { value: "cancelado", label: "Lote: Cancelado" },
];
const STATUS_PEDIDO: { value: string; label: string }[] = [
  { value: "recebido", label: "Pedido: Recebido" },
  { value: "aguardando_estoque", label: "Pedido: Aguardando estoque" },
  { value: "em_producao", label: "Pedido: Em produção" },
  { value: "em_separacao", label: "Pedido: Em separação" },
  { value: "pronto", label: "Pedido: Pronto" },
  { value: "entregue", label: "Pedido: Entregue" },
  { value: "atrasado", label: "Pedido: Atrasado" },
  { value: "cancelado", label: "Pedido: Cancelado" },
];
const STATUS_ESTOQUE: { value: string; label: string }[] = (
  ["normal", "estoque_baixo", "estoque_critico", "excesso", "sem_estoque"] as StatusEstoque[]
).map((value) => ({ value, label: `Estoque: ${LABEL_STATUS[value]}` }));
const STATUS_PARADA = [
  { value: "aberta", label: "Parada: Aberta" },
  { value: "encerrada", label: "Parada: Encerrada" },
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
function fimExclusivoIso(dia: string) {
  const data = new Date(`${dia}T00:00:00`);
  data.setDate(data.getDate() + 1);
  return data.toISOString();
}
function fimInclusivoIso(dia: string) {
  return new Date(new Date(fimExclusivoIso(dia)).getTime() - 1).toISOString();
}
function numero(valor: unknown) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
function formatarNumero(valor: number, casas = 0) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(valor);
}
function formatarLitros(valor: number) {
  return `${formatarNumero(valor, 2)} L`;
}
function formatarMoeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(valor);
}
function dataDoCampo(valor: string | null | undefined) {
  if (!valor) return "";
  return valor.slice(0, 10);
}
function dentroDoPeriodo(valor: string | null | undefined, de: string, ate: string) {
  const data = dataDoCampo(valor);
  return !!data && data >= de && data <= ate;
}
function statusCompativel(filtro: string, grupo: string, valor: string) {
  if (filtro === "todos") return true;
  const [grupoFiltro, statusFiltro] = filtro.split(":", 2);
  return grupoFiltro !== grupo || statusFiltro === valor;
}
function erroMensagem(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Falha ao consultar o Supabase.";
}
function litrosPorUnidade(
  produto: Produto,
  unidades: Map<string, Unidade>,
  embalagens: Map<string, Embalagem>,
) {
  const sigla = (unidades.get(produto.unidade_medida_id ?? "")?.sigla ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  if (["l", "lt", "litro", "litros"].includes(sigla)) return 1;
  const embalagem = embalagens.get(produto.embalagem_id ?? "");
  const capacidade = numero(embalagem?.volume_litros ?? embalagem?.capacidade);
  return capacidade > 0 ? capacidade : null;
}
function rotuloPeriodo(chave: string, modo: "dia" | "semana" | "mes") {
  const data = new Date(`${chave}T12:00:00`);
  if (modo === "mes") {
    return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(data);
  }
  const curto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(data);
  return modo === "semana" ? `Sem. ${curto}` : curto;
}
function chavePeriodo(valor: string, modo: "dia" | "semana" | "mes") {
  const data = new Date(`${valor}T12:00:00`);
  if (modo === "mes") return `${valor.slice(0, 7)}-01`;
  if (modo === "semana") {
    const dia = (data.getDay() + 6) % 7;
    data.setDate(data.getDate() - dia);
    return dataLocal(data);
  }
  return valor;
}
function modoPeriodo(de: string, ate: string): "dia" | "semana" | "mes" {
  const dias = Math.ceil(
    (new Date(`${ate}T12:00:00`).getTime() - new Date(`${de}T12:00:00`).getTime()) / 86_400_000,
  );
  return dias <= 31 ? "dia" : dias <= 120 ? "semana" : "mes";
}
function somaPeriodo(
  registros: { data: string; valor: number; serie: "producao" | "vendas" }[],
  de: string,
  ate: string,
): SeriePeriodo[] {
  const modo = modoPeriodo(de, ate);
  const grupos = new Map<string, SeriePeriodo>();
  for (const item of registros) {
    if (!dentroDoPeriodo(item.data, de, ate)) continue;
    const chave = chavePeriodo(dataDoCampo(item.data), modo);
    const grupo = grupos.get(chave) ?? {
      periodo: rotuloPeriodo(chave, modo),
      producao: 0,
      vendas: 0,
    };
    grupo[item.serie] += item.valor;
    grupos.set(chave, grupo);
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
}
function somarPor<T>(items: T[], chave: (item: T) => string, valor: (item: T) => number) {
  const grupos = new Map<string, number>();
  for (const item of items) {
    const nome = chave(item) || "Sem classificação";
    grupos.set(nome, (grupos.get(nome) ?? 0) + valor(item));
  }
  return [...grupos.entries()]
    .map(([nome, total]) => ({ nome, valor: total }))
    .sort((a, b) => b.valor - a.valor);
}

function DashboardPage() {
  const { perfis } = Route.useRouteContext() as { perfis: Perfil[] };
  const elevados = perfis.some((perfil) => ["administrador", "gestor"].includes(perfil));
  const podeProducao = elevados || perfis.includes("producao");
  const podeVendas = elevados || perfis.includes("vendas");
  const podeEstoque = elevados || perfis.includes("estoque") || perfis.includes("vendas");
  const podePerdas = elevados || perfis.includes("producao");
  const podeParadas = elevados || perfis.includes("manutencao");
  const podeFiltrosCatalogo =
    podeProducao || podeVendas || podeEstoque || podePerdas || podeParadas;
  const [periodoDe, setPeriodoDe] = useState(dataInicialPadrao);
  const [periodoAte, setPeriodoAte] = useState(() => dataLocal(new Date()));
  const [filtros, setFiltros] = useState<Filtros>({
    produto: "todos",
    cor: "todas",
    embalagem: "todas",
    status: "todos",
    equipamento: "todos",
  });

  const { catalogos, producao, vendas, estoque, perdas, paradas } = useDashboardData({
    podeProducao,
    podeVendas,
    podeEstoque,
    podePerdas,
    podeParadas,
    periodoDe,
    periodoAte,
  });
  const periodoValido = !!periodoDe && !!periodoAte && periodoDe <= periodoAte;
  const catalogo = catalogos.data;
  const produtos = catalogo?.produtos ?? [];
  const cores = catalogo?.cores ?? [];
  const embalagens = catalogo?.embalagens ?? [];
  const unidades = catalogo?.unidades ?? [];
  const materiais = catalogo?.materiais ?? [];
  const equipamentos = catalogo?.equipamentos ?? [];
  const tanques = catalogo?.tanques ?? [];
  const produtoPorId = new Map(produtos.map((item) => [item.id, item]));
  const corPorId = new Map(cores.map((item) => [item.id, item]));
  const embalagemPorId = new Map(embalagens.map((item) => [item.id, item]));
  const unidadePorId = new Map(unidades.map((item) => [item.id, item]));
  const materialPorId = new Map(materiais.map((item) => [item.id, item]));
  const tanquePorId = new Map(tanques.map((item) => [item.id, item]));
  const temFiltroDimensao =
    filtros.produto !== "todos" || filtros.cor !== "todas" || filtros.embalagem !== "todas";
  const correspondeProduto = (
    produtoId: string | null | undefined,
    embalagemReal?: string | null,
  ) => {
    if (!temFiltroDimensao) return true;
    if (!produtoId) return false;
    const produto = produtoPorId.get(produtoId);
    if (!produto) return false;
    return (
      (filtros.produto === "todos" || produto.id === filtros.produto) &&
      (filtros.cor === "todas" || produto.cor_id === filtros.cor) &&
      (filtros.embalagem === "todas" ||
        (embalagemReal ?? produto.embalagem_id) === filtros.embalagem)
    );
  };
  const lotePorId = new Map(
    [...(producao.data?.lotes ?? []), ...(paradas.data?.lotesRelacionados ?? [])].map((item) => [
      item.id,
      item,
    ]),
  );
  const itensPedido = [
    ...new Map(
      [...(vendas.data?.itens ?? []), ...(paradas.data?.itensRelacionados ?? [])].map((item) => [
        item.id,
        item,
      ]),
    ).values(),
  ];
  const itensPorPedido = new Map<string, ItemPedido[]>();
  for (const item of itensPedido) {
    const atuais = itensPorPedido.get(item.pedido_id) ?? [];
    atuais.push(item);
    itensPorPedido.set(item.pedido_id, atuais);
  }
  const producaoFiltrada = (producao.data?.lotes ?? []).filter((lote) => {
    const data = lote.fim_producao ?? lote.inicio_producao;
    const statusOk = statusCompativel(filtros.status, "lote", lote.status);
    const equipamentoOk =
      filtros.equipamento === "todos" ||
      tanquePorId.get(lote.tanque_id ?? "")?.equipamento_id === filtros.equipamento;
    return (
      periodoValido &&
      dentroDoPeriodo(data, periodoDe, periodoAte) &&
      correspondeProduto(lote.produto_id) &&
      statusOk &&
      equipamentoOk
    );
  });
  const unidadesProduzidas = (producao.data?.envases ?? [])
    .filter((envase) => {
      const lote = lotePorId.get(envase.lote_id);
      const data = envase.fim_envase ?? envase.inicio_envase;
      const equipamentoOk =
        filtros.equipamento === "todos" ||
        tanquePorId.get(lote?.tanque_id ?? "")?.equipamento_id === filtros.equipamento;
      return (
        !!lote &&
        dentroDoPeriodo(data, periodoDe, periodoAte) &&
        correspondeProduto(lote.produto_id, envase.embalagem_id) &&
        statusCompativel(filtros.status, "lote", lote.status) &&
        equipamentoOk
      );
    })
    .reduce((total, envase) => total + numero(envase.quantidade_aprovada), 0);
  const litrosProduzidos = producaoFiltrada.reduce(
    (total, lote) => total + Math.max(0, numero(lote.volume_produzido_litros)),
    0,
  );

  const pedidos = vendas.data?.pedidos ?? [];
  const itensVendasPeriodo = itensPedido.filter((item) => {
    const pedido = pedidos.find((row) => row.id === item.pedido_id);
    return (
      !!pedido &&
      !!pedido.data_entrega &&
      dentroDoPeriodo(pedido.data_entrega, periodoDe, periodoAte) &&
      statusCompativel(filtros.status, "pedido", pedido.status) &&
      correspondeProduto(item.produto_id) &&
      numero(item.quantidade_entregue) > 0
    );
  });
  const unidadesVendidas = itensVendasPeriodo.reduce(
    (total, item) => total + numero(item.quantidade_entregue),
    0,
  );
  let vendasLitrosNaoConvertidas = 0;
  const litrosVendidos = itensVendasPeriodo.reduce((total, item) => {
    const produto = produtoPorId.get(item.produto_id);
    if (!produto) {
      vendasLitrosNaoConvertidas += 1;
      return total;
    }
    const fator = litrosPorUnidade(produto, unidadePorId, embalagemPorId);
    if (fator === null) {
      vendasLitrosNaoConvertidas += 1;
      return total;
    }
    return total + numero(item.quantidade_entregue) * fator;
  }, 0);
  const pedidosAtrasados = pedidos.filter((pedido) => {
    const emAtraso =
      !!pedido.prazo_prometido &&
      pedido.prazo_prometido < dataLocal(new Date()) &&
      !["entregue", "cancelado"].includes(pedido.status);
    const produtosDoPedido = itensPorPedido.get(pedido.id) ?? [];
    const produtoOk =
      !temFiltroDimensao || produtosDoPedido.some((item) => correspondeProduto(item.produto_id));
    return (
      emAtraso &&
      dentroDoPeriodo(pedido.prazo_prometido, periodoDe, periodoAte) &&
      statusCompativel(filtros.status, "pedido", pedido.status) &&
      produtoOk
    );
  });

  const estoqueFiltrado = (estoque.data ?? []).filter((saldo) => {
    const min =
      saldo.tipo_item === "produto"
        ? numero(produtoPorId.get(saldo.item_id)?.estoque_minimo)
        : saldo.tipo_item === "material"
          ? numero(materialPorId.get(saldo.item_id)?.estoque_minimo)
          : numero(embalagemPorId.get(saldo.item_id)?.estoque_minimo);
    const max =
      saldo.tipo_item === "produto"
        ? numero(produtoPorId.get(saldo.item_id)?.estoque_maximo)
        : saldo.tipo_item === "material"
          ? numero(materialPorId.get(saldo.item_id)?.estoque_maximo)
          : numero(embalagemPorId.get(saldo.item_id)?.estoque_maximo);
    const produtoOk =
      saldo.tipo_item === "produto"
        ? correspondeProduto(saldo.produto_id)
        : saldo.tipo_item === "embalagem"
          ? filtros.produto === "todos" &&
            filtros.cor === "todas" &&
            (filtros.embalagem === "todas" || saldo.embalagem_id === filtros.embalagem)
          : !temFiltroDimensao;
    const item: ItemEstoque = {
      id: saldo.item_id,
      nome: saldo.item_id,
      tipo: saldo.tipo_item,
      unidade: "",
      saldo: numero(saldo.saldo),
      estoqueMinimo: min,
      estoqueMaximo: max,
      consumo28Dias: 0,
      totalMovimentacoes: 0,
    };
    const status = statusEstoque(item);
    const statusOk = statusCompativel(filtros.status, "estoque", status);
    return produtoOk && statusOk;
  });
  const itensEstoqueAlerta = estoqueFiltrado.filter((saldo) => {
    const min =
      saldo.tipo_item === "produto"
        ? numero(produtoPorId.get(saldo.item_id)?.estoque_minimo)
        : saldo.tipo_item === "material"
          ? numero(materialPorId.get(saldo.item_id)?.estoque_minimo)
          : numero(embalagemPorId.get(saldo.item_id)?.estoque_minimo);
    const max =
      saldo.tipo_item === "produto"
        ? numero(produtoPorId.get(saldo.item_id)?.estoque_maximo)
        : saldo.tipo_item === "material"
          ? numero(materialPorId.get(saldo.item_id)?.estoque_maximo)
          : numero(embalagemPorId.get(saldo.item_id)?.estoque_maximo);
    const item: ItemEstoque = {
      id: saldo.item_id,
      nome: saldo.item_id,
      tipo: saldo.tipo_item,
      unidade: "",
      saldo: numero(saldo.saldo),
      estoqueMinimo: min,
      estoqueMaximo: max,
      consumo28Dias: 0,
      totalMovimentacoes: 0,
    };
    return ["estoque_baixo", "estoque_critico", "sem_estoque"].includes(statusEstoque(item));
  });
  const quantidadeEstoqueAvaliavel = estoqueFiltrado.length;
  const estoquePorCategoria: SerieSimples[] = [
    {
      nome: "Matéria-prima",
      valor: estoqueFiltrado.filter(
        (item) => item.tipo_item === "material" && numero(item.saldo) > 0,
      ).length,
      secundario: estoqueFiltrado.filter(
        (item) =>
          item.tipo_item === "material" &&
          itensEstoqueAlerta.some((alerta) => alerta.item_id === item.item_id),
      ).length,
    },
    {
      nome: "Embalagem vazia",
      valor: estoqueFiltrado.filter(
        (item) => item.tipo_item === "embalagem" && numero(item.saldo) > 0,
      ).length,
      secundario: estoqueFiltrado.filter(
        (item) =>
          item.tipo_item === "embalagem" &&
          itensEstoqueAlerta.some((alerta) => alerta.item_id === item.item_id),
      ).length,
    },
    {
      nome: "Produto acabado",
      valor: estoqueFiltrado.filter(
        (item) => item.tipo_item === "produto" && numero(item.saldo) > 0,
      ).length,
      secundario: estoqueFiltrado.filter(
        (item) =>
          item.tipo_item === "produto" &&
          itensEstoqueAlerta.some((alerta) => alerta.item_id === item.item_id),
      ).length,
    },
  ];

  const perdasPeriodo = (perdas.data ?? []).filter((perda) => {
    const produtoId = perda.produto_id;
    const produto = produtoId ? produtoPorId.get(produtoId) : undefined;
    const embalagemId =
      perda.embalagem_id ?? perda.embalagem_referencia_id ?? produto?.embalagem_id;
    const corId = perda.cor_id ?? produto?.cor_id;
    return (
      dentroDoPeriodo(perda.data, periodoDe, periodoAte) &&
      (filtros.produto === "todos" || produtoId === filtros.produto) &&
      (filtros.cor === "todas" || corId === filtros.cor) &&
      (filtros.embalagem === "todas" || embalagemId === filtros.embalagem)
    );
  });
  const valorPerdas = perdasPeriodo.reduce(
    (total, perda) => total + numero(perda.valor_estimado),
    0,
  );
  const perdasPorMotivo = somarPor(
    perdasPeriodo,
    (perda) => perda.motivo,
    () => 1,
  );

  const paradasPeriodo = (paradas.data?.rows ?? []).filter((parada) => {
    const status = parada.fim_em ? "encerrada" : "aberta";
    const lote = parada.lote_id ? lotePorId.get(parada.lote_id) : undefined;
    const produtosDaParada = [
      ...(lote ? [lote.produto_id] : []),
      ...((parada.pedido_id ? itensPorPedido.get(parada.pedido_id) : []) ?? []).map(
        (item) => item.produto_id,
      ),
    ];
    const produtoOk = !temFiltroDimensao || produtosDaParada.some((id) => correspondeProduto(id));
    return (
      periodoValido &&
      (filtros.equipamento === "todos" || parada.equipamento_id === filtros.equipamento) &&
      statusCompativel(filtros.status, "parada", status) &&
      produtoOk
    );
  });
  const inicioPeriodoMs = periodoValido ? new Date(inicioIso(periodoDe)).getTime() : 0;
  const fimPeriodoMs = periodoValido ? new Date(fimExclusivoIso(periodoAte)).getTime() : 0;
  const agoraMs = Date.now();
  const minutosSobrepostos = (parada: Parada) => {
    const inicio = new Date(parada.inicio_em).getTime();
    const fim = parada.fim_em ? new Date(parada.fim_em).getTime() : agoraMs;
    const a = Math.max(inicio, inicioPeriodoMs);
    const b = Math.min(fim, fimPeriodoMs, agoraMs);
    return Math.max(0, b - a) / 60_000;
  };
  const horasParadas = paradasPeriodo.reduce(
    (total, parada) => total + minutosSobrepostos(parada) / 60,
    0,
  );
  const paradasPorEquipamento = somarPor(
    paradasPeriodo,
    (parada) => parada.equipamento_nome || "Equipamento sem nome",
    (parada) => minutosSobrepostos(parada) / 60,
  );

  const periodRecords: { data: string; valor: number; serie: "producao" | "vendas" }[] = [];
  for (const lote of producaoFiltrada) {
    const data = lote.fim_producao ?? lote.inicio_producao;
    const valor = Math.max(0, numero(lote.volume_produzido_litros));
    if (data && valor > 0) periodRecords.push({ data, valor, serie: "producao" });
  }
  for (const item of itensVendasPeriodo) {
    const pedido = pedidos.find((row) => row.id === item.pedido_id);
    const produto = produtoPorId.get(item.produto_id);
    if (!pedido?.data_entrega || !produto) continue;
    const fator = litrosPorUnidade(produto, unidadePorId, embalagemPorId);
    const volume = fator === null ? 0 : numero(item.quantidade_entregue) * fator;
    if (volume > 0)
      periodRecords.push({ data: pedido.data_entrega, valor: volume, serie: "vendas" });
  }
  const producaoVendasPorPeriodo = periodoValido
    ? somaPeriodo(periodRecords, periodoDe, periodoAte)
    : [];

  const vendasPorEmbalagem = somarPor(
    itensVendasPeriodo,
    (item) => {
      const produto = produtoPorId.get(item.produto_id);
      const embalagem = produto?.embalagem_id
        ? embalagemPorId.get(produto.embalagem_id)
        : undefined;
      if (!embalagem) return "Sem embalagem vinculada";
      const volume = numero(embalagem.volume_litros ?? embalagem.capacidade);
      return volume > 0 ? `${embalagem.nome} (${formatarNumero(volume, 2)} L)` : embalagem.nome;
    },
    (item) => numero(item.quantidade_entregue),
  );
  const vendasPorCor = somarPor(
    itensVendasPeriodo,
    (item) => {
      const produto = produtoPorId.get(item.produto_id);
      return (produto?.cor_id ? corPorId.get(produto.cor_id)?.nome : null) ?? "Sem cor definida";
    },
    (item) => numero(item.quantidade_entregue),
  );

  const statusOptions = [
    ...(podeProducao ? STATUS_LOTE.map((item) => ({ ...item, value: `lote:${item.value}` })) : []),
    ...(podeVendas
      ? STATUS_PEDIDO.map((item) => ({ ...item, value: `pedido:${item.value}` }))
      : []),
    ...(podeEstoque
      ? STATUS_ESTOQUE.map((item) => ({ ...item, value: `estoque:${item.value}` }))
      : []),
    ...(podeParadas
      ? STATUS_PARADA.map((item) => ({ ...item, value: `parada:${item.value}` }))
      : []),
  ];
  const carregandoProducao = producao.isLoading || catalogos.isLoading;
  const erroProducao = producao.error ?? catalogos.error;
  const carregandoVendas = vendas.isLoading || catalogos.isLoading;
  const erroVendas = vendas.error ?? catalogos.error;
  const carregandoEstoque = estoque.isLoading || catalogos.isLoading;
  const erroEstoque = estoque.error ?? catalogos.error;
  const carregandoPerdas = perdas.isLoading || catalogos.isLoading;
  const erroPerdas = perdas.error ?? catalogos.error;
  const carregandoParadas = paradas.isLoading || catalogos.isLoading;
  const erroParadas = paradas.error ?? catalogos.error;
  const filtroAtivo =
    periodoDe !== dataInicialPadrao() ||
    periodoAte !== dataLocal(new Date()) ||
    Object.values(filtros).some((valor) => !["todos", "todas"].includes(valor));
  const limparFiltros = () => {
    setPeriodoDe(dataInicialPadrao());
    setPeriodoAte(dataLocal(new Date()));
    setFiltros({
      produto: "todos",
      cor: "todas",
      embalagem: "todas",
      status: "todos",
      equipamento: "todos",
    });
  };

  const valorCard = (loading: boolean, error: unknown, valor: string) =>
    !periodoValido ? "—" : loading ? "…" : error ? "—" : valor;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Indicadores consultados diretamente no Supabase e limitados ao perfil de acesso."
      />

      <section
        className="space-y-3 rounded-lg border bg-card p-4"
        aria-label="Filtros globais do dashboard"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-semibold">Filtros globais</h2>
            <p className="text-xs text-muted-foreground">
              Cada filtro atua apenas sobre os dados que possuem essa dimensão; o estoque é uma
              fotografia do saldo atual.
            </p>
          </div>
          {filtroAtivo && (
            <Button type="button" variant="ghost" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Período inicial
            <input
              className={SELECT_CLASS}
              type="date"
              value={periodoDe}
              onChange={(event) => setPeriodoDe(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Período final
            <input
              className={SELECT_CLASS}
              type="date"
              value={periodoAte}
              onChange={(event) => setPeriodoAte(event.target.value)}
            />
          </label>
          {podeFiltrosCatalogo && (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Produto
              <select
                className={SELECT_CLASS}
                value={filtros.produto}
                onChange={(event) =>
                  setFiltros((atual) => ({ ...atual, produto: event.target.value }))
                }
              >
                <option value="todos">Todos os produtos</option>
                {produtos.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {podeFiltrosCatalogo && (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Cor
              <select
                className={SELECT_CLASS}
                value={filtros.cor}
                onChange={(event) => setFiltros((atual) => ({ ...atual, cor: event.target.value }))}
              >
                <option value="todas">Todas as cores</option>
                {cores.map((cor) => (
                  <option key={cor.id} value={cor.id}>
                    {cor.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          {podeFiltrosCatalogo && (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Embalagem
              <select
                className={SELECT_CLASS}
                value={filtros.embalagem}
                onChange={(event) =>
                  setFiltros((atual) => ({ ...atual, embalagem: event.target.value }))
                }
              >
                <option value="todas">Todas as embalagens</option>
                {embalagens.map((embalagem) => (
                  <option key={embalagem.id} value={embalagem.id}>
                    {embalagem.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            Status
            <select
              className={SELECT_CLASS}
              value={filtros.status}
              onChange={(event) =>
                setFiltros((atual) => ({ ...atual, status: event.target.value }))
              }
            >
              <option value="todos">Todos os status</option>
              {statusOptions.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          {(podeProducao || podeParadas) && (
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              Equipamento
              <select
                className={SELECT_CLASS}
                value={filtros.equipamento}
                onChange={(event) =>
                  setFiltros((atual) => ({ ...atual, equipamento: event.target.value }))
                }
              >
                <option value="todos">Todos os equipamentos</option>
                {equipamentos.map((equipamento) => (
                  <option key={equipamento.id} value={equipamento.id}>
                    {equipamento.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {!periodoValido && (
          <p className="text-sm text-destructive" role="alert">
            A data inicial deve ser anterior ou igual à data final.
          </p>
        )}
        {catalogos.isError && (
          <p className="text-sm text-destructive" role="alert">
            Não foi possível carregar os filtros de catálogo: {erroMensagem(catalogos.error)}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {podeProducao && (
          <>
            <StatCard
              label="Produção em unidades"
              value={valorCard(
                carregandoProducao,
                erroProducao,
                formatarNumero(unidadesProduzidas),
              )}
              hint="Unidades aprovadas no envase"
              icon={Factory}
              tone="success"
            />
            <StatCard
              label="Produção em litros"
              value={valorCard(carregandoProducao, erroProducao, formatarLitros(litrosProduzidos))}
              hint="Volume produzido registrado nos lotes"
              icon={Factory}
            />
          </>
        )}
        {podeVendas && (
          <>
            <StatCard
              label="Vendas em unidades"
              value={valorCard(carregandoVendas, erroVendas, formatarNumero(unidadesVendidas))}
              hint="Quantidade efetivamente entregue"
              icon={PackageCheck}
              tone="success"
            />
            <StatCard
              label="Vendas em litros"
              value={valorCard(carregandoVendas, erroVendas, formatarLitros(litrosVendidos))}
              hint={
                vendasLitrosNaoConvertidas
                  ? `${vendasLitrosNaoConvertidas} linha(s) sem conversão de volume`
                  : "Convertidas pela embalagem ou unidade em litros"
              }
              icon={PackageCheck}
            />
            <StatCard
              label="Pedidos atrasados"
              value={valorCard(
                carregandoVendas,
                erroVendas,
                formatarNumero(pedidosAtrasados.length),
              )}
              hint="Prazo vencido, ainda não entregue ou cancelado"
              icon={ClipboardList}
              tone={pedidosAtrasados.length ? "warning" : "default"}
            />
          </>
        )}
        {podeEstoque && (
          <StatCard
            label="Estoque baixo"
            value={
              !estoque.isLoading && !estoque.error && !catalogos.error
                ? formatarNumero(itensEstoqueAlerta.length)
                : estoque.isLoading || catalogos.isLoading
                  ? "…"
                  : "—"
            }
            hint={`${quantidadeEstoqueAvaliavel} itens avaliados; inclui sem estoque`}
            icon={Boxes}
            tone={itensEstoqueAlerta.length ? "warning" : "success"}
          />
        )}
        {podePerdas && (
          <StatCard
            label="Perdas do período"
            value={valorCard(carregandoPerdas, erroPerdas, formatarMoeda(valorPerdas))}
            hint={`${perdasPeriodo.length} registro(s); valor estimado informado`}
            icon={AlertTriangle}
            tone={perdasPeriodo.length ? "warning" : "default"}
          />
        )}
        {podeParadas && (
          <StatCard
            label="Horas de máquina parada"
            value={valorCard(
              carregandoParadas,
              erroParadas,
              `${formatarNumero(horasParadas, 1)} h`,
            )}
            hint={`${paradasPeriodo.length} parada(s) com interseção no período`}
            icon={Timer}
            tone={horasParadas ? "warning" : "default"}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {podeProducao && podeVendas && (
          <DashboardChartFrame
            title="Produção versus vendas por período"
            subtitle="Litros produzidos e litros entregues; agrupamento diário, semanal ou mensal conforme o intervalo."
            loading={carregandoProducao || carregandoVendas}
            error={erroProducao ?? erroVendas}
            hasData={producaoVendasPorPeriodo.length > 0}
          >
            <SimpleLineChart
              data={producaoVendasPorPeriodo}
              xKey="periodo"
              series={[
                { key: "producao", label: "Produção (L)", color: "var(--chart-1)" },
                { key: "vendas", label: "Vendas entregues (L)", color: "var(--chart-2)" },
              ]}
            />
          </DashboardChartFrame>
        )}
        {podeVendas && (
          <DashboardChartFrame
            title="Vendas por tamanho de embalagem"
            subtitle="Unidades entregues agrupadas pela embalagem padrão do produto."
            loading={carregandoVendas}
            error={erroVendas ?? erroVendas}
            hasData={vendasPorEmbalagem.length > 0}
          >
            <SimpleBarChart
              data={vendasPorEmbalagem}
              xKey="nome"
              series={[{ key: "valor", label: "Unidades entregues", color: "var(--chart-1)" }]}
            />
          </DashboardChartFrame>
        )}
        {podeVendas && (
          <DashboardChartFrame
            title="Vendas por cor"
            subtitle="Unidades entregues; produtos sem cor permanecem identificados."
            loading={carregandoVendas}
            error={erroVendas}
            hasData={vendasPorCor.length > 0}
          >
            <SimpleBarChart
              data={vendasPorCor}
              xKey="nome"
              series={[{ key: "valor", label: "Unidades entregues", color: "var(--chart-3)" }]}
            />
          </DashboardChartFrame>
        )}
        {podeEstoque && (
          <DashboardChartFrame
            title="Estoque por categoria"
            subtitle="Contagem de itens com saldo positivo e, na segunda série, itens em alerta; não soma unidades incompatíveis."
            loading={carregandoEstoque}
            error={erroEstoque}
            hasData={estoqueFiltrado.length > 0}
          >
            <SimpleBarChart
              data={estoquePorCategoria}
              xKey="nome"
              series={[
                { key: "valor", label: "Itens com saldo", color: "var(--chart-1)" },
                {
                  key: "secundario",
                  label: "Abaixo do mínimo ou sem estoque",
                  color: "var(--chart-4)",
                },
              ]}
            />
          </DashboardChartFrame>
        )}
        {podePerdas && (
          <DashboardChartFrame
            title="Perdas por motivo"
            subtitle="Quantidade de registros por motivo; o card apresenta o valor estimado em reais."
            loading={carregandoPerdas}
            error={erroPerdas}
            hasData={perdasPorMotivo.length > 0}
          >
            <SimpleBarChart
              data={perdasPorMotivo}
              xKey="nome"
              series={[{ key: "valor", label: "Registros", color: "var(--chart-2)" }]}
            />
          </DashboardChartFrame>
        )}
        {podeParadas && (
          <DashboardChartFrame
            title="Paradas por equipamento"
            subtitle="Horas de parada dentro do intervalo; paradas abertas são contadas até agora."
            loading={carregandoParadas || catalogos.isLoading}
            error={erroParadas ?? catalogos.error}
            hasData={paradasPorEquipamento.length > 0}
          >
            <SimpleBarChart
              data={paradasPorEquipamento}
              xKey="nome"
              series={[{ key: "valor", label: "Horas paradas", color: "var(--chart-4)" }]}
            />
          </DashboardChartFrame>
        )}
      </div>

      {podeVendas && vendas.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Não foi possível consultar pedidos e vendas.
          </p>
          <p className="mt-1 text-muted-foreground">{erroMensagem(vendas.error)}</p>
        </div>
      )}
      {podeProducao && producao.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Não foi possível consultar produção e envase.
          </p>
          <p className="mt-1 text-muted-foreground">{erroMensagem(producao.error)}</p>
        </div>
      )}
      {podeEstoque && estoque.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Não foi possível consultar o saldo do estoque.
          </p>
          <p className="mt-1 text-muted-foreground">{erroMensagem(estoque.error)}</p>
        </div>
      )}
      {podePerdas && perdas.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">Não foi possível consultar as perdas.</p>
          <p className="mt-1 text-muted-foreground">{erroMensagem(perdas.error)}</p>
        </div>
      )}
      {podeParadas && paradas.isError && (
        <div
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold text-destructive">Não foi possível consultar as paradas.</p>
          <p className="mt-1 text-muted-foreground">{erroMensagem(paradas.error)}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Produção usa volume real registrado nos lotes e unidades aprovadas nos envases; vendas usam
        quantidades entregues. A conversão para litros exige volume cadastrado na embalagem ou
        unidade em litros. Os totais de estoque são saldos atuais calculados pela view do Supabase;
        perda em reais é valor estimado informado; paradas contam apenas o tempo sobreposto ao
        período. Filtros de status e equipamento só afetam registros que possuem esses vínculos.
      </p>
    </div>
  );
}
