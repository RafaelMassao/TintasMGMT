import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useAlertas, type Alerta, type SeveridadeAlerta } from "@/lib/alertas/useAlertas";

export const Route = createFileRoute("/_painel/alertas")({
  head: () => ({
    meta: [
      { title: "Central de Alertas — Tintas Gestão" },
      { name: "description", content: "Alertas operacionais e notificações do aplicativo." },
    ],
  }),
  component: CentralAlertasPage,
});

const severidadeLabel: Record<SeveridadeAlerta, string> = {
  informativo: "Informativo",
  atencao: "Atenção",
  critico: "Crítico",
};
const severidadeClass: Record<SeveridadeAlerta, string> = {
  informativo: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  atencao: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critico: "border-destructive/30 bg-destructive/10 text-destructive",
};
const IconeSeveridade = ({ severidade }: { severidade: SeveridadeAlerta }) =>
  severidade === "critico" ? (
    <CircleAlert className="h-4 w-4" />
  ) : severidade === "atencao" ? (
    <CircleAlert className="h-4 w-4" />
  ) : (
    <CircleHelp className="h-4 w-4" />
  );
const dataHora = (valor: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(valor),
  );

function CentralAlertasPage() {
  const { perfis } = Route.useRouteContext();
  const alertasQuery = useAlertas(perfis);
  const alertas = useMemo(() => alertasQuery.data ?? [], [alertasQuery.data]);
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroSeveridade, setFiltroSeveridade] = useState("todas");
  const marcarMutation = useMutation({
    mutationFn: (id: string) => alertasQuery.marcarComoLido(id),
    onError: () => notify.error("Não foi possível atualizar o status do alerta."),
  });
  const todosMutation = useMutation({
    mutationFn: () => alertasQuery.marcarTodosComoLidos(),
    onSuccess: () => notify.success("Todos os alertas foram marcados como lidos."),
    onError: () => notify.error("Não foi possível marcar os alertas como lidos."),
  });
  const filtrados = useMemo(
    () =>
      alertas.filter((a) => {
        const statusOk =
          filtroStatus === "todos" ||
          (filtroStatus === "nao_lidos" ? !a.lido_em : Boolean(a.lido_em));
        return statusOk && (filtroSeveridade === "todas" || a.severidade === filtroSeveridade);
      }),
    [alertas, filtroStatus, filtroSeveridade],
  );
  const naoLidos = alertas.filter((a) => !a.lido_em).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Central de Alertas"
        description="Acompanhe eventos operacionais conforme seu perfil de acesso. Os alertas são atualizados automaticamente."
        actions={
          naoLidos > 0 ? (
            <Button
              variant="outline"
              onClick={() => todosMutation.mutate()}
              loading={todosMutation.isPending}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              Marcar todos como lidos
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <ResumoCard
          label="Alertas no histórico"
          value={String(alertas.length)}
          icon={<Bell className="h-4 w-4" />}
        />
        <ResumoCard
          label="Não lidos"
          value={String(naoLidos)}
          icon={<CircleAlert className="h-4 w-4" />}
        />
        <ResumoCard
          label="Críticos não lidos"
          value={String(alertas.filter((a) => a.severidade === "critico" && !a.lido_em).length)}
          icon={<CircleAlert className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="nao_lidos">Não lidos</SelectItem>
            <SelectItem value="lidos">Lidos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroSeveridade} onValueChange={setFiltroSeveridade}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Severidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as severidades</SelectItem>
            <SelectItem value="critico">Crítico</SelectItem>
            <SelectItem value="atencao">Atenção</SelectItem>
            <SelectItem value="informativo">Informativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Alertas de perdas acima do limite dependem da configuração de{" "}
        <code>limite_perda_valor</code> em <code>public.configuracao_alertas</code>. O script SQL
        cria essa configuração sem presumir um valor.
      </p>

      {alertasQuery.isLoading ? (
        <TableSkeleton rows={5} />
      ) : alertasQuery.isError ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="font-semibold text-destructive">Não foi possível carregar os alertas.</p>
            <p className="text-sm text-muted-foreground">
              Confira se o script <code>supabase/central_alertas.sql</code> foi executado no SQL
              Editor do Supabase e tente novamente.
            </p>
            <Button variant="outline" onClick={() => void alertasQuery.refetch()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title={alertas.length ? "Nenhum alerta neste filtro" : "Tudo em dia"}
          description={
            alertas.length
              ? "Ajuste os filtros para visualizar outros alertas."
              : "Não há alertas operacionais para os módulos que seu perfil pode acessar."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtrados.map((alerta) => (
            <AlertaCard
              key={alerta.id}
              alerta={alerta}
              onLer={() => marcarMutation.mutate(alerta.id)}
              loading={marcarMutation.isPending && marcarMutation.variables === alerta.id}
            />
          ))}
          {alertas.length >= 500 && (
            <p className="text-center text-xs text-muted-foreground">
              Exibindo os 500 alertas mais recentes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ResumoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function AlertaCard({
  alerta,
  onLer,
  loading,
}: {
  alerta: Alerta;
  onLer: () => void;
  loading: boolean;
}) {
  return (
    <Card className={alerta.lido_em ? "opacity-75" : "border-l-4 border-l-primary"}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span
            className={`mt-0.5 inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium ${severidadeClass[alerta.severidade]}`}
          >
            <IconeSeveridade severidade={alerta.severidade} />
            {severidadeLabel[alerta.severidade]}
          </span>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{alerta.titulo}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] ${alerta.lido_em ? "bg-muted text-muted-foreground" : "bg-primary/10 font-medium text-primary"}`}
              >
                {alerta.lido_em ? "Lido" : "Não lido"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{alerta.descricao}</p>
            <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Criado em {dataHora(alerta.criado_em)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 sm:pt-1">
          {!alerta.lido_em && (
            <Button size="sm" variant="outline" onClick={onLer} disabled={loading}>
              {loading ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-2 h-4 w-4" />
              )}
              Marcar lido
            </Button>
          )}
          <Button asChild size="sm">
            <Link to={alerta.link as never}>
              Abrir <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
