// DADOS DEMONSTRATIVOS TEMPORÁRIOS — substituir por consultas ao Supabase.
import type { StatusTone } from "@/components/shared/StatusBadge";

export const mockUser = { name: "Rafael Massao", role: "Administrador" };

export const mockNotifications = [
  { id: "1", title: "Estoque baixo: Resina acrílica", time: "há 15 min" },
  { id: "2", title: "Manutenção agendada: Dispersor 02", time: "há 1 h" },
  { id: "3", title: "Pedido #1042 aguardando aprovação", time: "há 3 h" },
];

export const mockKpis = {
  producaoHoje: "12.480 L",
  ordensAbertas: "18",
  pedidosPendentes: "27",
  alertasEstoque: "5",
};

export const mockProducaoSemana = [
  { dia: "Seg", litros: 11200, meta: 12000 },
  { dia: "Ter", litros: 12600, meta: 12000 },
  { dia: "Qua", litros: 10900, meta: 12000 },
  { dia: "Qui", litros: 13100, meta: 12000 },
  { dia: "Sex", litros: 12480, meta: 12000 },
  { dia: "Sáb", litros: 6400, meta: 6000 },
];

export const mockPerdasMes = [
  { mes: "Abr", perdas: 2.4 },
  { mes: "Mai", perdas: 2.1 },
  { mes: "Jun", perdas: 2.8 },
  { mes: "Jul", perdas: 1.9 },
  { mes: "Ago", perdas: 1.7 },
  { mes: "Set", perdas: 1.5 },
];

export type OrdemProducao = {
  id: string;
  produto: string;
  lote: string;
  volume: string;
  status: { label: string; tone: StatusTone };
};

export const mockOrdens: OrdemProducao[] = [
  { id: "OP-2231", produto: "Látex PVA Branco Neve", lote: "L-0925-01", volume: "3.600 L", status: { label: "Em produção", tone: "info" } },
  { id: "OP-2230", produto: "Esmalte Sintético Azul", lote: "L-0924-04", volume: "1.200 L", status: { label: "Controle de qualidade", tone: "warning" } },
  { id: "OP-2229", produto: "Acrílico Fosco Cinza", lote: "L-0924-03", volume: "2.400 L", status: { label: "Concluída", tone: "success" } },
  { id: "OP-2228", produto: "Primer Epóxi", lote: "L-0924-02", volume: "800 L", status: { label: "Parada", tone: "danger" } },
  { id: "OP-2227", produto: "Textura Acrílica", lote: "L-0923-05", volume: "1.800 L", status: { label: "Aguardando", tone: "neutral" } },
];
