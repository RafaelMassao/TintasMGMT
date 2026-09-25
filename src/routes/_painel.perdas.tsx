import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/perdas")({
  head: () => ({
    meta: [
      { title: "Perdas — Tintas Gestão" },
      { name: "description", content: "Registro de perdas de produção e estoque." },
      { property: "og:title", content: "Perdas — Tintas Gestão" },
      { property: "og:description", content: "Registro de perdas de produção e estoque." },
    ],
  }),
  component: PerdasPage,
});

function PerdasPage() {
  return (
    <>
      <PageHeader title="Perdas" description="Registro de perdas de produção e estoque." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
