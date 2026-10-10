import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Factory, ClipboardList, Clock3, Droplets, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { ChartCard, SimpleBarChart, SimpleLineChart } from "@/components/shared/ChartCard";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
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
      {
        name: "description",
        content: "Visão geral da produção, pedidos, estoque e alertas da fábrica.",
      },
      { property: "og:title", content: "Dashboard — Tintas Gestão" },
      {
        property: "og:description",
        content: "Visão geral da produção, pedidos, estoque e alertas da fábrica.",
      },
    ],
  }),
  component: DashboardPage,
});

const columns: Column<OrdemProducao>[] = [
  {
    key: "id",
    header: "Ordem",
    primary: true,
    cell: (r) => <span className="font-mono text-xs font-medium">{r.id}</span>,
  },
  { key: "produto", header: "Produto", cell: (r) => r.produto },
  {
    key: "lote",
    header: "Lote",
    cell: (r) => <span className="font-mono text-xs">{r.lote}</span>,
    className: "hidden md:table-cell",
  },
  {
    key: "volume",
    header: "Volume",
    cell: (r) => <span className="tabular-nums">{r.volume}</span>,
    className: "text-right",
  },
  {
    key: "status",
    header: "Status",
    cell: (r) => <StatusBadge tone={r.status.tone}>{r.status.label}</StatusBadge>,
  },
];

function DashboardPage() {
  const atrasos = useQuery({
    queryKey: ["dashboard-ocorrencias"],
    queryFn: async () => {
      const [countResp, listaResp] = await Promise.all([
        supabase
          .from("ocorrencias")
          .select("id", { count: "exact", head: true })
          .in("status", ["aberta", "em_andamento"])
          .lt("data_prevista", new Date().toISOString()),
        supabase
          .from("v_ocorrencias_atrasos")
          .select(
            "id,tipo,data_prevista,atraso_minutos,produto_nome,numero_lote,pedido_numero,responsavel_nome,status,motivo",
          )
          .in("status", ["aberta", "em_andamento"])
          .gt("atraso_minutos", 0)
          .order("data_prevista", { ascending: true })
          .limit(5),
      ]);
      if (countResp.error) throw countResp.error;
      if (listaResp.error) throw listaResp.error;
      return { total: countResp.count ?? 0, itens: listaResp.data ?? [] };
    },
    staleTime: 30_000,
    retry: false,
  });
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Dados demonstrativos — serão substituídos pelos dados reais."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Produção hoje"
          value={mockKpis.producaoHoje}
          hint="Meta: 12.000 L"
          icon={Droplets}
          tone="success"
        />
        <StatCard
          label="Ordens abertas"
          value={mockKpis.ordensAbertas}
          hint="4 em andamento"
          icon={Factory}
        />
        <StatCard
          label="Pedidos pendentes"
          value={mockKpis.pedidosPendentes}
          hint="8 para hoje"
          icon={ClipboardList}
        />
        <StatCard
          label="Alertas de estoque"
          value={mockKpis.alertasEstoque}
          hint="Abaixo do mínimo"
          icon={TriangleAlert}
          tone="warning"
        />
        <StatCard
          label="Atrasos ativos"
          value={atrasos.isError ? "—" : atrasos.isLoading ? "…" : String(atrasos.data?.total ?? 0)}
          hint="Ocorrências abertas após a previsão"
          icon={Clock3}
          tone="warning"
        />
      </div>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Atrasos em andamento</h2>
            <p className="text-xs text-muted-foreground">
              Ocorrências abertas que ultrapassaram a data prevista.
            </p>
          </div>
          <Link to="/atrasos" className="text-sm font-medium text-primary hover:underline">
            Ver ocorrências
          </Link>
        </div>
        {atrasos.isError ? (
          <p className="text-sm text-muted-foreground">
            Acompanhe os registros após aplicar a migration `atrasos_ocorrencias.sql` no Supabase.
          </p>
        ) : atrasos.data?.itens.length ? (
          <ul className="divide-y">
            {atrasos.data.itens.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {item.motivo} ·{" "}
                    {item.produto_nome ?? item.numero_lote ?? item.pedido_numero ?? "Sem vínculo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.responsavel_nome} · previsto{" "}
                    {new Date(item.data_prevista).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                <StatusBadge tone="danger">
                  {formatarAtraso(item.atraso_minutos)} de atraso
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma ocorrência em atraso no momento.</p>
        )}
      </section>

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
          <SimpleLineChart
            data={mockPerdasMes}
            xKey="mes"
            series={[{ key: "perdas", label: "Perdas (%)", color: "var(--chart-2)" }]}
          />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-base font-semibold">Ordens de produção recentes</h2>
        <DataTable columns={columns} rows={mockOrdens} getRowId={(r) => r.id} />
      </section>
    </>
  );
}

function formatarAtraso(minutosRaw: number | string) {
  const minutos = Math.max(0, Number(minutosRaw) || 0);
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 1440) return `${Math.floor(minutos / 60)}h`;
  return `${Math.floor(minutos / 1440)}d ${Math.floor((minutos % 1440) / 60)}h`;
}
