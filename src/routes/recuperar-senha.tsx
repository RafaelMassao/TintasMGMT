import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { traduzirErroAuth } from "@/lib/auth-errors";
import { MailCheck } from "lucide-react";

export const Route = createFileRoute("/recuperar-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — Tintas Gestão" },
      { name: "description", content: "Recuperação de senha do sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Recuperar senha — Tintas Gestão" },
      { property: "og:description", content: "Recuperação de senha do sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
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
            <h2 className="mt-4 font-display text-xl font-bold">Verifique seu e-mail</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá um link para
              criar uma nova senha.
            </p>
            <Button asChild className="mt-6 w-full">
              <Link to="/login">Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold">Recuperar senha</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe seu e-mail para receber o link de redefinição.
            </p>
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
              {erro && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}
              <Button type="submit" className="w-full" loading={carregando} disabled={carregando}>
                Enviar link
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Lembrou a senha?{" "}
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
