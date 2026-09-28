import { useRouteContext } from "@tanstack/react-router";
import { navItems } from "./nav-items";
import { podeAcessar } from "@/lib/permissoes";

export function useNavPermitida() {
  const { perfis } = useRouteContext({ from: "/_painel" });
  return navItems.filter((i) => podeAcessar(perfis, i.to));
}
