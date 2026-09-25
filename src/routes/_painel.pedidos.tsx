import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos — Tintas Gestão" },
      { name: "description", content: "Pedidos de clientes e status de expedição." },
      { property: "og:title", content: "Pedidos — Tintas Gestão" },
      { property: "og:description", content: "Pedidos de clientes e status de expedição." },
    ],
  }),
  component: PedidosPage,
});

function PedidosPage() {
  return (
    <>
      <PageHeader title="Pedidos" description="Pedidos de clientes e status de expedição." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
