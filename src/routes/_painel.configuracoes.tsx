import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

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

function ConfiguracoesPage() {
  return (
    <>
      <PageHeader title="Configurações" description="Preferências do sistema e permissões." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
