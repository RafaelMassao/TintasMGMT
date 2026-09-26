import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { EmptyState } from "./EmptyState";
import { TableSkeleton } from "./Skeletons";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Oculta a coluna na visualização em cartões (celular) */
  hideOnMobile?: boolean;
  /** Destaca como título do cartão no celular */
  primary?: boolean;
};

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription,
  emptyAction,
  rowActions,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  rowActions?: (row: T) => ReactNode;
}) {
  if (loading) return <TableSkeleton columns={Math.min(columns.length, 5)} />;
  if (rows.length === 0)
    return <EmptyState compact title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);

  return (
    <>
      {/* Celular: cartões empilhados */}
      <ul className="space-y-2 sm:hidden">
        {rows.map((row) => (
          <li key={getRowId(row)} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-medium">{primary.cell(row)}</div>
              {rowActions && <div className="shrink-0">{rowActions(row)}</div>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {rest.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {c.header}
                  </dt>
                  <dd className="mt-0.5 truncate">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {/* Tablet e desktop: tabela */}
      <div className="hidden overflow-x-auto rounded-lg border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn("h-10 text-[11px] font-semibold uppercase tracking-wider", c.className)}
                >
                  {c.header}
                </TableHead>
              ))}
              {rowActions && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowId(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn("py-3", c.className)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
                {rowActions && <TableCell className="py-2 text-right">{rowActions(row)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
