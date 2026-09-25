import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export const Route = createFileRoute("/_painel/cadastros")({
  head: () => ({
    meta: [
      { title: "Cadastros — Tintas Gestão" },
      { name: "description", content: "Produtos, clientes, fornecedores e usuários." },
      { property: "og:title", content: "Cadastros — Tintas Gestão" },
      { property: "og:description", content: "Produtos, clientes, fornecedores e usuários." },
    ],
  }),
  component: CadastrosPage,
});

function CadastrosPage() {
  return (
    <>
      <PageHeader title="Cadastros" description="Produtos, clientes, fornecedores e usuários." />
      <EmptyState title="Módulo em construção" description="Esta área será implementada nas próximas etapas." />
    </>
  );
}
