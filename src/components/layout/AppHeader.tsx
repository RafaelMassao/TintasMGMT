import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
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

type Props = {
  userName: string;
  userEmail: string;
};

export function AppHeader({ userName, userEmail }: Props) {
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);

  const initials = userName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
            <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
              <Bell className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-sm text-muted-foreground">
              Nenhuma notificação no momento.
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
