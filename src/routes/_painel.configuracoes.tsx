import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatCardSkeleton, TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_painel/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Tintas Gestão" },
      { name: "description", content: "Preferências do sistema e permissões." },
      { property: "og:title", content: "Configurações — Tintas Gestão" },
      { property: "og:description", content: "Preferências do sistema e permissões." },
    ],
  }),
  component: ConfiguracoesPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function ConfiguracoesPage() {
  const [loading, setLoading] = useState(false);

  return (
    <>
      <PageHeader title="Configurações" description="Preferências do sistema e permissões." />
      <EmptyState compact title="Módulo em construção" description="As configurações serão implementadas nas próximas etapas." />

      {/* Referência visual temporária do design system — pode ser removida */}
      <h2 className="pt-2 text-lg font-bold">Guia de componentes</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Botões">
          <div className="flex flex-wrap gap-2">
            <Button>Principal</Button>
            <Button variant="outline">Secundário</Button>
            <Button variant="warning">Alerta</Button>
            <Button variant="destructive">Excluir</Button>
            <Button disabled>Desabilitado</Button>
            <Button
              loading={loading}
              onClick={() => {
                setLoading(true);
                setTimeout(() => setLoading(false), 1500);
              }}
            >
              {loading ? "Salvando..." : "Testar carregamento"}
            </Button>
          </div>
        </Section>

        <Section title="Status">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral">Aguardando</StatusBadge>
            <StatusBadge tone="info">Em produção</StatusBadge>
            <StatusBadge tone="warning">Atenção</StatusBadge>
            <StatusBadge tone="success">Concluído</StatusBadge>
            <StatusBadge tone="danger">Parado</StatusBadge>
          </div>
        </Section>

        <Section title="Mensagens">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => notify.success("Registro salvo", "As alterações foram gravadas.")}>
              Sucesso
            </Button>
            <Button variant="outline" onClick={() => notify.error("Não foi possível salvar")}>
              Erro
            </Button>
            <Button variant="outline" onClick={() => notify.warning("Estoque abaixo do mínimo")}>
              Aviso
            </Button>
            <ConfirmDialog
              description="O registro será removido permanentemente. Deseja continuar?"
              onConfirm={() => new Promise((r) => setTimeout(r, 800)).then(() => notify.success("Registro excluído"))}
              trigger={
                <Button variant="outline">
                  <Trash2 /> Confirmação de exclusão
                </Button>
              }
            />
          </div>
        </Section>

        <Section title="Carregamento">
          <div className="grid grid-cols-2 gap-3">
            <StatCardSkeleton />
            <StatCardSkeleton />
          </div>
          <TableSkeleton rows={3} />
        </Section>
      </div>

      <Section title="Lista vazia">
        <EmptyState
          compact
          title="Nenhum registro cadastrado"
          description="Quando houver registros, eles aparecerão aqui."
          action={
            <Button size="sm">
              <Plus /> Novo registro
            </Button>
          }
        />
      </Section>
    </>
  );
}
