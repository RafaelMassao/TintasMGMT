import { useState } from "react";
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { traduzirErroAuth } from "@/lib/auth-errors";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Tintas Gestão" },
      { name: "description", content: "Acesso ao sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Entrar — Tintas Gestão" },
      { property: "og:description", content: "Acesso ao sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro(traduzirErroAuth(error.message));
      return;
    }
    navigate({ to: "/dashboard" });
  }

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
          <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
            <FormField id="email" label="E-mail">
              <Input
                id="email"
                type="email"
                placeholder="nome@empresa.com.br"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </FormField>
            <FormField id="senha" label="Senha">
              <Input
                id="senha"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </FormField>
            {erro && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
            <Button type="submit" className="w-full" loading={carregando} disabled={carregando}>
              Entrar
            </Button>
          </form>
          <div className="mt-4 flex flex-col gap-2 text-center text-sm">
            <Link to="/recuperar-senha" className="text-primary hover:underline">
              Esqueci minha senha
            </Link>
            <p className="text-muted-foreground">
              Ainda não tem acesso?{" "}
              <Link to="/cadastro" className="font-medium text-primary hover:underline">
                Criar conta
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
