import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_painel/sem-acesso")({
  head: () => ({
    meta: [
      { title: "Sem permissão — Tintas Gestão" },
      { name: "description", content: "Você não tem permissão para acessar esta área." },
      { property: "og:title", content: "Sem permissão — Tintas Gestão" },
      { property: "og:description", content: "Você não tem permissão para acessar esta área." },
    ],
  }),
  component: () => (
    <EmptyState
      title="Você não tem permissão para esta área"
      description="Se precisar de acesso, peça a um administrador para liberar o seu perfil."
      action={
        <Button asChild>
          <Link to="/dashboard">Voltar ao início</Link>
        </Button>
      }
    />
  ),
});
