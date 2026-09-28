import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useNavPermitida } from "./use-nav-permitida";
import { NavList } from "./AppSidebar";
import { Brand } from "./Brand";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const items = useNavPermitida().filter((i) => i.mobile);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-sidebar-foreground/70"
            activeProps={{ className: "!text-sidebar-primary" }}
          >
            <item.icon className="h-5 w-5" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-sidebar-foreground/70"
        >
          <Menu className="h-5 w-5" />
          Mais
        </button>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex h-16 items-center border-b border-sidebar-border px-4 text-sidebar-accent-foreground">
            <Brand />
          </div>
          <div className="p-3">
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
