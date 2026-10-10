export type EstoqueTipo = "material" | "embalagem" | "produto";
export type StatusEstoque =
  "normal" | "estoque_baixo" | "estoque_critico" | "excesso" | "sem_estoque";

export type ItemEstoque = {
  id: string;
  nome: string;
  codigo?: string | null;
  tipo: EstoqueTipo;
  unidade: string;
  saldo: number;
  estoqueMinimo: number;
  estoqueMaximo: number;
  consumo28Dias: number;
  totalMovimentacoes: number;
};

export type TipoMovimentacao =
  | "entrada_compra"
  | "entrada_producao"
  | "saida_producao"
  | "saida_venda"
  | "saida_perda"
  | "ajuste_positivo"
  | "ajuste_negativo"
  | "transferencia";

export const TIPOS_MOVIMENTACAO: {
  value: TipoMovimentacao;
  label: string;
  direcao: "entrada" | "saida" | "neutra";
}[] = [
  { value: "entrada_compra", label: "Entrada por compra", direcao: "entrada" },
  { value: "entrada_producao", label: "Entrada da produção", direcao: "entrada" },
  { value: "saida_producao", label: "Saída para produção", direcao: "saida" },
  { value: "saida_venda", label: "Saída por venda", direcao: "saida" },
  { value: "saida_perda", label: "Saída por perda", direcao: "saida" },
  { value: "ajuste_positivo", label: "Ajuste positivo", direcao: "entrada" },
  { value: "ajuste_negativo", label: "Ajuste negativo", direcao: "saida" },
  { value: "transferencia", label: "Transferência", direcao: "neutra" },
];

export const LABEL_TIPO: Record<EstoqueTipo, string> = {
  material: "Matéria-prima",
  embalagem: "Embalagem vazia",
  produto: "Produto acabado",
};

export const LABEL_STATUS: Record<StatusEstoque, string> = {
  normal: "Normal",
  estoque_baixo: "Estoque baixo",
  estoque_critico: "Estoque crítico",
  excesso: "Excesso",
  sem_estoque: "Sem estoque",
};

export function statusEstoque(
  item: Pick<ItemEstoque, "saldo" | "estoqueMinimo" | "estoqueMaximo">,
): StatusEstoque {
  if (item.saldo <= 0) return "sem_estoque";
  if (item.estoqueMinimo > 0 && item.saldo < item.estoqueMinimo) {
    return item.saldo <= item.estoqueMinimo * 0.5 ? "estoque_critico" : "estoque_baixo";
  }
  if (item.estoqueMaximo > 0 && item.saldo > item.estoqueMaximo) return "excesso";
  return "normal";
}

export function coberturaSemanas(saldo: number, consumo28Dias: number): number | null {
  if (consumo28Dias <= 0) return null;
  return Math.max(0, saldo) / (consumo28Dias / 4);
}

export function aplicarSinalMovimentacao(tipo: TipoMovimentacao, quantidade: number): number {
  const definicao = TIPOS_MOVIMENTACAO.find((item) => item.value === tipo);
  if (definicao?.direcao === "entrada") return quantidade;
  if (definicao?.direcao === "saida") return -quantidade;
  return 0;
}

export function formatarQuantidade(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(valor);
}

export function formatarData(data: string | null | undefined): string {
  if (!data) return "—";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(d);
}
