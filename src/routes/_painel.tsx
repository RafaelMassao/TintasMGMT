import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { podeAcessar, type Perfil } from "@/lib/permissoes";

export const Route = createFileRoute("/_painel")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
    const { data: linhas } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const perfis = ((linhas ?? []) as { role: Perfil }[]).map((l) => l.role);
    if (!podeAcessar(perfis, location.pathname)) throw redirect({ to: "/sem-acesso" });
    return { user: data.user, perfis };
  },
  component: PainelLayout,
});

function PainelLayout() {
  const { user } = Route.useRouteContext();
  const nome =
    (user.user_metadata?.["nome"] as string | undefined) ?? user.email?.split("@")[0] ?? "Usuário";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader userName={nome} userEmail={user.email ?? ""} />
          <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8">
            <Outlet />
          </main>
        </div>
        <MobileNav />
      </div>
    </TooltipProvider>
  );
}
