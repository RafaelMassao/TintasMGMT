import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — Tintas Gestão" },
      { name: "description", content: "Relatórios gerenciais e indicadores." },
      { property: "og:title", content: "Relatórios — Tintas Gestão" },
      { property: "og:description", content: "Relatórios gerenciais e indicadores." },
    ],
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <>
      <PageHeader title="Relatórios" description="Relatórios gerenciais e indicadores." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
