export const STATUS_PEDIDO_COMPRA = [
  "rascunho",
  "enviado",
  "parcial",
  "recebido",
  "cancelado",
] as const;
export type StatusPedidoCompra = (typeof STATUS_PEDIDO_COMPRA)[number];

export const STATUS_PEDIDO_COMPRA_INFO: Record<
  StatusPedidoCompra,
  { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }
> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  enviado: { label: "Enviado", tone: "info" },
  parcial: { label: "Recebimento parcial", tone: "warning" },
  recebido: { label: "Recebido", tone: "success" },
  cancelado: { label: "Cancelado", tone: "danger" },
};

export type FornecedorOpcao = { id: string; nome: string; prazo_entrega_dias: number };
export type MaterialOpcao = {
  id: string;
  codigo: string;
  nome: string;
  unidade: string;
  estoque_minimo: number;
  fornecedor_padrao_id: string | null;
};
export type LinhaPedidoCompra = {
  id: string;
  material_id: string;
  quantidade_solicitada: number | string;
  preco_unitario: number | string;
  materiais: { codigo: string; nome: string; unidades_medida: { sigla: string } | null } | null;
  itens_recebimento_compra?: { quantidade_recebida: number | string; observacoes: string | null }[];
};
export type PedidoCompra = {
  id: string;
  numero: string;
  fornecedor_id: string;
  data_pedido: string;
  previsao_entrega: string | null;
  status: StatusPedidoCompra;
  observacoes: string | null;
  criado_em: string;
  fornecedores: { nome: string } | null;
  itens_pedido_compra: LinhaPedidoCompra[];
};
export type RecebimentoCompra = {
  id: string;
  numero: string;
  pedido_compra_id: string;
  data_recebimento: string;
  observacoes: string | null;
  criado_em: string;
  pedidos_compra: { numero: string; fornecedores: { nome: string } | null } | null;
  itens_recebimento_compra: {
    id: string;
    quantidade_recebida: number | string;
    observacoes: string | null;
    lotes_materiais: { numero_lote: string | null; validade: string | null } | null;
    itens_pedido_compra: { materiais: { nome: string } | null } | null;
  }[];
};
export type SugestaoCompra = {
  material: MaterialOpcao;
  saldo: number;
  minimo: number;
  consumo90Dias: number;
  consumoMedioDia: number;
  prazoEntregaDias: number;
  pontoReposicao: number;
  quantidadeSugerida: number;
  fornecedorNome: string;
};

export const numCompras = (v: number | string | null | undefined, max = 3) =>
  Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: max });

export const dataPtBr = (v: string | null | undefined) => {
  if (!v) return "—";
  const [ano, mes, dia] = v.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : v;
};

export function totalRecebido(item: LinhaPedidoCompra) {
  return (item.itens_recebimento_compra ?? []).reduce(
    (s, r) => s + Number(r.quantidade_recebida ?? 0),
    0,
  );
}

export function divergencia(item: LinhaPedidoCompra) {
  return totalRecebido(item) - Number(item.quantidade_solicitada);
}
