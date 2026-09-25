import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="grid h-9 w-9 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-md p-1 bg-sidebar-accent">
        <span className="rounded-sm bg-sidebar-primary" />
        <span className="rounded-sm bg-chart-3" />
        <span className="rounded-sm bg-sidebar-foreground/80" />
        <span className="rounded-sm bg-chart-5" />
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate font-display text-base font-bold tracking-tight">Tintas Gestão</p>
        <p className="truncate text-[11px] uppercase tracking-widest opacity-60">Sistema industrial</p>
      </div>
    </div>
  );
}
