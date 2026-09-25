import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/compras")({
  head: () => ({
    meta: [
      { title: "Compras — Tintas Gestão" },
      { name: "description", content: "Solicitações e pedidos de compra a fornecedores." },
      { property: "og:title", content: "Compras — Tintas Gestão" },
      { property: "og:description", content: "Solicitações e pedidos de compra a fornecedores." },
    ],
  }),
  component: ComprasPage,
});

function ComprasPage() {
  return (
    <>
      <PageHeader title="Compras" description="Solicitações e pedidos de compra a fornecedores." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
