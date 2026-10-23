import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Check,
  Clock3,
  Gauge,
  History,
  Package,
  Plus,
  ShoppingCart,
  Timer,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { StatCard } from "@/components/shared/StatCard";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { ChartCard, SimpleBarChart } from "@/components/shared/ChartCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { selectClass } from "@/components/producao/LoteForm";
import {
  EquipamentoForm,
  ManutencaoForm,
  ParadaForm,
  type EquipmentOption,
  type EquipmentRecord,
  type LotOption,
  type MaintenanceOption,
  type OrderOption,
} from "@/components/manutencao/ManutencaoForms";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_painel/manutencao")({
  head: () => ({
    meta: [
      { title: "Manutenção — Tintas Gestão" },
      {
        name: "description",
        content: "Equipamentos, revisões, paradas e indicadores de manutenção.",
      },
      { property: "og:title", content: "Manutenção — Tintas Gestão" },
      {
        property: "og:description",
        content: "Acompanhe revisões, disponibilidade e histórico dos equipamentos.",
      },
    ],
  }),
  component: ManutencaoPage,
});

type Equipment = EquipmentRecord & {
  equipamento_id: string;
  status_operacional: "operacional" | "parado";
  ultima_revisao_em: string | null;
  revisao_vencida: boolean;
  tem_parada_aberta: boolean;
  falhas_30_dias: number;
  minutos_parado_30_dias: number;
  minutos_parado_total: number;
  disponibilidade_30_dias_pct: number;
};
type Maintenance = {
  id: string;
  equipamento_id: string;
  tipo: string;
  status: string;
  data_prevista: string;
  data_inicio: string | null;
  data_conclusao: string | null;
  descricao: string;
  observacao: string | null;
  responsavel_nome: string;
  criado_em: string;
};
type Downtime = {
  id: string;
  equipamento_id: string;
  manutencao_id: string | null;
  equipamento_codigo: string;
  equipamento_nome: string;
  manutencao_tipo: string | null;
  inicio_em: string;
  fim_em: string | null;
  motivo: string;
  descricao: string | null;
  duracao_minutos: number | string;
  lote_id: string | null;
  lote_numero: string | null;
  pedido_id: string | null;
  pedido_numero: string | null;
  quantidade_nao_produzida: number | string | null;
  unidade_nao_produzida: string;
  atraso_causado_minutos: number | string;
  responsavel_nome: string;
};

const FAILURE_ALERT_LIMIT = 3;
const DOWNTIME_ALERT_MINUTES = 8 * 60;
const fmtDate = (value: string | null | undefined) =>
  value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—";
const fmtDateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Em andamento";
const fmtDuration = (minutesValue: number | string) => {
  const minutes = Math.max(0, Math.floor(Number(minutesValue) || 0));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remaining = minutes % 60;
  return (
    [days ? `${days}d` : "", hours ? `${hours}h` : "", remaining ? `${remaining}min` : ""]
      .filter(Boolean)
      .join(" ") || "0min"
  );
};
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const datePart = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : localDate(date);
};
const overlapMinutes = (item: Downtime, start: number, end: number) => {
  const stopStart = new Date(item.inicio_em).getTime();
  const stopEnd = item.fim_em ? new Date(item.fim_em).getTime() : Date.now();
  const overlap = Math.min(stopEnd, end) - Math.max(stopStart, start);
  return Math.max(0, Math.floor(overlap / 60_000));
};
const initialImpactFrom = () =>
  localDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const initialImpactTo = () => localDate(new Date());
const maintenanceTypes: Record<string, string> = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  inspecao: "Inspeção",
};
const equipmentTypes: Record<string, string> = {
  tanque: "Tanque",
  motor: "Motor",
  bomba: "Bomba",
  envase: "Envase",
  maquina_pintura: "Máquina de pintura",
};
const maintenanceLabel = (value: string) => maintenanceTypes[value] ?? value;
const statusPresentation: Record<string, { label: string; tone: StatusTone }> = {
  agendada: { label: "Agendada", tone: "info" },
  em_andamento: { label: "Em andamento", tone: "warning" },
  concluida: { label: "Concluída", tone: "success" },
  cancelada: { label: "Cancelada", tone: "neutral" },
};

