import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Eye, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/producao/LoteForm";
import { PedidoForm } from "@/components/pedidos/PedidoForm";
import { notify } from "@/lib/notify";
import { fmtData } from "@/lib/producao";
import {
  type Pedido,
  SELECT_PEDIDO,
  STATUS_PEDIDO,
  STATUS_PEDIDO_INFO,
  diasAtraso,
  fmtMoeda,
  hojeISO,
  podeOperarPedidos,
  statusEfetivo,
  traduzirErroPedido,
} from "@/lib/pedidos";

export const Route = createFileRoute("/_painel/pedidos/")({
  head: () => ({
    meta: [
      { title: "Pedidos — Tintas Gestão" },
      { name: "description", content: "Pedidos de venda, itens, prazos e entregas." },
      { property: "og:title", content: "Pedidos — Tintas Gestão" },
      { property: "og:description", content: "Pedidos de venda, itens, prazos e entregas." },
    ],
  }),
  component: PedidosPage,
});

const POR_PAGINA = 10;
const vazio = { de: "", ate: "", status: "" };

function PedidosPage() {
  const { perfis } = Route.useRouteContext();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [f, setF] = useState(vazio);
  const [pagina, setPagina] = useState(0);
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca.trim().replace(/[,()%]/g, " ")), 300);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(0), [buscaDeb, f]);

  const lista = useQuery({
    queryKey: ["pedidos", buscaDeb, f, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("pedidos").select(SELECT_PEDIDO, { count: "exact" });
      if (buscaDeb) {
        const { data: cli } = await supabase.from("clientes").select("id").ilike("nome", `%${buscaDeb}%`).limit(50);
        const ids = (cli ?? []).map((c) => c.id);
        q = ids.length
          ? q.or(`numero.ilike.%${buscaDeb}%,cliente_id.in.(${ids.join(",")})`)
          : q.ilike("numero", `%${buscaDeb}%`);
      }
      if (f.de) q = q.gte("data_pedido", f.de);
      if (f.ate) q = q.lte("data_pedido", f.ate);
      if (f.status === "atrasado") {
        q = q.or(`status.eq.atrasado,and(prazo_prometido.lt.${hojeISO()},status.not.in.(entregue,cancelado))`);
      } else if (f.status) {
        q = q.eq("status", f.status);
        if (f.status !== "entregue" && f.status !== "cancelado")
          q = q.or(`prazo_prometido.is.null,prazo_prometido.gte.${hojeISO()}`);
      }
      const { data, error, count } = await q
        .order("data_pedido", { ascending: false })
        .order("criado_em", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Pedido[], total: count ?? 0 };
    },
  });

  useEffect(() => {
    if (lista.error) notify.error("Não foi possível carregar os pedidos", traduzirErroPedido(lista.error.message));
  }, [lista.error]);

  const colunas: Column<Pedido>[] = [
    { key: "numero", header: "Pedido", primary: true, cell: (p) => <span className="font-semibold">{p.numero}</span> },
    { key: "cliente", header: "Cliente", cell: (p) => p.clientes?.nome ?? "—" },
    { key: "data", header: "Data", hideOnMobile: true, cell: (p) => fmtData(p.data_pedido) },
    {
      key: "prazo",
      header: "Prazo",
      cell: (p) => {
        const d = diasAtraso(p);
        return (
          <span className={d ? "font-semibold text-destructive" : ""}>
            {fmtData(p.prazo_prometido)}
            {d > 0 && ` (${d} dia${d > 1 ? "s" : ""} de atraso)`}
          </span>
        );
      },
    },
    { key: "valor", header: "Valor", cell: (p) => fmtMoeda(p.valor_total) },
    {
      key: "status",
      header: "Status",
      cell: (p) => {
        const s = statusEfetivo(p);
        return <StatusBadge tone={STATUS_PEDIDO_INFO[s].tone}>{STATUS_PEDIDO_INFO[s].label}</StatusBadge>;
      },
    },
  ];

  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = !!buscaDeb || Object.values(f).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pedidos"
        description="Pedidos de venda, itens, prazos e entregas."
        actions={
          podeOperarPedidos(perfis) && (
            <Button onClick={() => setNovo(true)}>
              <Plus className="h-4 w-4" /> Novo pedido
            </Button>
          )
        }
      />

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número ou cliente..." />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input type="date" aria-label="Data inicial" value={f.de} onChange={(e) => setF((s) => ({ ...s, de: e.target.value }))} />
          <Input type="date" aria-label="Data final" value={f.ate} onChange={(e) => setF((s) => ({ ...s, ate: e.target.value }))} />
          <select aria-label="Status" className={selectClass} value={f.status} onChange={(e) => setF((s) => ({ ...s, status: e.target.value }))}>
            <option value="">Status: todos</option>
            {STATUS_PEDIDO.map((s) => <option key={s} value={s}>{STATUS_PEDIDO_INFO[s].label}</option>)}
          </select>
        </div>
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setF(vazio); }}>Limpar filtros</Button>
        )}
      </div>

      <DataTable
        columns={colunas}
        rows={lista.data?.rows ?? []}
        getRowId={(p) => p.id}
        loading={lista.isLoading}
        emptyTitle={temFiltro ? "Nenhum pedido encontrado" : "Nenhum pedido cadastrado"}
        emptyDescription={temFiltro ? "Tente mudar a busca ou os filtros." : "Crie o primeiro pedido."}
        rowActions={(p) => (
          <Button asChild variant="ghost" size="sm">
            <Link to="/pedidos/$id" params={{ id: p.id }}><Eye className="h-4 w-4" /> Ver</Link>
          </Button>
        )}
      />

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} pedido(s) — página {pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      {novo && <PedidoForm pedido={null} open={novo} onOpenChange={setNovo} onSalvo={(id) => navigate({ to: "/pedidos/$id", params: { id } })} />}
    </div>
  );
}
