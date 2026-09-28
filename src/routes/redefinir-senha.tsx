import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { traduzirErroAuth } from "@/lib/auth-errors";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — Tintas Gestão" },
      { name: "description", content: "Definição de nova senha no sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Redefinir senha — Tintas Gestão" },
      { property: "og:description", content: "Definição de nova senha no sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha !== confirmacao) {
      setErro("As senhas não coincidem. Digite novamente.");
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      setErro(traduzirErroAuth(error.message));
      return;
    }
    notify.success("Senha redefinida com sucesso!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <Brand className="mb-8 text-primary" />
        <h2 className="font-display text-2xl font-bold">Nova senha</h2>
        <p className="mt-1 text-sm text-muted-foreground">Escolha uma nova senha para sua conta.</p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <FormField id="senha" label="Nova senha" hint="Mínimo de 6 caracteres.">
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
          <FormField id="confirmacao" label="Confirmar senha">
            <Input
              id="confirmacao"
              type="password"
              placeholder="••••••••"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
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
            Salvar nova senha
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
