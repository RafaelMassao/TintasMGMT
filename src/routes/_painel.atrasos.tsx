import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/producao/LoteForm";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import {
  OcorrenciaForm,
  STATUS_OCORRENCIA,
  TIPOS_OCORRENCIA,
  type LoteOpcao,
  type PedidoOpcao,
  type ProdutoOpcao,
} from "@/components/ocorrencias/OcorrenciaForm";

export const Route = createFileRoute("/_painel/atrasos")({
  head: () => ({
    meta: [
      { title: "Atrasos e ocorrências — Tintas Gestão" },
      {
        name: "description",
        content: "Registre, acompanhe e analise atrasos e ocorrências operacionais.",
      },
      { property: "og:title", content: "Atrasos e ocorrências — Tintas Gestão" },
      {
        property: "og:description",
        content: "Acompanhamento de ocorrências, responsáveis e duração dos atrasos.",
      },
    ],
  }),
  component: AtrasosPage,
});

type Ocorrencia = {
  id: string;
  tipo: string;
  origem: string;
  lote_id: string | null;
  pedido_id: string | null;
  produto_id: string | null;
  data_prevista: string;
  data_real: string | null;
  atraso_minutos: number | string;
  motivo: string;
  descricao: string;
  responsavel_id: string | null;
  responsavel_nome: string;
  status: string;
  produto_nome: string | null;
  numero_lote: string | null;
  pedido_numero: string | null;
};

const hoje = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const primeiroDiaMes = () => `${hoje().slice(0, 7)}-01`;
const dataLocal = (value: string) => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dataHora = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
const tipoLabel = (value: string) =>
  TIPOS_OCORRENCIA.find((x) => x.value === value)?.label ?? value;
