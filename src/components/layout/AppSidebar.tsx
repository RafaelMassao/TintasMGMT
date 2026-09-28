import { Link } from "@tanstack/react-router";
import { useNavPermitida } from "./use-nav-permitida";
import { Brand } from "./Brand";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const linkBase =
  "group flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";
const linkActive = "!border-sidebar-primary bg-sidebar-accent !text-sidebar-accent-foreground";

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const navItems = useNavPermitida();
  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => (
        <Link key={item.to} to={item.to} onClick={onNavigate} className={linkBase} activeProps={{ className: linkActive }}>
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Tablet: trilho só com ícones. Desktop: menu completo. */
export function AppSidebar() {
  const navItems = useNavPermitida();
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 md:flex lg:hidden">
        <div className="mb-3 grid h-10 w-10 grid-cols-2 gap-0.5 rounded-md bg-sidebar-accent p-1">
          <span className="rounded-sm bg-sidebar-primary" />
          <span className="rounded-sm bg-chart-3" />
          <span className="rounded-sm bg-sidebar-foreground/80" />
          <span className="rounded-sm bg-chart-5" />
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  aria-label={item.label}
                  className="grid h-10 w-10 place-items-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{ className: "!bg-sidebar-accent !text-sidebar-primary" }}
                >
                  <item.icon className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </nav>
      </aside>

      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-16 items-center border-b border-sidebar-border px-4 text-sidebar-accent-foreground">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList />
        </div>
        <div className="border-t border-sidebar-border p-4 text-xs text-sidebar-foreground/60">
          v0.1 · ambiente de desenvolvimento
        </div>
      </aside>
    </>
  );
}
