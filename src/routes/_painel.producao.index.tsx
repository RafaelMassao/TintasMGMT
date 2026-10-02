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
import { LoteForm, selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import {
  type Lote,
  SELECT_LOTE,
  STATUS_INFO,
  STATUS_LOTE,
  fmtData,
  fmtLitros,
  fmtNum,
  nomeTanque,
  opcoesProducao,
  podeOperarProducao,
  traduzirErroProducao,
} from "@/lib/producao";

export const Route = createFileRoute("/_painel/producao/")({
  head: () => ({
    meta: [
      { title: "Produção — Tintas Gestão" },
      { name: "description", content: "Lotes de produção, status e acompanhamento." },
      { property: "og:title", content: "Produção — Tintas Gestão" },
      { property: "og:description", content: "Lotes de produção, status e acompanhamento." },
    ],
  }),
  component: ProducaoPage,
});

const POR_PAGINA = 10;

function ProducaoPage() {
  const { perfis } = Route.useRouteContext();
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const [buscaDeb, setBuscaDeb] = useState("");
  const [f, setF] = useState({ de: "", ate: "", produto: "", cor: "", tanque: "", status: "" });
  const [pagina, setPagina] = useState(0);
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca.trim()), 300);
    return () => clearTimeout(t);
  }, [busca]);
  useEffect(() => setPagina(0), [buscaDeb, f]);

  const opcoes = useQuery({ queryKey: ["opcoes", "producao"], queryFn: opcoesProducao });

  const lista = useQuery({
    queryKey: ["lotes", buscaDeb, f, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from("lotes_producao").select(SELECT_LOTE, { count: "exact" });
      if (buscaDeb) q = q.ilike("numero_lote", `%${buscaDeb}%`);
      if (f.de) q = q.gte("data_planejada", f.de);
      if (f.ate) q = q.lte("data_planejada", f.ate);
      if (f.produto) q = q.eq("produto_id", f.produto);
      if (f.cor) q = q.eq("produtos.cor_id", f.cor);
      if (f.tanque) q = q.eq("tanque_id", f.tanque);
      if (f.status) q = q.eq("status", f.status);
      const { data, error, count } = await q
        .order("data_planejada", { ascending: false, nullsFirst: false })
        .order("criado_em", { ascending: false })
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Lote[], total: count ?? 0 };
    },
  });

  useEffect(() => {
    if (lista.error) notify.error("Não foi possível carregar os lotes", traduzirErroProducao(lista.error.message));
  }, [lista.error]);

  const colunas: Column<Lote>[] = [
    { key: "lote", header: "Lote", primary: true, cell: (l) => <span className="font-semibold">{l.numero_lote}</span> },
    { key: "produto", header: "Produto", cell: (l) => (l.produtos ? `${l.produtos.codigo} — ${l.produtos.nome}` : "—") },
    { key: "cor", header: "Cor", hideOnMobile: true, cell: (l) => l.produtos?.cores?.nome ?? "—" },
    { key: "tanque", header: "Tanque", hideOnMobile: true, cell: nomeTanque },
    { key: "data", header: "Data planejada", cell: (l) => fmtData(l.data_planejada) },
    { key: "qtd", header: "Planej. / Prod.", hideOnMobile: true, cell: (l) => `${fmtNum(l.quantidade_planejada)} / ${fmtNum(l.quantidade_produzida)}` },
    { key: "vol", header: "Volume", hideOnMobile: true, cell: (l) => fmtLitros(l.volume_planejado_litros) },
    { key: "status", header: "Status", cell: (l) => <StatusBadge tone={STATUS_INFO[l.status].tone}>{STATUS_INFO[l.status].label}</StatusBadge> },
  ];

  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = !!buscaDeb || Object.values(f).some(Boolean);
  const sel = (k: keyof typeof f, label: string, opts: { value: string; label: string }[]) => (
    <select aria-label={label} className={selectClass} value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))}>
      <option value="">{label}: todos</option>
      {opts.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Produção"
        description="Lotes de produção, status e acompanhamento."
        actions={
          podeOperarProducao(perfis) && (
            <Button onClick={() => setNovo(true)}>
              <Plus className="h-4 w-4" /> Novo lote
            </Button>
          )
        }
      />

      <div className="space-y-3 rounded-lg border bg-card p-3">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por número do lote..." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Input type="date" aria-label="Data inicial" value={f.de} onChange={(e) => setF((s) => ({ ...s, de: e.target.value }))} />
          <Input type="date" aria-label="Data final" value={f.ate} onChange={(e) => setF((s) => ({ ...s, ate: e.target.value }))} />
          {sel("produto", "Produto", opcoes.data?.produtos ?? [])}
          {sel("cor", "Cor", opcoes.data?.cores ?? [])}
          {sel("tanque", "Tanque", opcoes.data?.tanques ?? [])}
          {sel("status", "Status", STATUS_LOTE.map((s) => ({ value: s, label: STATUS_INFO[s].label })))}
        </div>
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={() => { setBusca(""); setF({ de: "", ate: "", produto: "", cor: "", tanque: "", status: "" }); }}>
            Limpar filtros
          </Button>
        )}
      </div>

      <DataTable
        columns={colunas}
        rows={lista.data?.rows ?? []}
        getRowId={(l) => l.id}
        loading={lista.isLoading}
        emptyTitle={temFiltro ? "Nenhum lote encontrado" : "Nenhum lote cadastrado"}
        emptyDescription={temFiltro ? "Tente mudar a busca ou os filtros." : "Crie o primeiro lote de produção."}
        rowActions={(l) => (
          <Button asChild variant="ghost" size="sm">
            <Link to="/producao/$id" params={{ id: l.id }}>
              <Eye className="h-4 w-4" /> Ver
            </Link>
          </Button>
        )}
      />

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} lote(s) — página {pagina + 1} de {paginas}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}

      {novo && (
        <LoteForm lote={null} open={novo} onOpenChange={setNovo} onSalvo={(id) => navigate({ to: "/producao/$id", params: { id } })} />
      )}
    </div>
  );
}
