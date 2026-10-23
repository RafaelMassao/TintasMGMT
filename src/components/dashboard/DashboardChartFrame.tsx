import type { ReactNode } from "react";
import { ChartCard } from "@/components/shared/ChartCard";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Erro não identificado ao consultar o Supabase.";
}

export function DashboardChartFrame({
  title,
  subtitle,
  loading,
  error,
  hasData,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  loading: boolean;
  error?: unknown;
  hasData: boolean;
  children: ReactNode;
}) {
  return (
    <ChartCard title={title} {...(subtitle ? { subtitle } : {})}>
      {loading ? (
        <div
          className="flex h-full items-center justify-center text-sm text-muted-foreground"
          role="status"
        >
          Carregando dados reais…
        </div>
      ) : error ? (
        <div
          className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-sm"
          role="alert"
        >
          <span className="font-medium text-destructive">
            Não foi possível carregar este gráfico.
          </span>
          <span className="max-w-full break-words text-xs text-muted-foreground">
            {errorMessage(error)}
          </span>
        </div>
      ) : !hasData ? (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
          Sem dados para o período e filtros selecionados.
        </div>
      ) : (
        children
      )}
    </ChartCard>
  );
}
