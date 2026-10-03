import { supabase } from "@/integrations/supabase/client";
import { fmtDataHora, fmtNum } from "@/lib/producao";

export type Envase = {
  id: string;
  lote_id: string;
  embalagem_id: string;
  quantidade_planejada: number;
  quantidade_aprovada: number;
  quantidade_rejeitada: number;
  inicio_envase: string | null;
  fim_envase: string | null;
  operador_id: string | null;
  observacoes: string | null;
  criado_em: string;
  lotes_producao: {
    numero_lote: string;
    produtos: { codigo: string; nome: string } | null;
  } | null;
  embalagens: { nome: string; volume_litros: number | null } | null;
  operador: { nome: string } | null;
};

export const SELECT_ENVASE =
  "*, lotes_producao!inner(numero_lote, produtos(codigo, nome)), embalagens(nome, volume_litros), operador:profiles!envases_operador_id_fkey(nome)";

/** Percentuais e tempos calculados do envase. */
export function calcEnvase(e: {
  quantidade_planejada: number;
  quantidade_aprovada: number;
  quantidade_rejeitada: number;
  inicio_envase: string | null;
  fim_envase: string | null;
}) {
  const plan = Number(e.quantidade_planejada) || 0;
  const aprov = Number(e.quantidade_aprovada) || 0;
  const rej = Number(e.quantidade_rejeitada) || 0;
  const base = aprov + rej > 0 ? aprov + rej : plan;
  const pctAproveitamento = base > 0 ? (aprov / base) * 100 : null;
  const pctRejeicao = base > 0 ? (rej / base) * 100 : null;
  let minutos: number | null = null;
  if (e.inicio_envase && e.fim_envase) {
    minutos = Math.max(0, (new Date(e.fim_envase).getTime() - new Date(e.inicio_envase).getTime()) / 60000);
  }
  const tempoMedioPorUnidade = minutos != null && aprov + rej > 0 ? minutos / (aprov + rej) : null;
  return { pctAproveitamento, pctRejeicao, minutos, tempoMedioPorUnidade };
}

export const fmtPct = (v: number | null) => (v == null ? "—" : `${fmtNum(Math.round(v * 10) / 10)}%`);
export const fmtMin = (v: number | null) => {
  if (v == null) return "—";
  if (v < 60) return `${Math.round(v)} min`;
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return m ? `${h}h ${m}min` : `${h}h`;
};

export function traduzirErroEnvase(msg: string) {
  if (msg.includes("check constraint")) return "Algum valor está inválido (negativo, fora de ordem ou acima do planejado).";
  if (msg.includes("row-level security") || msg.includes("permission")) return "Você não tem permissão para registrar envases.";
  if (msg.includes("does not exist") || msg.includes("schema cache"))
    return "A tabela de envases ainda não foi criada no banco de dados.";
  return msg;
}

/** Lotes que podem receber envase (aguardando envase ou em produção). */
export async function lotesParaEnvase() {
  const { data, error } = await supabase
    .from("lotes_producao")
    .select("id, numero_lote, status, produtos(codigo, nome)")
    .in("status", ["aguardando_envase", "em_producao"])
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    value: l.id,
    label: `${l.numero_lote} — ${l.produtos?.codigo ?? ""} ${l.produtos?.nome ?? ""}`.trim(),
  }));
}

export async function opcoesEnvase() {
  const [embalagens, operadores] = await Promise.all([
    supabase.from("embalagens").select("id, nome, volume_litros").eq("ativo", true).order("volume_litros"),
    supabase.from("profiles").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  return {
    embalagens: (embalagens.data ?? []).map((e: any) => ({
      value: e.id,
      label: e.volume_litros != null ? `${e.nome} (${fmtNum(e.volume_litros)} L)` : e.nome,
    })),
    operadores: (operadores.data ?? []).map((o: any) => ({ value: o.id, label: o.nome })),
  };
}

export { fmtDataHora };
