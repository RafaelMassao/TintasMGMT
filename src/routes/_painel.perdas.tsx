import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, DollarSign, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { selectClass } from "@/components/producao/LoteForm";
import { supabase } from "@/integrations/supabase/client";
import {
  PerdaForm,
  ETAPAS_PERDA,
  type ItemOpcao,
  type OpcaoSimples,
} from "@/components/perdas/PerdaForm";

export const Route = createFileRoute("/_painel/perdas")({
  head: () => ({
    meta: [
      { title: "Perdas — Tintas Gestão" },
      { name: "description", content: "Registro, rastreabilidade e indicadores de perdas." },
      { property: "og:title", content: "Perdas — Tintas Gestão" },
      { property: "og:description", content: "Indicadores de perdas de produção e estoque." },
    ],
  }),
  component: PerdasPage,
});

type PerdaRow = {
  id: string;
  data: string;
  item_tipo: "material" | "produto" | "embalagem";
  material_id: string | null;
  produto_id: string | null;
  embalagem_id: string | null;
  embalagem_referencia_id: string | null;
  cor_id: string | null;
  lote: string | null;
  etapa: string;
  motivo: string;
  quantidade: number | string;
  unidade: string;
  valor_estimado: number | string;
  observacao: string | null;
  responsavel_id: string;
  responsavel_nome?: string | null;
  gera_movimentacao_estoque: boolean;
};

type CadastroItem = ItemOpcao & { cor_id?: string | null; embalagem_id?: string | null };

const hoje = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const primeiroDiaMes = () => `${hoje().slice(0, 7)}-01`;
const etapaLabel = (value: string) => ETAPAS_PERDA.find((e) => e.value === value)?.label ?? value;
const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const qtdFmt = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);