const statusInfo = (value: string): { label: string; tone: StatusTone } => {
  switch (value) {
    case "em_andamento":
      return { label: "Em andamento", tone: "info" };
    case "resolvida":
      return { label: "Resolvida", tone: "success" };
    case "cancelada":
      return { label: "Cancelada", tone: "neutral" };
    default:
      return { label: "Aberta", tone: "warning" };
  }
};
const duracao = (raw: number | string) => {
  const min = Math.max(0, Number(raw) || 0);
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h ${min % 60}min`;
  const dias = Math.floor(min / (24 * 60));
  const horas = Math.floor((min % (24 * 60)) / 60);
  return `${dias}d ${horas}h`;
};

function AtrasosPage() {
  const { user, perfis } = Route.useRouteContext();
  const qc = useQueryClient();
  const podeRegistrar = perfis.some((p) =>
    ["administrador", "gestor", "producao", "vendas", "estoque", "manutencao"].includes(p),
  );
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(hoje());
  const [tipo, setTipo] = useState("todos");
  const [produto, setProduto] = useState("todos");
  const [responsavel, setResponsavel] = useState("todos");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [busca, setBusca] = useState("");

  const catalogos = useQuery({
    queryKey: ["ocorrencias-cadastros"],
    queryFn: async () => {
      const [produtosResp, lotesResp, pedidosResp] = await Promise.all([
        supabase.from("produtos").select("id,codigo,nome").eq("ativo", true).order("nome"),
        supabase
          .from("lotes_producao")
          .select("id,numero_lote,produto_id,produtos(nome)")
          .order("criado_em", { ascending: false })
          .limit(500),
        supabase
          .from("pedidos")
          .select("id,numero")
          .order("criado_em", { ascending: false })
          .limit(500),
      ]);
      const fail = [produtosResp, lotesResp, pedidosResp].find((r) => r.error);
      if (fail?.error) throw fail.error;
      return {
        produtos: (produtosResp.data ?? []) as unknown as ProdutoOpcao[],
        lotes: (lotesResp.data ?? []) as unknown as LoteOpcao[],
        pedidos: (pedidosResp.data ?? []) as unknown as PedidoOpcao[],
      };
    },
  });

  const ocorrenciasQuery = useQuery({
    queryKey: ["ocorrencias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_ocorrencias_atrasos")
        .select(
          "id,tipo,origem,lote_id,pedido_id,produto_id,data_prevista,data_real,atraso_minutos,motivo,descricao,responsavel_id,responsavel_nome,status,produto_nome,numero_lote,pedido_numero",
        )
        .order("data_prevista", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Ocorrencia[];
    },
    staleTime: 15_000,
  });

  const responsaveis = useMemo(() => {
    const nomes = new Map<string, string>();
    for (const row of ocorrenciasQuery.data ?? []) {
      if (row.responsavel_id) nomes.set(row.responsavel_id, row.responsavel_nome);
    }
    return [...nomes.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [ocorrenciasQuery.data]);

  const invalidPeriod = Boolean(de && ate && de > ate);
  const filtered = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    return (ocorrenciasQuery.data ?? []).filter((row) => {
      const day = dataLocal(row.data_prevista);
      return (
        !invalidPeriod &&
        day >= de &&
        day <= ate &&
        (tipo === "todos" || row.tipo === tipo) &&
        (produto === "todos" || row.produto_id === produto) &&
        (responsavel === "todos" || row.responsavel_id === responsavel) &&
        (statusFiltro === "todos" || row.status === statusFiltro) &&
        (!q ||
          `${row.tipo} ${row.origem} ${row.produto_nome ?? ""} ${row.numero_lote ?? ""} ${row.pedido_numero ?? ""} ${row.motivo} ${row.descricao} ${row.responsavel_nome}`
            .toLocaleLowerCase("pt-BR")
            .includes(q))
      );
    });
  }, [
    ocorrenciasQuery.data,
    de,
    ate,
    invalidPeriod,
    tipo,
    produto,
    responsavel,
    statusFiltro,
    busca,
  ]);

  const atrasadas = filtered.filter(
    (row) => Number(row.atraso_minutos) > 0 && ["aberta", "em_andamento"].includes(row.status),
  ).length;
  const emAberto = filtered.filter((row) => ["aberta", "em_andamento"].includes(row.status)).length;
  const alterarStatus = useMutation({
    mutationFn: async ({ id, novoStatus }: { id: string; novoStatus: string }) => {
      const { error } = await supabase.rpc("atualizar_status_ocorrencia", {
        _ocorrencia_id: id,
        _status: novoStatus,
        _data_real: ["resolvida", "cancelada"].includes(novoStatus)
          ? new Date().toISOString()
          : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Status da ocorrência atualizado");
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ocorrencias"] });
    },
    onError: (error: Error) => notify.error("Não foi possível atualizar o status", error.message),
  });

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const nomeResponsavel =
    (typeof metadata?.["nome"] === "string" && metadata["nome"].trim()) ||
    user.email ||
    "Usuário autenticado";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Atrasos e ocorrências"
        description="Acompanhe causas, vínculos e duração dos atrasos operacionais."
        actions={
          podeRegistrar ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Registrar ocorrência
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          icon={AlertTriangle}
          label="Ocorrências em atraso"
          value={String(atrasadas)}
          hint="Abertas ou em andamento dentro do período e filtros"
        />
        <Metric
          icon={Clock3}
          label="Ocorrências ativas"
          value={String(emAberto)}
          hint="Abertas ou em andamento dentro do período e filtros"
        />
      </div>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold">Filtros e histórico</h2>
            <p className="text-xs text-muted-foreground">
              O período usa a data prevista; duração é calculada em tempo real até a data real ou o
              momento atual.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              De
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Até
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
          </div>
        </div>
        {invalidPeriod && (
          <p role="alert" className="text-sm text-destructive">
            A data inicial deve ser anterior ou igual à data final.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar ocorrência"
              className="pl-9"
              placeholder="Buscar motivo, lote, pedido..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <select
            aria-label="Filtrar causa"
            className={selectClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="todos">Todas as causas</option>
            {TIPOS_OCORRENCIA.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar produto"
            className={selectClass}
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
          >
            <option value="todos">Todos os produtos</option>
            {(catalogos.data?.produtos ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.codigo ? `${x.codigo} · ` : ""}
                {x.nome}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar responsável"
            className={selectClass}
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
          >
            <option value="todos">Todos os responsáveis</option>
            {responsaveis.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar status"
            className={selectClass}
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
          >
            <option value="todos">Todos os status</option>
            {STATUS_OCORRENCIA.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
        {catalogos.isError && <ErrorBox message={(catalogos.error as Error).message} />}
        {ocorrenciasQuery.isError && (
          <ErrorBox message={(ocorrenciasQuery.error as Error).message} />
        )}
        {ocorrenciasQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            compact
            title="Nenhuma ocorrência encontrada"
            description="Ajuste os filtros ou registre uma ocorrência para iniciar o acompanhamento."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Tipo / origem</th>
                  <th className="px-3 py-2">Produto e vínculo</th>
                  <th className="px-3 py-2">Prevista</th>
                  <th className="px-3 py-2">Real</th>
                  <th className="px-3 py-2">Duração</th>
                  <th className="px-3 py-2">Motivo</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((row) => {
                  const badge = statusInfo(row.status);
                  const elapsed = Number(row.atraso_minutos) || 0;
                  return (
                    <tr
                      key={row.id}
                      className={
                        elapsed > 0 && ["aberta", "em_andamento"].includes(row.status)
                          ? "bg-destructive/5"
                          : ""
                      }
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium">{tipoLabel(row.tipo)}</div>
                        <div className="text-xs text-muted-foreground">{row.origem}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div>{row.produto_nome ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.numero_lote
                            ? `Lote ${row.numero_lote}`
                            : row.pedido_numero
                              ? `Pedido ${row.pedido_numero}`
                              : "Sem vínculo"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{dataHora(row.data_prevista)}</td>
                      <td className="whitespace-nowrap px-3 py-3">{dataHora(row.data_real)}</td>
                      <td className="whitespace-nowrap px-3 py-3 font-medium">
                        {duracao(elapsed)}
                      </td>
                      <td className="max-w-[220px] px-3 py-3">
                        <div className="truncate" title={row.motivo}>
                          {row.motivo}
                        </div>
                        <div
                          className="truncate text-xs text-muted-foreground"
                          title={row.descricao}
                        >
                          {row.descricao}
                        </div>
                      </td>
                      <td className="px-3 py-3">{row.responsavel_nome}</td>
                      <td className="px-3 py-3">
                        <div className="space-y-2">
                          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                          <select
                            aria-label={`Atualizar status de ${tipoLabel(row.tipo)}`}
                            className={`${selectClass} min-w-36`}
                            value={row.status}
                            disabled={alterarStatus.isPending}
                            onChange={(e) =>
                              alterarStatus.mutate({ id: row.id, novoStatus: e.target.value })
                            }
                          >
                            {STATUS_OCORRENCIA.map((x) => (
                              <option key={x.value} value={x.value}>
                                {x.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <OcorrenciaForm
        open={open}
        onOpenChange={setOpen}
        produtos={catalogos.data?.produtos ?? []}
        lotes={catalogos.data?.lotes ?? []}
        pedidos={catalogos.data?.pedidos ?? []}
        responsavel={nomeResponsavel}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-warning/15 text-warning-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
        <div className="truncate text-xs text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      Não foi possível carregar os dados. Verifique se a migration `atrasos_ocorrencias.sql` foi
      executada e se as permissões do seu perfil estão configuradas. Detalhe: {message}
    </div>
  );
}
