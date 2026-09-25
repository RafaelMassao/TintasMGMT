import { createFileRoute } from "@tanstack/react-router";
import { Factory, ClipboardList, Droplets, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ChartCard, SimpleBarChart, SimpleLineChart } from "@/components/shared/ChartCard";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  mockKpis,
  mockOrdens,
  mockPerdasMes,
  mockProducaoSemana,
  type OrdemProducao,
} from "@/lib/mock/dashboard";

export const Route = createFileRoute("/_painel/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Tintas Gestão" },
      { name: "description", content: "Visão geral da produção, pedidos, estoque e alertas da fábrica." },
      { property: "og:title", content: "Dashboard — Tintas Gestão" },
      { property: "og:description", content: "Visão geral da produção, pedidos, estoque e alertas da fábrica." },
    ],
  }),
  component: DashboardPage,
});

const columns: Column<OrdemProducao>[] = [
  { key: "id", header: "Ordem", cell: (r) => <span className="font-mono text-xs font-medium">{r.id}</span> },
  { key: "produto", header: "Produto", cell: (r) => r.produto },
  { key: "lote", header: "Lote", cell: (r) => <span className="font-mono text-xs">{r.lote}</span>, className: "hidden md:table-cell" },
  { key: "volume", header: "Volume", cell: (r) => <span className="tabular-nums">{r.volume}</span>, className: "text-right" },
  { key: "status", header: "Status", cell: (r) => <StatusBadge tone={r.status.tone}>{r.status.label}</StatusBadge> },
];

function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Dados demonstrativos — serão substituídos pelos dados reais." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Produção hoje" value={mockKpis.producaoHoje} hint="Meta: 12.000 L" icon={Droplets} tone="success" />
        <StatCard label="Ordens abertas" value={mockKpis.ordensAbertas} hint="4 em andamento" icon={Factory} />
        <StatCard label="Pedidos pendentes" value={mockKpis.pedidosPendentes} hint="8 para hoje" icon={ClipboardList} />
        <StatCard label="Alertas de estoque" value={mockKpis.alertasEstoque} hint="Abaixo do mínimo" icon={TriangleAlert} tone="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Produção da semana" subtitle="Litros produzidos x meta">
          <SimpleBarChart
            data={mockProducaoSemana}
            xKey="dia"
            series={[
              { key: "litros", label: "Produzido", color: "var(--chart-1)" },
              { key: "meta", label: "Meta", color: "var(--chart-4)" },
            ]}
          />
        </ChartCard>
        <ChartCard title="Índice de perdas" subtitle="% sobre volume produzido">
          <SimpleLineChart data={mockPerdasMes} xKey="mes" series={[{ key: "perdas", label: "Perdas (%)", color: "var(--chart-2)" }]} />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold">Ordens de produção recentes</h2>
        <DataTable columns={columns} rows={mockOrdens} getRowId={(r) => r.id} />
      </section>
    </>
  );
}
