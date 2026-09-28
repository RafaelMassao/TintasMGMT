import { useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { traduzirErroAuth } from "@/lib/auth-errors";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — Tintas Gestão" },
      { name: "description", content: "Cadastro de usuário no sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Criar conta — Tintas Gestão" },
      { property: "og:description", content: "Cadastro de usuário no sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: CadastroPage,
});

function CadastroPage() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, telefone },
        emailRedirectTo: window.location.origin,
      },
    });
    setCarregando(false);
    if (error) {
      setErro(traduzirErroAuth(error.message));
      return;
    }
    setEnviado(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <Brand className="mb-8 text-primary" />
        {enviado ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <MailCheck className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 font-display text-xl font-bold">Confirme seu e-mail</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Enviamos um link de confirmação para <strong>{email}</strong>. Clique no link para ativar
              sua conta e depois faça login.
            </p>
            <Button asChild className="mt-6 w-full">
              <Link to="/login">Ir para o login</Link>
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">Criar conta</h2>
            <p className="mt-1 text-sm text-muted-foreground">Cadastro de usuário interno.</p>
            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <FormField id="nome" label="Nome completo">
                <Input id="nome" placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
              </FormField>
              <FormField id="telefone" label="Telefone">
                <Input
                  id="telefone"
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </FormField>
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
              <FormField id="senha" label="Senha" hint="Mínimo de 6 caracteres.">
                <Input
                  id="senha"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  minLength={6}
                  required
                />
              </FormField>
              {erro && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}
              <Button type="submit" className="w-full" loading={carregando} disabled={carregando}>
                Criar conta
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Entrar
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