function PerdasPage() {
  const { perfis } = Route.useRouteContext();
  const podeRegistrar = perfis.some((p) => ["administrador", "gestor", "producao"].includes(p));
  const [open, setOpen] = useState(false);
  const [de, setDe] = useState(primeiroDiaMes());
  const [ate, setAte] = useState(hoje());
  const [etapa, setEtapa] = useState("todas");
  const [motivoFiltro, setMotivoFiltro] = useState("todos");
  const [itemFiltro, setItemFiltro] = useState("todos");
  const [corFiltro, setCorFiltro] = useState("todos");
  const [busca, setBusca] = useState("");
  const catalogos = useQuery({
    queryKey: ["perdas-cadastros"],
    queryFn: async () => {
      const [mat, prod, emb, cores, user, profile] = await Promise.all([
        supabase
          .from("materiais")
          .select("id,codigo,nome,unidades_medida(sigla)")
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("produtos")
          .select("id,codigo,nome,cor_id,embalagem_id,unidades_medida(sigla)")
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("embalagens")
          .select("id,codigo,nome,unidades_medida(sigla)")
          .eq("ativo", true)
          .order("nome"),
        supabase.from("cores").select("id,nome").eq("ativo", true).order("nome"),
        supabase.auth.getUser(),
        supabase.from("profiles").select("nome,email").maybeSingle(),
      ]);
      const problem = [mat, prod, emb, cores].find((r) => r.error);
      if (problem?.error) throw problem.error;
      const mapRows = (data: unknown): CadastroItem[] =>
        ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
          id: String(r["id"]),
          codigo: r["codigo"] as string | null,
          nome: String(r["nome"]),
          unidade: (r["unidades_medida"] as { sigla?: string } | null)?.sigla ?? "",
          cor_id: r["cor_id"] as string | null,
          embalagem_id: r["embalagem_id"] as string | null,
        }));
      const u = user.data.user;
      const p = profile.data as { nome?: string | null; email?: string | null } | null;
      return {
        materiais: mapRows(mat.data),
        produtos: mapRows(prod.data),
        embalagens: mapRows(emb.data),
        cores: (cores.data ?? []) as OpcaoSimples[],
        responsavel: p?.nome?.trim() || p?.email || u?.email || "Usuário autenticado",
      };
    },
  });

  const perdas = useQuery({
    queryKey: ["perdas", de, ate],
    enabled: Boolean(de && ate && de <= ate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("perdas")
        .select(
          "id,data,item_tipo,material_id,produto_id,embalagem_id,embalagem_referencia_id,cor_id,lote,etapa,motivo,quantidade,unidade,valor_estimado,observacao,responsavel_id,responsavel_nome,gera_movimentacao_estoque",
        )
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: false })
        .limit(3000);
      if (error) throw error;
      return (data ?? []) as unknown as PerdaRow[];
    },
  });

  const itemsByType = useMemo(
    () => ({
      material: new Map((catalogos.data?.materiais ?? []).map((i) => [i.id, i])),
      produto: new Map((catalogos.data?.produtos ?? []).map((i) => [i.id, i])),
      embalagem: new Map((catalogos.data?.embalagens ?? []).map((i) => [i.id, i])),
    }),
    [catalogos.data],
  );
  const cores = useMemo(
    () => new Map((catalogos.data?.cores ?? []).map((c) => [c.id, c.nome])),
    [catalogos.data],
  );
  const resolveItem = useCallback(
    (r: PerdaRow) => {
      const id = r.material_id ?? r.produto_id ?? r.embalagem_id;
      return (id && itemsByType[r.item_tipo].get(id)?.nome) || "Item arquivado";
    },
    [itemsByType],
  );

  const motivos = useMemo(
    () =>
      [...new Set((perdas.data ?? []).map((r) => r.motivo))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [perdas.data],
  );
  const filtered = useMemo(
    () =>
      de && ate && de > ate
        ? []
        : (perdas.data ?? []).filter((r) => {
            const item = resolveItem(r);
            const q = busca.trim().toLocaleLowerCase("pt-BR");
            return (
              (etapa === "todas" || r.etapa === etapa) &&
              (motivoFiltro === "todos" || r.motivo === motivoFiltro) &&
              (itemFiltro === "todos" ||
                r.item_tipo + ":" + (r.material_id ?? r.produto_id ?? r.embalagem_id) ===
                  itemFiltro) &&
              (corFiltro === "todos" || r.cor_id === corFiltro) &&
              (!q ||
                `${item} ${r.motivo} ${r.lote ?? ""} ${r.observacao ?? ""}`
                  .toLocaleLowerCase("pt-BR")
                  .includes(q))
            );
          }),
    [perdas.data, etapa, motivoFiltro, itemFiltro, corFiltro, busca, resolveItem, de, ate],
  );

  const groupTop = useCallback(
    (keyOf: (r: PerdaRow) => string) => {
      const grouped = new Map<string, { count: number; value: number }>();
      for (const row of filtered) {
        const key = keyOf(row) || "Não informado";
        const entry = grouped.get(key) ?? { count: 0, value: 0 };
        entry.count += 1;
        entry.value += Number(row.valor_estimado || 0);
        grouped.set(key, entry);
      }
      return [...grouped.entries()]
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.value - a.value || b.count - a.count)
        .slice(0, 5);
    },
    [filtered],
  );
  const topEtapas = useMemo(() => groupTop((r) => etapaLabel(r.etapa)), [groupTop]);
  const topProdutos = useMemo(() => groupTop((r) => resolveItem(r)), [groupTop, resolveItem]);
  const topCores = useMemo(
    () => groupTop((r) => (r.cor_id ? (cores.get(r.cor_id) ?? "Cor arquivada") : "Não informada")),
    [groupTop, cores],
  );
  const topMotivos = useMemo(() => groupTop((r) => r.motivo), [groupTop]);
  const totalValor = filtered.reduce((sum, r) => sum + Number(r.valor_estimado || 0), 0);
  const baixas = filtered.filter((r) => r.gera_movimentacao_estoque).length;
  const invalidPeriod = Boolean(de && ate && de > ate);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Perdas"
        description="Registre ocorrências, acompanhe o impacto estimado e filtre por período e dimensão."
        actions={
          podeRegistrar ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Registrar perda
            </Button>
          ) : undefined
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric
          icon={ClipboardList}
          label="Registros no período"
          value={invalidPeriod ? "—" : String(filtered.length)}
          hint="Após aplicar os filtros"
        />
        <Metric
          icon={DollarSign}
          label="Valor estimado"
          value={invalidPeriod ? "—" : brl(totalValor)}
          hint="Soma dos registros filtrados"
        />
        <Metric
          icon={AlertTriangle}
          label="Baixas de estoque"
          value={invalidPeriod ? "—" : String(baixas)}
          hint="Movimentações de saída por perda vinculadas"
        />
      </div>
      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold">Indicadores por dimensão</h2>
            <p className="text-xs text-muted-foreground">
              Top 5 por valor estimado, respeitando os filtros ativos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="space-y-1 text-xs text-muted-foreground">
              De
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Até
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
          </div>
        </div>
        {invalidPeriod && (
          <p role="alert" className="text-sm text-destructive">
            A data inicial deve ser anterior ou igual à data final.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Breakdown title="Etapa" rows={topEtapas} />
          <Breakdown title="Produto/material" rows={topProdutos} />
          <Breakdown title="Cor" rows={topCores} />
          <Breakdown title="Motivo" rows={topMotivos} />
        </div>
      </section>
      <Tabs defaultValue="historico">
        <TabsList>
          <TabsTrigger value="historico">Histórico ({filtered.length})</TabsTrigger>
          <TabsTrigger value="analise">Filtros e análise</TabsTrigger>
        </TabsList>
        <TabsContent value="historico" className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar item, lote ou motivo..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <select
              aria-label="Filtrar etapa"
              className={selectClass}
              value={etapa}
              onChange={(e) => setEtapa(e.target.value)}
            >
              <option value="todas">Todas as etapas</option>
              {ETAPAS_PERDA.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar item"
              className={selectClass}
              value={itemFiltro}
              onChange={(e) => setItemFiltro(e.target.value)}
            >
              <option value="todos">Todos os itens</option>
              {[
                ...(catalogos.data?.materiais ?? []).map((i) => ({ ...i, tipo: "material" })),
                ...(catalogos.data?.produtos ?? []).map((i) => ({ ...i, tipo: "produto" })),
                ...(catalogos.data?.embalagens ?? []).map((i) => ({ ...i, tipo: "embalagem" })),
              ].map((i) => (
                <option key={`${i.tipo}:${i.id}`} value={`${i.tipo}:${i.id}`}>
                  {i.nome}
                </option>
              ))}
            </select>
            <select
              aria-label="Filtrar cor"
              className={selectClass}
              value={corFiltro}
              onChange={(e) => setCorFiltro(e.target.value)}
            >
              <option value="todos">Todas as cores</option>
              {(catalogos.data?.cores ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          {motivos.length > 0 && (
            <select
              aria-label="Filtrar motivo"
              className={`${selectClass} max-w-md`}
              value={motivoFiltro}
              onChange={(e) => setMotivoFiltro(e.target.value)}
            >
              <option value="todos">Todos os motivos</option>
              {motivos.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {catalogos.isError && <ErrorBox error={catalogos.error as Error} />}
          {perdas.isError && <ErrorBox error={perdas.error as Error} />}
          {perdas.isLoading || catalogos.isLoading ? (
            <TableSkeleton rows={6} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              compact
              title="Nenhuma perda encontrada"
              description="Ajuste o período ou os filtros, ou registre uma perda para iniciar o histórico."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableHead>Data</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Cor / embalagem</TableHead>
                    <TableHead>Lote</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Valor estimado</TableHead>
                    <TableHead>Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(`${r.data}T12:00:00`).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{resolveItem(r)}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.item_tipo === "material"
                            ? "Matéria-prima/material"
                            : r.item_tipo === "produto"
                              ? "Produto"
                              : "Embalagem"}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.cor_id ? (cores.get(r.cor_id) ?? "Cor arquivada") : "—"}
                        <span className="block text-xs text-muted-foreground">
                          {r.embalagem_referencia_id
                            ? (itemsByType.embalagem.get(r.embalagem_referencia_id)?.nome ??
                              "Embalagem arquivada")
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell>{r.lote || "—"}</TableCell>
                      <TableCell>{etapaLabel(r.etapa)}</TableCell>
                      <TableCell className="max-w-48">
                        <span className="font-medium">{r.motivo}</span>
                        {r.observacao && (
                          <span
                            className="block truncate text-xs text-muted-foreground"
                            title={r.observacao}
                          >
                            {r.observacao}
                          </span>
                        )}
                        {r.gera_movimentacao_estoque && (
                          <span className="mt-1 inline-flex rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                            Baixa lançada
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {qtdFmt(Number(r.quantidade))} {r.unidade}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {brl(Number(r.valor_estimado))}
                      </TableCell>
                      <TableCell>{r.responsavel_nome || "Usuário registrado"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filtered.length >= 3000 && (
                <p className="border-t p-2 text-xs text-muted-foreground">
                  Exibindo até 3.000 registros. Reduza o período para detalhar a consulta.
                </p>
              )}
            </div>
          )}
        </TabsContent>
        <TabsContent value="analise" className="mt-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Altere os filtros no histórico para recalcular todos os indicadores. As quantidades
            permanecem separadas por unidade para evitar somas incompatíveis.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Breakdown title="Por etapa" rows={topEtapas} />
            <Breakdown title="Por produto/material" rows={topProdutos} />
            <Breakdown title="Por cor" rows={topCores} />
            <Breakdown title="Por motivo" rows={topMotivos} />
          </div>
        </TabsContent>
      </Tabs>
      <PerdaForm
        open={open}
        onOpenChange={setOpen}
        materiais={catalogos.data?.materiais ?? []}
        produtos={catalogos.data?.produtos ?? []}
        embalagens={catalogos.data?.embalagens ?? []}
        cores={catalogos.data?.cores ?? []}
        responsavel={catalogos.data?.responsavel ?? ""}
      />
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof ClipboardList;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-md border p-3">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados para o período.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="truncate" title={r.label}>
                  {r.label}
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {r.count} · {brl(r.value)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${Math.max(4, (r.value / max) * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function ErrorBox({ error }: { error: Error }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {error.message}
      <p className="mt-1 text-xs">
        Confirme se a migration supabase/perdas.sql foi executada no Supabase conectado.
      </p>
    </div>
  );
}
