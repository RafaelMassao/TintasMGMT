import { supabase } from "@/integrations/supabase/client";
import type { StatusTone } from "@/components/shared/StatusBadge";
import type { Perfil } from "@/lib/permissoes";

export const STATUS_LOTE = [
  "planejado",
  "em_preparacao",
  "em_producao",
  "aguardando_envase",
  "concluido",
  "parcialmente_concluido",
  "atrasado",
  "cancelado",
] as const;
export type StatusLote = (typeof STATUS_LOTE)[number];

export const STATUS_INFO: Record<StatusLote, { label: string; tone: StatusTone }> = {
  planejado: { label: "Planejado", tone: "neutral" },
  em_preparacao: { label: "Em preparação", tone: "info" },
  em_producao: { label: "Em produção", tone: "info" },
  aguardando_envase: { label: "Aguardando envase", tone: "warning" },
  concluido: { label: "Concluído", tone: "success" },
  parcialmente_concluido: { label: "Parcialmente concluído", tone: "success" },
  atrasado: { label: "Atrasado", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

export const FINALIZADOS: StatusLote[] = ["concluido", "parcialmente_concluido", "cancelado"];

export const ehGestao = (p: Perfil[]) => p.includes("administrador") || p.includes("gestor");
export const podeOperarProducao = (p: Perfil[]) => ehGestao(p) || p.includes("producao");
/** Produção edita lotes abertos; lotes finalizados só a gestão altera. */
export const podeEditarLote = (p: Perfil[], status: StatusLote) =>
  ehGestao(p) || (p.includes("producao") && !FINALIZADOS.includes(status));

export type Lote = {
  id: string;
  numero_lote: string;
  produto_id: string;
  tanque_id: string | null;
  pedido_id: string | null;
  quantidade_planejada: number;
  quantidade_produzida: number;
  volume_planejado_litros: number;
  volume_produzido_litros: number;
  data_planejada: string | null;
  inicio_producao: string | null;
  fim_producao: string | null;
  status: StatusLote;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  produtos: {
    codigo: string;
    nome: string;
    cores: { nome: string } | null;
    embalagens: { nome: string; volume_litros: number | null } | null;
  } | null;
  tanques: { capacidade_litros: number; equipamentos: { codigo: string; nome: string } | null } | null;
};

export const SELECT_LOTE =
  "*, produtos!inner(codigo, nome, cor_id, cores(nome), embalagens(nome, volume_litros)), tanques(capacidade_litros, equipamentos(codigo, nome))";

const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
export const fmtNum = (v: number | null | undefined) => (v == null ? "—" : num.format(Number(v)));
export const fmtLitros = (v: number | null | undefined) => (v == null ? "—" : `${num.format(Number(v))} L`);
export const fmtData = (v: string | null) =>
  v ? new Date(v.length === 10 ? v + "T12:00:00" : v).toLocaleDateString("pt-BR") : "—";
export const fmtDataHora = (v: string | null) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
export const nomeTanque = (l: Pick<Lote, "tanques">) =>
  l.tanques?.equipamentos ? `${l.tanques.equipamentos.codigo} — ${l.tanques.equipamentos.nome}` : "—";

export function traduzirErroProducao(msg: string) {
  if (msg.includes("numero_lote") || msg.includes("duplicate key")) return "Já existe um lote com este número.";
  if (msg.includes("lotes_concluido_com_quantidade")) return "Informe a quantidade produzida antes de concluir.";
  if (msg.includes("check constraint")) return "Algum valor está inválido (negativo ou datas fora de ordem).";
  if (msg.includes("row-level security") || msg.includes("permission")) return "Você não tem permissão para esta ação.";
  if (msg.includes("does not exist") || msg.includes("schema cache"))
    return "As tabelas de produção ainda não foram criadas no banco de dados.";
  return msg;
}

export async function opcoesProducao() {
  const [produtos, tanques, cores] = await Promise.all([
    supabase.from("produtos").select("id, codigo, nome").eq("ativo", true).order("nome"),
    supabase.from("tanques").select("id, capacidade_litros, equipamentos(codigo, nome)").eq("ativo", true),
    supabase.from("cores").select("id, codigo, nome").eq("ativo", true).order("nome"),
  ]);
  return {
    produtos: (produtos.data ?? []).map((p: any) => ({ value: p.id, label: `${p.codigo} — ${p.nome}` })),
    tanques: (tanques.data ?? []).map((t: any) => ({
      value: t.id,
      label: `${t.equipamentos?.codigo ?? ""} — ${t.equipamentos?.nome ?? ""} (${fmtLitros(t.capacidade_litros)})`,
      capacidade: Number(t.capacidade_litros),
    })),
    cores: (cores.data ?? []).map((c: any) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` })),
  };
}
