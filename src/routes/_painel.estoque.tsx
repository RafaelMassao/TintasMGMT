import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Tintas Gestão" },
      { name: "description", content: "Matérias-primas, embalagens e produtos acabados." },
      { property: "og:title", content: "Estoque — Tintas Gestão" },
      { property: "og:description", content: "Matérias-primas, embalagens e produtos acabados." },
    ],
  }),
  component: EstoquePage,
});

function EstoquePage() {
  return (
    <>
      <PageHeader title="Estoque" description="Matérias-primas, embalagens e produtos acabados." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
