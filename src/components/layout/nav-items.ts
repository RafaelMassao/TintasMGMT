import {
  LayoutDashboard,
  Factory,
  ClipboardList,
  Package,
  Boxes,
  ShoppingCart,
  TriangleAlert,
  Clock3,
  Wrench,
  FileBarChart,
  FolderCog,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  to:
    | "/dashboard"
    | "/producao"
    | "/envase"
    | "/pedidos"
    | "/estoque"
    | "/compras"
    | "/perdas"
    | "/atrasos"
    | "/manutencao"
    | "/relatorios"
    | "/cadastros"
    | "/configuracoes";
  label: string;
  icon: LucideIcon;
  /** Aparece na barra inferior do celular */
  mobile?: boolean;
};

export const navItems: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { to: "/producao", label: "Produção", icon: Factory, mobile: true },
  { to: "/envase", label: "Envase", icon: Package, mobile: true },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList, mobile: true },
  { to: "/estoque", label: "Estoque", icon: Boxes, mobile: true },
  { to: "/compras", label: "Compras", icon: ShoppingCart },
  { to: "/perdas", label: "Perdas", icon: TriangleAlert },
  { to: "/atrasos", label: "Atrasos e Ocorrências", icon: Clock3 },
  { to: "/manutencao", label: "Manutenção", icon: Wrench },
  { to: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { to: "/cadastros", label: "Cadastros", icon: FolderCog },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];
