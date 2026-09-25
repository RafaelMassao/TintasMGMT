import { Link } from "@tanstack/react-router";
import { navItems } from "./nav-items";
import { Brand } from "./Brand";
import { cn } from "@/lib/utils";

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={cn(
            "group flex items-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          )}
          activeProps={{
            className:
              "!border-sidebar-primary bg-sidebar-accent !text-sidebar-accent-foreground",
          }}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
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
  );
}
