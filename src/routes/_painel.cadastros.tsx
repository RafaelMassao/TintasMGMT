import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/shared/PageHeader";
import { CadastroCrud } from "@/components/cadastros/CadastroCrud";
import { CADASTROS, podeEditarCadastro } from "@/lib/cadastros/config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_painel/cadastros")({
  validateSearch: z.object({ aba: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Cadastros — Tintas Gestão" },
      { name: "description", content: "Produtos, cores, embalagens, clientes, fornecedores, materiais e equipamentos." },
      { property: "og:title", content: "Cadastros — Tintas Gestão" },
      { property: "og:description", content: "Produtos, cores, embalagens, clientes, fornecedores, materiais e equipamentos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CadastrosPage,
});

function CadastrosPage() {
  const { aba } = Route.useSearch();
  const { perfis } = Route.useRouteContext();
  const atual = CADASTROS.find((c) => c.slug === aba) ?? CADASTROS[0]!;

  return (
    <>
      <PageHeader title="Cadastros" description="Informações básicas usadas em todo o sistema." />
      <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1 rounded-lg border bg-card p-1">
          {CADASTROS.map((c) => (
            <Link
              key={c.slug}
              to="/cadastros"
              search={{ aba: c.slug }}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                c.slug === atual.slug ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {c.titulo}
            </Link>
          ))}
        </div>
      </nav>
      <CadastroCrud key={atual.slug} config={atual} podeEditar={podeEditarCadastro(perfis, atual)} />
    </>
  );
}
