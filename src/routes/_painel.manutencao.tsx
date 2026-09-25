import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/manutencao")({
  head: () => ({
    meta: [
      { title: "Manutenção — Tintas Gestão" },
      { name: "description", content: "Ordens de manutenção de máquinas e equipamentos." },
      { property: "og:title", content: "Manutenção — Tintas Gestão" },
      { property: "og:description", content: "Ordens de manutenção de máquinas e equipamentos." },
    ],
  }),
  component: ManutencaoPage,
});

function ManutencaoPage() {
  return (
    <>
      <PageHeader title="Manutenção" description="Ordens de manutenção de máquinas e equipamentos." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
