import { supabase } from "@/integrations/supabase/client";
import type { StatusTone } from "@/components/shared/StatusBadge";
import type { Perfil } from "@/lib/permissoes";

export const STATUS_PEDIDO = [
  "recebido",
  "aguardando_estoque",
  "em_producao",
  "em_separacao",
  "pronto",
  "entregue",
  "atrasado",
  "cancelado",
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const STATUS_PEDIDO_INFO: Record<StatusPedido, { label: string; tone: StatusTone }> = {
  recebido: { label: "Recebido", tone: "neutral" },
  aguardando_estoque: { label: "Aguardando estoque", tone: "warning" },
  em_producao: { label: "Em produção", tone: "info" },
  em_separacao: { label: "Em separação", tone: "info" },
  pronto: { label: "Pronto", tone: "success" },
  entregue: { label: "Entregue", tone: "success" },
  atrasado: { label: "Atrasado", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

export const podeOperarPedidos = (p: Perfil[]) =>
  p.includes("administrador") || p.includes("gestor") || p.includes("vendas");

export type ItemPedido = {
  id: string;
  produto_id: string;
  quantidade_solicitada: number;
  quantidade_entregue: number;
  preco_unitario: number;
  valor_total: number;
  produtos: {
    codigo: string;
    nome: string;
    cores: { nome: string } | null;
    embalagens: { nome: string } | null;
  } | null;
};

export type Pedido = {
  id: string;
  numero: string;
  cliente_id: string;
  data_pedido: string;
  prazo_prometido: string | null;
  data_entrega: string | null;
  status: StatusPedido;
  valor_total: number;
  observacoes: string | null;
  criado_em: string;
  clientes: { nome: string; documento: string | null } | null;
  itens_pedido?: ItemPedido[];
};

export const SELECT_PEDIDO = "*, clientes!inner(nome, documento)";
export const SELECT_ITENS =
  "id, produto_id, quantidade_solicitada, quantidade_entregue, preco_unitario, valor_total, produtos(codigo, nome, cores(nome), embalagens(nome))";

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Atraso automático: prazo passou e o pedido não foi entregue nem cancelado. */
export function diasAtraso(p: Pick<Pedido, "prazo_prometido" | "status">) {
  if (!p.prazo_prometido || p.status === "entregue" || p.status === "cancelado") return 0;
  const hoje = new Date(hojeISO() + "T12:00:00").getTime();
  const prazo = new Date(p.prazo_prometido + "T12:00:00").getTime();
  return Math.max(0, Math.round((hoje - prazo) / 86400000));
}

/** Status mostrado na tela, já considerando o atraso automático. */
export function statusEfetivo(p: Pick<Pedido, "prazo_prometido" | "status">): StatusPedido {
  return diasAtraso(p) > 0 ? "atrasado" : p.status;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const fmtMoeda = (v: number | null | undefined) => moeda.format(Number(v ?? 0));

export function traduzirErroPedido(msg: string) {
  if (msg.includes("pedidos_numero_key") || msg.includes("duplicate key")) return "Já existe um pedido com este número.";
  if (msg.includes("pedidos_entregue_com_data")) return "Informe a data de entrega para marcar como entregue.";
  if (msg.includes("check constraint")) return "Algum valor está inválido (quantidade, preço ou datas fora de ordem).";
  if (msg.includes("row-level security") || msg.includes("permission")) return "Você não tem permissão para esta ação.";
  if (msg.includes("does not exist") || msg.includes("schema cache"))
    return "As tabelas de pedidos ainda não foram criadas no banco de dados.";
  return msg;
}

export type ProdutoOpcao = {
  id: string;
  label: string;
  cor: string;
  embalagem: string;
  disponivel: number;
  emEstoque: number;
};

export async function opcoesPedido() {
  const [clientes, produtos, estoque] = await Promise.all([
    supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("produtos").select("id, codigo, nome, cores(nome), embalagens(nome)").eq("ativo", true).order("nome"),
    supabase.from("estoque_disponivel").select("produto_id, em_estoque, disponivel"),
  ]);
  const est = new Map<string, { em_estoque: number; disponivel: number }>();
  (estoque.data ?? []).forEach((e: any) => est.set(e.produto_id, { em_estoque: Number(e.em_estoque), disponivel: Number(e.disponivel) }));
  return {
    estoqueOk: !estoque.error,
    clientes: (clientes.data ?? []).map((c: any) => ({ value: c.id as string, label: c.nome as string })),
    produtos: (produtos.data ?? []).map(
      (p: any): ProdutoOpcao => ({
        id: p.id,
        label: `${p.codigo} — ${p.nome}`,
        cor: p.cores?.nome ?? "—",
        embalagem: p.embalagens?.nome ?? "—",
        disponivel: est.get(p.id)?.disponivel ?? 0,
        emEstoque: est.get(p.id)?.em_estoque ?? 0,
      }),
    ),
  };
}
