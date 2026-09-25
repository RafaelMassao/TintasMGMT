import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Brand } from "@/components/layout/Brand";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Tintas Gestão" },
      { name: "description", content: "Acesso ao sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Entrar — Tintas Gestão" },
      { property: "og:description", content: "Acesso ao sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-accent-foreground lg:flex">
        <Brand />
        <div className="relative z-10 max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sidebar-primary">Gestão industrial</p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight">
            Produção, estoque e manutenção em um só lugar.
          </h1>
          <p className="mt-4 text-sm text-sidebar-foreground/70">
            Uso interno — administradores, gestores, produção, estoque, vendas e manutenção.
          </p>
        </div>
        <div className="flex h-3 overflow-hidden rounded-sm">
          <span className="flex-1 bg-chart-1" />
          <span className="flex-1 bg-chart-3" />
          <span className="flex-1 bg-chart-4" />
          <span className="flex-1 bg-chart-5" />
          <span className="flex-1 bg-sidebar-primary" />
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Brand className="mb-8 text-primary lg:hidden" />
          <h2 className="font-display text-2xl font-bold">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use suas credenciais corporativas.</p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              // Autenticação real será conectada ao Supabase depois.
              navigate({ to: "/dashboard" });
            }}
          >
            <FormField id="email" label="E-mail">
              <Input id="email" type="email" placeholder="nome@empresa.com.br" autoComplete="email" />
            </FormField>
            <FormField id="senha" label="Senha">
              <Input id="senha" type="password" placeholder="••••••••" autoComplete="current-password" />
            </FormField>
            <Button type="submit" className="w-full">
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
