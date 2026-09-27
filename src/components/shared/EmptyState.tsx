import { PackageOpen, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = PackageOpen,
  compact = false,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  icon?: LucideIcon;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed bg-card px-6 text-center",
        compact ? "py-10" : "py-16",
      )}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
