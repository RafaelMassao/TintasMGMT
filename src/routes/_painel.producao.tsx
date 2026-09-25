import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/producao")({
  head: () => ({
    meta: [
      { title: "Produção — Tintas Gestão" },
      { name: "description", content: "Ordens de produção, lotes e acompanhamento de linhas." },
      { property: "og:title", content: "Produção — Tintas Gestão" },
      { property: "og:description", content: "Ordens de produção, lotes e acompanhamento de linhas." },
    ],
  }),
  component: ProducaoPage,
});

function ProducaoPage() {
  return (
    <>
      <PageHeader title="Produção" description="Ordens de produção, lotes e acompanhamento de linhas." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