function ManutencaoPage() {
  const { perfis } = Route.useRouteContext();
  const podeGerenciar = perfis.some((perfil) =>
    ["administrador", "gestor", "manutencao"].includes(perfil),
  );
  const queryClient = useQueryClient();
  const [equipamentoOpen, setEquipamentoOpen] = useState(false);
  const [manutencaoOpen, setManutencaoOpen] = useState(false);
  const [paradaOpen, setParadaOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentRecord | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState("todos");
  const [historyFilter, setHistoryFilter] = useState("todos");
  const [impactFrom, setImpactFrom] = useState(initialImpactFrom);
  const [impactTo, setImpactTo] = useState(initialImpactTo);
  const [impactEquipmentFilter, setImpactEquipmentFilter] = useState("todos");

  const refresh = async () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["manutencao-equipamentos"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-agenda"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-historico"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-historico-impacto"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-dashboard"] }),
    ]);

  const identity = useQuery({
    queryKey: ["manutencao-responsavel"],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      const { data: profile } = await supabase.from("profiles").select("nome,email").maybeSingle();
      const info = profile as { nome?: string | null; email?: string | null } | null;
      return {
        id: user?.id ?? null,
        nome: info?.nome?.trim() || info?.email || user?.email || "Usuário autenticado",
      };
    },
  });

  const equipmentQuery = useQuery({
    queryKey: ["manutencao-equipamentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_manutencao_indicadores_equipamento")
        .select(
          "equipamento_id,codigo,nome,tipo,localizacao,ativo,periodicidade_revisao_dias,ultima_revisao_em,proxima_revisao_em,status_operacional,revisao_vencida,tem_parada_aberta,falhas_30_dias,minutos_parado_30_dias,minutos_parado_total,disponibilidade_30_dias_pct",
        )
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Equipment[];
    },
    staleTime: 20_000,
  });
  const equipment = useMemo(() => equipmentQuery.data ?? [], [equipmentQuery.data]);
  const equipmentOptions: EquipmentOption[] = equipment.map((item) => ({
    id: item.equipamento_id,
    codigo: item.codigo,
    nome: item.nome,
    ativo: item.ativo,
  }));
  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.equipamento_id, item])),
    [equipment],
  );

  const maintenanceQuery = useQuery({
    queryKey: ["manutencao-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manutencoes")
        .select(
          "id,equipamento_id,tipo,status,data_prevista,data_inicio,data_conclusao,descricao,observacao,responsavel_nome,criado_em",
        )
        .order("data_prevista", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Maintenance[];
    },
    staleTime: 20_000,
  });
  const maintenance = maintenanceQuery.data ?? [];

  const downtimeQuery = useQuery({
    queryKey: ["manutencao-historico-impacto"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_paradas_impacto")
        .select(
          "id,equipamento_id,manutencao_id,equipamento_codigo,equipamento_nome,manutencao_tipo,inicio_em,fim_em,motivo,descricao,duracao_minutos,lote_id,lote_numero,pedido_id,pedido_numero,quantidade_nao_produzida,unidade_nao_produzida,atraso_causado_minutos,responsavel_nome",
        )
        .order("inicio_em", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Downtime[];
    },
    staleTime: 20_000,
  });
  const downtimes = useMemo(() => downtimeQuery.data ?? [], [downtimeQuery.data]);

  const lotQuery = useQuery({
    queryKey: ["manutencao-impacto-lotes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lotes_producao")
        .select("id,numero_lote,pedido_id")
        .order("numero_lote", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as LotOption[];
    },
    staleTime: 60_000,
  });
  const orderQuery = useQuery({
    queryKey: ["manutencao-impacto-pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id,numero")
        .order("numero", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as OrderOption[];
    },
    staleTime: 60_000,
  });

  const periodStart = impactFrom ? new Date(`${impactFrom}T00:00:00`).getTime() : 0;
  const periodEnd = impactTo ? new Date(`${impactTo}T23:59:59.999`).getTime() : Date.now();
  const validPeriod = periodEnd >= periodStart;
  const impactRows = useMemo(
    () =>
      validPeriod
        ? downtimes
            .filter(
              (item) =>
                (impactEquipmentFilter === "todos" ||
                  item.equipamento_id === impactEquipmentFilter) &&
                overlapMinutes(item, periodStart, periodEnd) > 0,
            )
            .map((item) => ({
              ...item,
              periodMinutes: overlapMinutes(item, periodStart, periodEnd),
            }))
        : [],
    [downtimes, impactEquipmentFilter, periodEnd, periodStart, validPeriod],
  );
  const totalPeriodMinutes = impactRows.reduce((sum, item) => sum + item.periodMinutes, 0);
  const averageStopMinutes = impactRows.length ? totalPeriodMinutes / impactRows.length : 0;
  const downtimeByEquipment = impactRows.reduce((map, item) => {
    map.set(item.equipamento_id, (map.get(item.equipamento_id) ?? 0) + item.periodMinutes);
    return map;
  }, new Map<string, number>());
  const topDowntimeEquipment = [...downtimeByEquipment.entries()].sort((a, b) => b[1] - a[1])[0];
  const topEquipment = topDowntimeEquipment
    ? equipmentById.get(topDowntimeEquipment[0])
    : undefined;
  const productionByUnit = impactRows.reduce((map, item) => {
    if (item.quantidade_nao_produzida !== null) {
      const unit = item.unidade_nao_produzida || "un";
      map.set(unit, (map.get(unit) ?? 0) + Number(item.quantidade_nao_produzida));
    }
    return map;
  }, new Map<string, number>());
  const productionImpactLabel =
    [...productionByUnit.entries()]
      .map(
        ([unit, quantity]) =>
          `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(quantity)} ${unit}`,
      )
      .join(" · ") || "Sem dados";
  const affectedOrders = new Set(
    impactRows.filter((item) => item.pedido_id).map((item) => item.pedido_id),
  );
  const delayCausedMinutes = impactRows.reduce(
    (sum, item) => sum + Number(item.atraso_causado_minutos || 0),
    0,
  );
  const selectedPeriodMinutes = validPeriod
    ? Math.max(0, (Math.min(periodEnd, Date.now()) - periodStart) / 60_000)
    : 0;
  const availabilityEquipmentCount =
    impactEquipmentFilter === "todos"
      ? equipment.filter((item) => item.ativo).length
      : equipment.some((item) => item.equipamento_id === impactEquipmentFilter && item.ativo)
        ? 1
        : 0;
  const totalAvailableMinutes = selectedPeriodMinutes * availabilityEquipmentCount;
  const availabilityInPeriod = totalAvailableMinutes
    ? Math.max(0, 100 * (1 - totalPeriodMinutes / totalAvailableMinutes))
    : 0;
  const comparisonData = [
    { tipo: "Preventiva", count: "preventiva" },
    { tipo: "Corretiva", count: "corretiva" },
  ].map(({ tipo, count }) => {
    const rows = impactRows.filter((item) => item.manutencao_tipo === count);
    const maintenanceCount = maintenance.filter((item) => {
      const date = datePart(item.data_conclusao ?? `${item.data_prevista}T12:00:00`);
      return (
        item.tipo === count &&
        item.status !== "cancelada" &&
        date >= impactFrom &&
        date <= impactTo &&
        (impactEquipmentFilter === "todos" || item.equipamento_id === impactEquipmentFilter)
      );
    }).length;
    return {
      tipo,
      manutencoes: maintenanceCount,
      horas_paradas: rows.reduce((sum, item) => sum + item.periodMinutes, 0) / 60,
    };
  });

  const updateMaintenance = useMutation({
    mutationFn: async ({
      item,
      status,
    }: {
      item: Maintenance;
      status: "em_andamento" | "concluida" | "cancelada";
    }) => {
      const now = new Date().toISOString();
      const update = {
        status,
        data_inicio: status === "em_andamento" ? (item.data_inicio ?? now) : item.data_inicio,
        data_conclusao: status === "concluida" ? now : null,
      };
      const { error } = await supabase.from("manutencoes").update(update).eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      notify.success("Manutenção atualizada", "O histórico e a agenda foram atualizados.");
    },
    onError: (error: Error) =>
      notify.error("Não foi possível atualizar a manutenção", error.message),
  });

  const closeDowntime = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("paradas_equipamento")
        .update({ fim_em: new Date().toISOString() })
        .eq("id", id)
        .is("fim_em", null);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      notify.success("Parada encerrada", "O tempo de indisponibilidade foi registrado.");
    },
    onError: (error: Error) => notify.error("Não foi possível encerrar a parada", error.message),
  });

  const alerts = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; tone: StatusTone }> = [];
    for (const item of equipment) {
      if (item.revisao_vencida)
        items.push({
          id: `${item.equipamento_id}-revision`,
          title: "Revisão vencida",
          detail: `${item.nome} · prevista para ${fmtDate(item.proxima_revisao_em)}`,
          tone: "danger",
        });
      if (item.tem_parada_aberta)
        items.push({
          id: `${item.equipamento_id}-stopped`,
          title: "Equipamento parado",
          detail: item.nome,
          tone: "danger",
        });
      if (Number(item.falhas_30_dias) >= FAILURE_ALERT_LIMIT)
        items.push({
          id: `${item.equipamento_id}-failures`,
          title: "Muitas falhas",
          detail: `${item.nome} · ${item.falhas_30_dias} falhas nos últimos 30 dias`,
          tone: "warning",
        });
      if (Number(item.minutos_parado_30_dias) >= DOWNTIME_ALERT_MINUTES)
        items.push({
          id: `${item.equipamento_id}-downtime`,
          title: "Tempo de parada elevado",
          detail: `${item.nome} · ${fmtDuration(item.minutos_parado_30_dias)} nos últimos 30 dias`,
          tone: "warning",
        });
    }
    return items;
  }, [equipment]);

  const activeEquipment = equipment.filter((item) => item.ativo);
  const overdueCount = equipment.filter((item) => item.revisao_vencida).length;
  const stoppedCount = equipment.filter((item) => item.tem_parada_aberta).length;
  const availability = activeEquipment.length
    ? activeEquipment.reduce(
        (sum, item) => sum + Number(item.disponibilidade_30_dias_pct || 0),
        0,
      ) / activeEquipment.length
    : 0;
  const filteredEquipment = equipment.filter((item) =>
    equipmentFilter === "todos"
      ? true
      : equipmentFilter === "parados"
        ? item.tem_parada_aberta
        : equipmentFilter === "vencidos"
          ? item.revisao_vencida
          : item.ativo,
  );
  const filteredMaintenances = maintenance.filter(
    (item) => historyFilter === "todos" || item.equipamento_id === historyFilter,
  );
  const filteredDowntimes = downtimes.filter(
    (item) => historyFilter === "todos" || item.equipamento_id === historyFilter,
  );
  const scheduled = maintenance.filter((item) =>
    ["agendada", "em_andamento"].includes(item.status),
  );
  const requestError = equipmentQuery.isError || maintenanceQuery.isError || downtimeQuery.isError;

  const abrirCadastroEquipamento = (item?: Equipment | null) => {
    setEditing(item ?? null);
    setEquipamentoOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Manutenção"
        description="Equipamentos, revisões programadas, intervenções e disponibilidade da fábrica."
        actions={
          podeGerenciar ? (
            <>
              <Button variant="outline" onClick={() => setParadaOpen(true)}>
                <Clock3 className="h-4 w-4" /> Registrar parada
              </Button>
              <Button variant="outline" onClick={() => setManutencaoOpen(true)}>
                <CalendarClock className="h-4 w-4" /> Agendar manutenção
              </Button>
              <Button onClick={() => abrirCadastroEquipamento()}>
                <Plus className="h-4 w-4" /> Equipamento
              </Button>
            </>
          ) : undefined
        }
      />

      {requestError && (
        <div role="alert" className="rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
          <p className="font-medium">Não foi possível carregar os dados de manutenção.</p>
          <p className="mt-1 text-muted-foreground">
            Confirme que `supabase/manutencao.sql` e `supabase/impacto_paradas.sql` foram executados
            no SQL Editor do Supabase e atualize a página.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Equipamentos ativos"
          value={equipmentQuery.isLoading ? "…" : String(activeEquipment.length)}
          hint="Ativos cadastrados"
          icon={Wrench}
        />
        <StatCard
          label="Revisões vencidas"
          value={equipmentQuery.isLoading ? "…" : String(overdueCount)}
          hint="Revisão programada ultrapassada"
          icon={CalendarClock}
          tone={overdueCount ? "warning" : "success"}
        />
        <StatCard
          label="Equipamentos parados"
          value={equipmentQuery.isLoading ? "…" : String(stoppedCount)}
          hint="Com parada ainda aberta"
          icon={AlertTriangle}
          tone={stoppedCount ? "destructive" : "success"}
        />
        <StatCard
          label="Disponibilidade média"
          value={equipmentQuery.isLoading ? "…" : `${availability.toFixed(1).replace(".", ",")}%`}
          hint="Média dos ativos · últimos 30 dias"
          icon={Gauge}
          tone={availability >= 95 ? "success" : availability >= 85 ? "warning" : "destructive"}
        />
      </div>

      <Tabs defaultValue="visao-geral">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
          <TabsTrigger value="equipamentos">Equipamentos ({equipment.length})</TabsTrigger>
          <TabsTrigger value="agenda">Agenda ({scheduled.length})</TabsTrigger>
          <TabsTrigger value="paradas">
            Paradas ({downtimes.filter((item) => !item.fim_em).length})
          </TabsTrigger>
          <TabsTrigger value="impacto">Impacto das paradas</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="mt-4 space-y-4">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div>
              <h2 className="font-display font-semibold">Alertas de manutenção</h2>
              <p className="text-xs text-muted-foreground">
                Falhas recorrentes: {FAILURE_ALERT_LIMIT} ou mais em 30 dias. Parada elevada:{" "}
                {fmtDuration(DOWNTIME_ALERT_MINUTES)} ou mais em 30 dias.
              </p>
            </div>
            {equipmentQuery.isLoading ? (
              <TableSkeleton rows={3} />
            ) : alerts.length ? (
              <ul className="divide-y">
                {alerts.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <StatusBadge tone={item.tone}>{item.title}</StatusBadge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhum alerta de manutenção no momento.
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">Disponibilidade por equipamento</h2>
                <p className="text-xs text-muted-foreground">
                  Disponibilidade dos últimos 30 dias; paradas em andamento contam até agora.
                </p>
              </div>
            </div>
            <EquipmentAvailability rows={activeEquipment} loading={equipmentQuery.isLoading} />
          </section>
        </TabsContent>

        <TabsContent value="equipamentos" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Cadastre ativos e configure a periodicidade da revisão em dias (7 dias = semanal).
            </p>
            <select
              aria-label="Filtrar equipamentos"
              className={`${selectClass} max-w-xs`}
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
            >
              <option value="todos">Todos os equipamentos</option>
              <option value="ativos">Somente ativos</option>
              <option value="parados">Parados</option>
              <option value="vencidos">Revisão vencida</option>
            </select>
          </div>
          {equipmentQuery.isLoading ? (
            <TableSkeleton rows={6} />
          ) : filteredEquipment.length ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="p-3">Equipamento</th>
                    <th className="p-3">Tipo / local</th>
                    <th className="p-3">Periodicidade</th>
                    <th className="p-3">Próxima revisão</th>
                    <th className="p-3">Disponibilidade</th>
                    <th className="p-3">Status</th>
                    {podeGerenciar && <th className="p-3">Ação</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredEquipment.map((item) => (
                    <tr key={item.equipamento_id} className="border-b last:border-0">
                      <td className="p-3">
                        <p className="font-medium">{item.nome}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.codigo}</p>
                      </td>
                      <td className="p-3">
                        <span>{equipmentType(item.tipo)}</span>
                        <p className="text-xs text-muted-foreground">
                          {item.localizacao || "Local não informado"}
                        </p>
                      </td>
                      <td className="p-3">
                        {item.periodicidade_revisao_dias
                          ? `${item.periodicidade_revisao_dias} dias${item.periodicidade_revisao_dias === 7 ? " · semanal" : ""}`
                          : "Não definida"}
                      </td>
                      <td className="p-3">
                        {item.proxima_revisao_em ? (
                          <span
                            className={item.revisao_vencida ? "font-medium text-destructive" : ""}
                          >
                            {fmtDate(item.proxima_revisao_em)}
                            {item.revisao_vencida ? " · vencida" : ""}
                          </span>
                        ) : (
                          "Sem data"
                        )}
                      </td>
                      <td className="p-3 tabular-nums">
                        {Number(item.disponibilidade_30_dias_pct).toFixed(1).replace(".", ",")}%
                      </td>
                      <td className="p-3">
                        <StatusBadge
                          tone={
                            !item.ativo ? "neutral" : item.tem_parada_aberta ? "danger" : "success"
                          }
                        >
                          {!item.ativo
                            ? "Inativo"
                            : item.tem_parada_aberta
                              ? "Parado"
                              : "Operacional"}
                        </StatusBadge>
                      </td>
                      {podeGerenciar && (
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => abrirCadastroEquipamento(item)}
                          >
                            Editar
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Wrench}
              compact
              title="Nenhum equipamento encontrado"
              description="Ajuste o filtro ou cadastre um equipamento."
            />
          )}
        </TabsContent>

        <TabsContent value="agenda" className="mt-4 space-y-3">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div>
              <h2 className="font-display font-semibold">Próximas revisões</h2>
              <p className="text-xs text-muted-foreground">
                A revisão seguinte é calculada após concluir a manutenção: data de conclusão +
                periodicidade cadastrada.
              </p>
            </div>
            {equipmentQuery.isLoading ? (
              <TableSkeleton rows={3} />
            ) : equipment.filter((item) => item.ativo && item.periodicidade_revisao_dias).length ? (
              <div className="space-y-2">
                {equipment
                  .filter((item) => item.ativo && item.periodicidade_revisao_dias)
                  .sort((a, b) =>
                    (a.proxima_revisao_em ?? "9999").localeCompare(b.proxima_revisao_em ?? "9999"),
                  )
                  .map((item) => (
                    <div
                      key={item.equipamento_id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                    >
                      <div>
                        <p className="font-medium">{item.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          A cada {item.periodicidade_revisao_dias} dias · última revisão{" "}
                          {fmtDate(item.ultima_revisao_em)}
                        </p>
                      </div>
                      {item.proxima_revisao_em ? (
                        <StatusBadge tone={item.revisao_vencida ? "danger" : "info"}>
                          {item.revisao_vencida ? "Vencida" : "Próxima"} ·{" "}
                          {fmtDate(item.proxima_revisao_em)}
                        </StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Aguardando primeira conclusão</StatusBadge>
                      )}
                    </div>
                  ))}
              </div>
            ) : (
              <EmptyState
                icon={CalendarClock}
                compact
                title="Sem periodicidade definida"
                description="Edite um equipamento e informe o intervalo de revisão para habilitar a programação recorrente."
              />
            )}
          </section>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">Manutenções agendadas</h2>
                <p className="text-xs text-muted-foreground">
                  Preventivas, corretivas e inspeções a realizar.
                </p>
              </div>
              {podeGerenciar && (
                <Button size="sm" onClick={() => setManutencaoOpen(true)}>
                  <Plus className="h-4 w-4" /> Agendar
                </Button>
              )}
            </div>
            <MaintenanceList
              rows={maintenance.filter((item) =>
                ["agendada", "em_andamento"].includes(item.status),
              )}
              equipmentById={equipmentById}
              canManage={podeGerenciar}
              loading={maintenanceQuery.isLoading}
              onStatus={(item, status) => updateMaintenance.mutate({ item, status })}
              pending={updateMaintenance.isPending}
            />
          </section>
        </TabsContent>

        <TabsContent value="paradas" className="mt-4 space-y-3">
          <div className="flex justify-end">
            {podeGerenciar && (
              <Button onClick={() => setParadaOpen(true)}>
                <Plus className="h-4 w-4" /> Registrar parada
              </Button>
            )}
          </div>
          <DowntimeList
            rows={downtimes}
            equipmentById={equipmentById}
            canManage={podeGerenciar}
            loading={downtimeQuery.isLoading}
            onClose={(id) => closeDowntime.mutate(id)}
            pending={closeDowntime.isPending}
          />
        </TabsContent>

        <TabsContent value="impacto" className="mt-4 space-y-4">
          <section className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="impacto-de">
                De
              </label>
              <Input
                id="impacto-de"
                type="date"
                value={impactFrom}
                onChange={(e) => setImpactFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground" htmlFor="impacto-ate">
                Até
              </label>
              <Input
                id="impacto-ate"
                type="date"
                value={impactTo}
                onChange={(e) => setImpactTo(e.target.value)}
              />
            </div>
            <div className="min-w-56 flex-1">
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor="impacto-equipamento"
              >
                Equipamento
              </label>
              <select
                id="impacto-equipamento"
                className={selectClass}
                value={impactEquipmentFilter}
                onChange={(e) => setImpactEquipmentFilter(e.target.value)}
              >
                <option value="todos">Todos os equipamentos</option>
                {equipment.map((item) => (
                  <option key={item.equipamento_id} value={item.equipamento_id}>
                    {item.codigo} — {item.nome}
                  </option>
                ))}
              </select>
            </div>
            <p className="w-full text-xs text-muted-foreground">
              Duração calculada entre início e fim; paradas abertas contam até agora. A
              disponibilidade usa o total de horas do período e os equipamentos ativos.
            </p>
          </section>

          {!validPeriod && (
            <p
              role="alert"
              className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
            >
              A data inicial deve ser anterior ou igual à data final.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Horas totais paradas"
              value={`${(totalPeriodMinutes / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`}
              hint="No período e filtro selecionados"
              icon={Timer}
            />
            <StatCard
              label="Número de paradas"
              value={String(impactRows.length)}
              hint="Inclui paradas em andamento"
              icon={BarChart3}
            />
            <StatCard
              label="Tempo médio de parada"
              value={fmtDuration(averageStopMinutes)}
              hint="Média por ocorrência no período"
              icon={Clock3}
            />
            <StatCard
              label="Maior tempo parado"
              value={topEquipment?.nome ?? "—"}
              hint={
                topDowntimeEquipment
                  ? fmtDuration(topDowntimeEquipment[1])
                  : "Sem paradas no período"
              }
              icon={Wrench}
            />
            <StatCard
              label="Produção afetada"
              value={productionImpactLabel}
              hint="Soma por unidade para não misturar medidas"
              icon={Package}
            />
            <StatCard
              label="Pedidos afetados"
              value={String(affectedOrders.size)}
              hint="Pedidos distintos vinculados às paradas"
              icon={ShoppingCart}
            />
            <StatCard
              label="Atraso causado"
              value={fmtDuration(delayCausedMinutes)}
              hint="Estimativa informada no registro da parada"
              icon={AlertTriangle}
            />
            <StatCard
              label="Disponibilidade"
              value={
                totalAvailableMinutes
                  ? `${availabilityInPeriod.toFixed(1).replace(".", ",")}%`
                  : "—"
              }
              hint="No período · ativos cadastrados"
              icon={Gauge}
              tone={
                availabilityInPeriod >= 95
                  ? "success"
                  : availabilityInPeriod >= 85
                    ? "warning"
                    : "destructive"
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Quantidade de manutenções"
              subtitle="Comparação entre preventiva e corretiva no período selecionado"
            >
              <SimpleBarChart
                data={comparisonData}
                xKey="tipo"
                series={[{ key: "manutencoes", label: "Manutenções", color: "var(--chart-1)" }]}
              />
            </ChartCard>
            <ChartCard
              title="Horas paradas associadas"
              subtitle="Paradas vinculadas a uma manutenção do tipo correspondente"
            >
              <SimpleBarChart
                data={comparisonData}
                xKey="tipo"
                series={[{ key: "horas_paradas", label: "Horas paradas", color: "var(--chart-4)" }]}
              />
            </ChartCard>
          </div>

          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div>
              <h2 className="font-display font-semibold">Detalhamento do impacto por parada</h2>
              <p className="text-xs text-muted-foreground">
                Produção perdida e atraso são valores informados no registro. Duração é calculada
                automaticamente.
              </p>
            </div>
            <DowntimeImpactTable rows={impactRows} loading={downtimeQuery.isLoading} />
          </section>
          {(downtimeQuery.isError || lotQuery.isError || orderQuery.isError) && (
            <p
              role="alert"
              className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm"
            >
              Para carregar todos os impactos, confirme que `supabase/impacto_paradas.sql`,
              `supabase/manutencao.sql`, `supabase/producao_envase.sql` e `supabase/pedidos.sql`
              foram executados no SQL Editor do Supabase.
            </p>
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-4">
          <div className="max-w-sm">
            <label
              className="mb-1 block text-xs text-muted-foreground"
              htmlFor="historico-equipamento"
            >
              Filtrar histórico por equipamento
            </label>
            <select
              id="historico-equipamento"
              className={selectClass}
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
            >
              <option value="todos">Todos os equipamentos</option>
              {equipment.map((item) => (
                <option key={item.equipamento_id} value={item.equipamento_id}>
                  {item.codigo} — {item.nome}
                </option>
              ))}
            </select>
          </div>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-display font-semibold">Manutenções</h2>
            <MaintenanceList
              rows={filteredMaintenances}
              equipmentById={equipmentById}
              canManage={false}
              loading={maintenanceQuery.isLoading}
              onStatus={() => undefined}
              pending={false}
              showCompleted
            />
          </section>
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="font-display font-semibold">Paradas registradas</h2>
            <DowntimeList
              rows={filteredDowntimes}
              equipmentById={equipmentById}
              canManage={false}
              loading={downtimeQuery.isLoading}
              onClose={() => undefined}
              pending={false}
            />
          </section>
        </TabsContent>
      </Tabs>

      <EquipamentoForm
        key={editing?.id ?? "novo-equipamento"}
        open={equipamentoOpen}
        onOpenChange={setEquipamentoOpen}
        equipamento={editing}
      />
      <ManutencaoForm
        open={manutencaoOpen}
        onOpenChange={setManutencaoOpen}
        equipamentos={equipmentOptions}
        responsavelId={identity.data?.id ?? null}
        responsavelNome={identity.data?.nome ?? "Usuário autenticado"}
      />
      <ParadaForm
        open={paradaOpen}
        onOpenChange={setParadaOpen}
        equipamentos={equipmentOptions}
        lotes={lotQuery.data ?? []}
        pedidos={orderQuery.data ?? []}
        manutencoes={maintenance}
        responsavelId={identity.data?.id ?? null}
        responsavelNome={identity.data?.nome ?? "Usuário autenticado"}
      />
    </div>
  );
}

function EquipmentAvailability({ rows, loading }: { rows: Equipment[]; loading: boolean }) {
  if (loading) return <TableSkeleton rows={4} />;
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nenhum equipamento ativo cadastrado.</p>;
  return (
    <div className="space-y-3">
      {rows.map((item) => {
        const percent = Math.max(0, Math.min(100, Number(item.disponibilidade_30_dias_pct) || 0));
        return (
          <div key={item.equipamento_id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium">{item.nome}</span>
              <span className="tabular-nums text-muted-foreground">
                {percent.toFixed(1).replace(".", ",")}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${percent >= 95 ? "bg-success" : percent >= 85 ? "bg-warning" : "bg-destructive"}`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MaintenanceList({
  rows,
  equipmentById,
  canManage,
  loading,
  onStatus,
  pending,
  showCompleted = false,
}: {
  rows: Maintenance[];
  equipmentById: Map<string, Equipment>;
  canManage: boolean;
  loading: boolean;
  onStatus: (item: Maintenance, status: "em_andamento" | "concluida" | "cancelada") => void;
  pending: boolean;
  showCompleted?: boolean;
}) {
  if (loading) return <TableSkeleton rows={4} />;
  if (!rows.length)
    return (
      <EmptyState
        icon={CalendarClock}
        compact
        title={showCompleted ? "Sem histórico de manutenção" : "Agenda vazia"}
        description={
          showCompleted
            ? "As manutenções concluídas aparecerão aqui."
            : "Não há manutenções agendadas no momento."
        }
      />
    );
  return (
    <div className="space-y-2">
      {[...rows]
        .sort((a, b) => b.data_prevista.localeCompare(a.data_prevista))
        .map((item) => {
          const status = statusPresentation[item.status] ?? {
            label: item.status,
            tone: "neutral" as StatusTone,
          };
          const late =
            ["agendada", "em_andamento"].includes(item.status) &&
            item.data_prevista < new Date().toISOString().slice(0, 10);
          const asset = equipmentById.get(item.equipamento_id);
          return (
            <div
              key={item.id}
              className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{asset?.nome ?? "Equipamento arquivado"}</p>
                  <StatusBadge tone={late ? "danger" : status.tone}>
                    {late ? "Atrasada" : status.label}
                  </StatusBadge>
                </div>
                <p className="mt-1 text-sm">{item.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  {maintenanceLabel(item.tipo)} · prevista {fmtDate(item.data_prevista)} ·{" "}
                  {item.responsavel_nome}
                  {item.data_conclusao ? ` · concluída ${fmtDateTime(item.data_conclusao)}` : ""}
                </p>
              </div>
              {canManage && ["agendada", "em_andamento"].includes(item.status) && (
                <div className="flex flex-wrap gap-2">
                  {item.status === "agendada" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => onStatus(item, "em_andamento")}
                    >
                      Iniciar
                    </Button>
                  )}
                  <Button size="sm" disabled={pending} onClick={() => onStatus(item, "concluida")}>
                    <Check className="h-4 w-4" /> Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onStatus(item, "cancelada")}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function DowntimeImpactTable({
  rows,
  loading,
}: {
  rows: Array<Downtime & { periodMinutes: number }>;
  loading: boolean;
}) {
  if (loading) return <TableSkeleton rows={5} />;
  if (!rows.length)
    return (
      <EmptyState
        icon={BarChart3}
        compact
        title="Nenhuma parada no período"
        description="Ajuste as datas ou registre uma parada para acompanhar o impacto produtivo."
      />
    );
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[1250px] text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="p-3">Equipamento</th>
            <th className="p-3">Motivo</th>
            <th className="p-3">Início</th>
            <th className="p-3">Fim</th>
            <th className="p-3">Duração</th>
            <th className="p-3">Lote afetado</th>
            <th className="p-3">Pedido afetado</th>
            <th className="p-3">Produção não realizada</th>
            <th className="p-3">Atraso causado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="p-3">
                <p className="font-medium">{item.equipamento_nome}</p>
                <p className="font-mono text-xs text-muted-foreground">{item.equipamento_codigo}</p>
              </td>
              <td className="p-3">
                <p>{item.motivo}</p>
                {item.manutencao_tipo && (
                  <p className="text-xs text-muted-foreground">
                    {maintenanceLabel(item.manutencao_tipo)}
                  </p>
                )}
              </td>
              <td className="p-3 whitespace-nowrap">{fmtDateTime(item.inicio_em)}</td>
              <td className="p-3 whitespace-nowrap">
                {item.fim_em ? fmtDateTime(item.fim_em) : "Em andamento"}
              </td>
              <td className="p-3 whitespace-nowrap tabular-nums">
                {fmtDuration(item.duracao_minutos)}
              </td>
              <td className="p-3">{item.lote_numero ?? "—"}</td>
              <td className="p-3">{item.pedido_numero ?? "—"}</td>
              <td className="p-3 whitespace-nowrap tabular-nums">
                {item.quantidade_nao_produzida === null
                  ? "Não informado"
                  : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(item.quantidade_nao_produzida))} ${item.unidade_nao_produzida}`}
              </td>
              <td className="p-3 whitespace-nowrap tabular-nums">
                {fmtDuration(item.atraso_causado_minutos)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DowntimeList({
  rows,
  equipmentById,
  canManage,
  loading,
  onClose,
  pending,
}: {
  rows: Downtime[];
  equipmentById: Map<string, Equipment>;
  canManage: boolean;
  loading: boolean;
  onClose: (id: string) => void;
  pending: boolean;
}) {
  if (loading) return <TableSkeleton rows={4} />;
  if (!rows.length)
    return (
      <EmptyState
        icon={History}
        compact
        title="Nenhuma parada registrada"
        description="As ocorrências de indisponibilidade aparecerão aqui."
      />
    );
  return (
    <div className="space-y-2">
      {rows.map((item) => {
        const asset = equipmentById.get(item.equipamento_id);
        const elapsed = Math.max(
          0,
          Math.floor(
            (new Date(item.fim_em ?? new Date().toISOString()).getTime() -
              new Date(item.inicio_em).getTime()) /
              60000,
          ),
        );
        return (
          <div
            key={item.id}
            className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{asset?.nome ?? "Equipamento arquivado"}</p>
                <StatusBadge tone={item.fim_em ? "neutral" : "danger"}>
                  {item.fim_em ? "Encerrada" : "Parada aberta"}
                </StatusBadge>
              </div>
              <p className="mt-1 text-sm">
                {item.motivo}
                {item.descricao ? ` · ${item.descricao}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Início {fmtDateTime(item.inicio_em)} · fim {fmtDateTime(item.fim_em)} · duração{" "}
                {fmtDuration(elapsed)} · {item.responsavel_nome}
              </p>
            </div>
            {canManage && !item.fim_em && (
              <Button size="sm" disabled={pending} onClick={() => onClose(item.id)}>
                <Check className="h-4 w-4" /> Encerrar parada
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function equipmentType(value: string) {
  return equipmentTypes[value] ?? value;
}
