import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brand } from "./Brand";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { useAlertas } from "@/lib/alertas/useAlertas";
import type { Perfil } from "@/lib/permissoes";

type Props = {
  userName: string;
  userEmail: string;
  perfis: Perfil[];
};

export function AppHeader({ userName, userEmail, perfis }: Props) {
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);
  const alertasQuery = useAlertas(perfis);
  const naoLidos = alertasQuery.data?.filter((a) => !a.lido_em).length ?? 0;
  const recentes = alertasQuery.data?.filter((a) => !a.lido_em).slice(0, 5) ?? [];

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function abrirAlerta(id: string) {
    try {
      await alertasQuery.marcarComoLido(id);
    } catch {
      notify.error("Não foi possível atualizar o status do alerta.");
    }
    navigate({ to: "/alertas" });
  }

  async function handleLogout() {
    setSaindo(true);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSaindo(false);
      notify.error("Não foi possível sair. Tente novamente.");
      return;
    }
    navigate({ to: "/login", replace: true });
  }

  return (
    <header className="sticky top-0 z-30 grid h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b bg-card px-4 lg:px-6">
      <div className="min-w-0">
        <Brand className="text-primary md:hidden" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={`Alertas: ${naoLidos} não lidos`}
            >
              <Bell className="h-5 w-5" />
              {naoLidos > 0 && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-5 text-destructive-foreground">
                  {naoLidos > 99 ? "99+" : naoLidos}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Alertas</span>
              <span className="text-xs font-normal text-muted-foreground">
                {naoLidos} não lidos
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {alertasQuery.isError ? (
              <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                Não foi possível consultar os alertas. Verifique a migration manual.
              </DropdownMenuItem>
            ) : recentes.length ? (
              recentes.map((alerta) => (
                <DropdownMenuItem
                  key={alerta.id}
                  className="cursor-pointer items-start py-2"
                  onSelect={(event) => {
                    event.preventDefault();
                    void abrirAlerta(alerta.id);
                  }}
                >
                  <span className="mr-2 mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{alerta.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {alerta.descricao}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled className="text-sm text-muted-foreground">
                Nenhum alerta não lido.
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/alertas" className="cursor-pointer justify-center font-medium">
                Ver central de alertas
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="hidden items-center gap-2.5 border-l pl-3 sm:flex">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="leading-tight">
            <p className="text-sm font-semibold">{userName}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Sair"
          onClick={handleLogout}
          loading={saindo}
          disabled={saindo}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
