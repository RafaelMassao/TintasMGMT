import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ClipboardCheck, History, PackagePlus, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge, type StatusTone } from "@/components/shared/StatusBadge";
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
import { InventarioForm } from "@/components/estoque/InventarioForm";
import { MovimentacaoForm } from "@/components/estoque/MovimentacaoForm";
import {
  coberturaSemanas,
  formatarData,
  formatarQuantidade,
  LABEL_STATUS,
  LABEL_TIPO,
  statusEstoque,
  TIPOS_MOVIMENTACAO,
  type EstoqueTipo,
  type ItemEstoque,
  type StatusEstoque,
  type TipoMovimentacao,
} from "@/lib/estoque";

export const Route = createFileRoute("/_painel/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — Tintas Gestão" },
      {
        name: "description",
        content:
          "Matérias-primas, embalagens vazias, produtos acabados, movimentações e inventário.",
      },
      { property: "og:title", content: "Estoque — Tintas Gestão" },
      {
        property: "og:description",
        content: "Controle de estoque por movimentações e inventário físico.",
      },
    ],
  }),
  component: EstoquePage,
});

type SaldoRow = {
  item_id: string;
  tipo_item: "material" | "produto" | "embalagem";
  material_id: string | null;
  produto_id: string | null;
  embalagem_id: string | null;
  saldo: number | string;
  total_movimentacoes: number | string;
};
type CadastroRow = {
  id: string;
  codigo?: string | null;
  nome: string;
  estoque_minimo?: number | string | null;
  estoque_maximo?: number | string | null;
  unidades_medida?: { sigla?: string | null } | null;
};
type ConsumoRow = {
  material_id: string | null;
  produto_id: string | null;
  embalagem_id: string | null;
  tipo_movimentacao: TipoMovimentacao;
  quantidade: number | string;
};
type MovimentacaoRow = {
  id: string;
  material_id: string | null;
  produto_id: string | null;
  embalagem_id: string | null;
  tipo_movimentacao: TipoMovimentacao;
  quantidade: number | string;
  unidade_medida: string;
  data_movimentacao: string;
  criado_em: string;
  motivo: string | null;
  usuario_id: string | null;
};

const tones: Record<StatusEstoque, StatusTone> = {
  normal: "success",
  estoque_baixo: "warning",
  estoque_critico: "danger",
  excesso: "info",
  sem_estoque: "danger",
};
const tipoMovLabel = (value: string) =>
  TIPOS_MOVIMENTACAO.find((t) => t.value === value)?.label ?? value;
const isoInicio = (dia: string) => new Date(`${dia}T00:00:00`).toISOString();
const isoFimExclusivo = (dia: string) => {
  const d = new Date(`${dia}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const dataLocal = (d: Date) => {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

function EstoquePage() {
  const { perfis } = Route.useRouteContext();
  const podeMovimentar = perfis.some((p) =>
    ["administrador", "gestor", "estoque", "producao", "vendas"].includes(p),
  );
  const podeInventariar = perfis.some((p) => ["administrador", "gestor", "estoque"].includes(p));
  const [aba, setAba] = useState("materias-primas");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [novaMovimentacao, setNovaMovimentacao] = useState(false);
  const [itemInventario, setItemInventario] = useState<ItemEstoque | null>(null);
  const hoje = dataLocal(new Date());
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const [periodoDe, setPeriodoDe] = useState(dataLocal(trintaDiasAtras));
  const [periodoAte, setPeriodoAte] = useState(hoje);
  const [buscaHistorico, setBuscaHistorico] = useState("");
  const [tipoHistorico, setTipoHistorico] = useState("todos");

  const estoque = useQuery({
    queryKey: ["estoque"],
    queryFn: async () => {
      const [materiaisResp, embalagensResp, produtosResp, saldosResp, consumoResp] =
        await Promise.all([
          supabase
            .from("materiais")
            .select("id,codigo,nome,estoque_minimo,estoque_maximo,unidades_medida(sigla)")
            .eq("ativo", true)
            .order("nome"),
          supabase
            .from("embalagens")
            .select("id,codigo,nome,estoque_minimo,estoque_maximo,unidades_medida(sigla)")
            .eq("ativo", true)
            .order("nome"),
          supabase
            .from("produtos")
            .select("id,codigo,nome,estoque_minimo,estoque_maximo,unidades_medida(sigla)")
            .eq("ativo", true)
            .order("nome"),
          supabase
            .from("v_estoque_saldo")
            .select(
              "item_id,tipo_item,material_id,produto_id,embalagem_id,saldo,total_movimentacoes",
            ),
          supabase
            .from("estoque_movimentacoes")
            .select("material_id,produto_id,embalagem_id,tipo_movimentacao,quantidade")
            .gte("data_movimentacao", new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString())
            .in("tipo_movimentacao", ["saida_producao", "saida_venda", "saida_perda"]),
        ]);
      const falha = [materiaisResp, embalagensResp, produtosResp, saldosResp, consumoResp].find(
        (r) => r.error,
      );
      if (falha?.error) throw falha.error;

      const saldos = (saldosResp.data ?? []) as unknown as SaldoRow[];
      const consumos = (consumoResp.data ?? []) as unknown as ConsumoRow[];
      const saldoMap = new Map(saldos.map((s) => [`${s.tipo_item}:${s.item_id}`, s]));
      const consumoMap = new Map<string, number>();
      for (const mov of consumos) {
        const tipo: EstoqueTipo | null = mov.material_id
          ? "material"
          : mov.produto_id
            ? "produto"
            : mov.embalagem_id
              ? "embalagem"
              : null;
        const id = mov.material_id ?? mov.produto_id ?? mov.embalagem_id;
        if (!tipo || !id) continue;
        const key = `${tipo}:${id}`;
        consumoMap.set(key, (consumoMap.get(key) ?? 0) + Number(mov.quantidade));
      }
      const mapRows = (rows: unknown, tipo: EstoqueTipo): ItemEstoque[] =>
        ((rows ?? []) as unknown as CadastroRow[]).map((row) => {
          const key = `${tipo}:${row.id}`;
          const saldo = saldoMap.get(key);
          return {
            id: row.id,
            nome: row.nome,
            codigo: row.codigo ?? null,
            tipo,
            unidade: row.unidades_medida?.sigla || (tipo === "embalagem" ? "un" : "—"),
            saldo: Number(saldo?.saldo ?? 0),
            estoqueMinimo: Number(row.estoque_minimo ?? 0),
            estoqueMaximo: Number(row.estoque_maximo ?? 0),
            consumo28Dias: consumoMap.get(key) ?? 0,
            totalMovimentacoes: Number(saldo?.total_movimentacoes ?? 0),
          };
        });
      return [
        ...mapRows(materiaisResp.data, "material"),
        ...mapRows(embalagensResp.data, "embalagem"),
        ...mapRows(produtosResp.data, "produto"),
      ];
    },
    staleTime: 15_000,
  });

  const historico = useQuery({
    queryKey: ["estoque-historico", periodoDe, periodoAte],
    enabled: aba === "movimentacoes",
    queryFn: async () => {
      if (periodoDe && periodoAte && periodoDe > periodoAte)
        throw new Error("A data inicial deve ser anterior à data final.");
      let q = supabase
        .from("estoque_movimentacoes")
        .select(
          "id,material_id,produto_id,embalagem_id,tipo_movimentacao,quantidade,unidade_medida,data_movimentacao,criado_em,motivo,usuario_id",
        )
        .order("data_movimentacao", { ascending: false })
        .limit(1000);
      if (periodoDe) q = q.gte("data_movimentacao", isoInicio(periodoDe));
      if (periodoAte) q = q.lt("data_movimentacao", isoFimExclusivo(periodoAte));
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as MovimentacaoRow[];
    },
  });

  const itens = useMemo(() => estoque.data ?? [], [estoque.data]);
  const porTipo = (tipo: EstoqueTipo) => itens.filter((item) => item.tipo === tipo);
  const ordenados = useMemo(
    () =>
      [...itens].sort((a, b) => {
        const priority: Record<StatusEstoque, number> = {
          estoque_critico: 0,
          sem_estoque: 1,
          estoque_baixo: 2,
          excesso: 3,
          normal: 4,
        };
        return (
          priority[statusEstoque(a)] - priority[statusEstoque(b)] ||
          a.nome.localeCompare(b.nome, "pt-BR")
        );
      }),
    [itens],
  );
  const alertas = itens.filter((item) =>
    ["estoque_baixo", "estoque_critico", "sem_estoque"].includes(statusEstoque(item)),
  ).length;
  const filtrados = ordenados.filter((item) => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    const correspondeBusca =
      !q || `${item.codigo ?? ""} ${item.nome}`.toLocaleLowerCase("pt-BR").includes(q);
    const status = statusEstoque(item);
    return (
      correspondeBusca &&
      (filtroStatus === "todos" || status === filtroStatus) &&
      (filtroTipo === "todos" || item.tipo === filtroTipo)
    );
  });

  const porCategoria = (tipo: EstoqueTipo) => filtrados.filter((item) => item.tipo === tipo);
  const mapaItens = useMemo(
    () => new Map(itens.map((item) => [`${item.tipo}:${item.id}`, item])),
    [itens],
  );
  const movimentosFiltrados = (historico.data ?? []).filter((mov) => {
    const tipo: EstoqueTipo = mov.material_id
      ? "material"
      : mov.produto_id
        ? "produto"
        : "embalagem";
    const id = mov.material_id ?? mov.produto_id ?? mov.embalagem_id ?? "";
    const item = mapaItens.get(`${tipo}:${id}`);
    const busca = buscaHistorico.trim().toLocaleLowerCase("pt-BR");
    const texto =
      `${item?.codigo ?? ""} ${item?.nome ?? "Item arquivado"} ${mov.motivo ?? ""}`.toLocaleLowerCase(
        "pt-BR",
      );
    return (
      (!busca || texto.includes(busca)) &&
      (tipoHistorico === "todos" || mov.tipo_movimentacao === tipoHistorico)
    );
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Estoque"
        description="Acompanhe saldos, movimentações e inventário sem editar quantidades diretamente."
        actions={
          podeMovimentar ? (
            <Button onClick={() => setNovaMovimentacao(true)}>
              <PackagePlus className="h-4 w-4" /> Registrar movimentação
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Itens acompanhados
          </p>
          <p className="mt-1 font-display text-2xl font-bold">
            {estoque.isLoading ? "—" : itens.length}
          </p>
        </div>
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Atenção necessária
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-warning-foreground">
            {estoque.isLoading ? "—" : alertas}
          </p>
          <p className="text-xs text-muted-foreground">Abaixo do mínimo ou sem estoque</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Movimentações recentes
          </p>
          <p className="mt-1 font-display text-2xl font-bold">
            {estoque.isLoading
              ? "—"
              : itens.reduce((total, item) => total + item.totalMovimentacoes, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Total registrado nos itens ativos</p>
        </div>
      </div>

      {estoque.error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-semibold text-destructive">Não foi possível carregar o estoque.</p>
          <p className="mt-1 text-muted-foreground">{(estoque.error as Error).message}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Confirme se a tabela estoque_movimentacoes e a migration
            supabase/estoque_embalagens_materiais.sql foram executadas no projeto Supabase
            conectado.
          </p>
        </div>
      )}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border bg-card p-1 sm:w-auto">
          <TabsTrigger value="materias-primas">Matéria-prima</TabsTrigger>
          <TabsTrigger value="embalagens">Embalagens vazias</TabsTrigger>
          <TabsTrigger value="produtos">Produtos acabados</TabsTrigger>
          <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
          <TabsTrigger value="inventario">Inventário</TabsTrigger>
        </TabsList>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar item ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className={`${selectClass} w-auto min-w-40`}
              aria-label="Filtrar por status"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="todos">Todos os status</option>
              {Object.entries(LABEL_STATUS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className={`${selectClass} w-auto min-w-40`}
              aria-label="Filtrar por tipo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="todos">Todos os tipos</option>
              {Object.entries(LABEL_TIPO).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <TabsContent value="materias-primas">
          <StockList
            loading={estoque.isLoading}
            items={porCategoria("material")}
            canInventory={podeInventariar}
            onCount={setItemInventario}
            emptyTitle="Nenhuma matéria-prima cadastrada"
            emptyDescription="Cadastre materiais antes de registrar entradas, saídas e inventários."
          />
        </TabsContent>
        <TabsContent value="embalagens">
          <StockList
            loading={estoque.isLoading}
            items={porCategoria("embalagem")}
            canInventory={podeInventariar}
            onCount={setItemInventario}
            emptyTitle="Nenhuma embalagem cadastrada"
            emptyDescription="As embalagens vazias precisam existir no cadastro para serem controladas no estoque."
          />
        </TabsContent>
        <TabsContent value="produtos">
          <StockList
            loading={estoque.isLoading}
            items={porCategoria("produto")}
            canInventory={podeInventariar}
            onCount={setItemInventario}
            emptyTitle="Nenhum produto acabado cadastrado"
            emptyDescription="Cadastre produtos acabados para acompanhar seu estoque."
          />
        </TabsContent>
        <TabsContent value="movimentacoes">
          <MovimentacoesPanel
            loading={historico.isLoading}
            error={historico.error as Error | null}
            rows={movimentosFiltrados}
            from={periodoDe}
            to={periodoAte}
            onFrom={setPeriodoDe}
            onTo={setPeriodoAte}
            query={buscaHistorico}
            onQuery={setBuscaHistorico}
            type={tipoHistorico}
            onType={setTipoHistorico}
            getItem={(mov) => {
              const tipo: EstoqueTipo = mov.material_id
                ? "material"
                : mov.produto_id
                  ? "produto"
                  : "embalagem";
              const id = mov.material_id ?? mov.produto_id ?? mov.embalagem_id ?? "";
              return mapaItens.get(`${tipo}:${id}`);
            }}
          />
        </TabsContent>
        <TabsContent value="inventario">
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-info/30 bg-info/5 p-3 text-sm">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <p>
              Informe a contagem física por item. O sistema compara com o saldo atual e registra a
              diferença como ajuste positivo ou negativo; o saldo nunca é editado diretamente.
            </p>
          </div>
          {!podeInventariar && (
            <p className="mb-3 text-xs text-muted-foreground">
              Seu perfil pode consultar o inventário, mas não registrar contagens.
            </p>
          )}
          <StockList
            loading={estoque.isLoading}
            items={filtrados}
            canInventory={podeInventariar}
            onCount={setItemInventario}
            emptyTitle="Nenhum item encontrado"
            emptyDescription="Ajuste os filtros ou cadastre itens para iniciar o inventário."
            inventoryMode
          />
        </TabsContent>
      </Tabs>

      {novaMovimentacao && (
        <MovimentacaoForm
          open={novaMovimentacao}
          onOpenChange={setNovaMovimentacao}
          itens={itens}
          perfis={perfis}
        />
      )}
      {itemInventario && (
        <InventarioForm
          item={itemInventario}
          onOpenChange={(open) => !open && setItemInventario(null)}
        />
      )}
    </div>
  );
}

function StockList({
  loading,
  items,
  canInventory,
  onCount,
  emptyTitle,
  emptyDescription,
  inventoryMode = false,
}: {
  loading: boolean;
  items: ItemEstoque[];
  canInventory: boolean;
  onCount: (item: ItemEstoque) => void;
  emptyTitle: string;
  emptyDescription: string;
  inventoryMode?: boolean;
}) {
  if (loading) return <TableSkeleton rows={6} />;
  if (items.length === 0)
    return <EmptyState icon={Boxes} compact title={emptyTitle} description={emptyDescription} />;

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/60 hover:bg-muted/60">
            <TableHead>Item</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead className="text-right">Saldo atual</TableHead>
            <TableHead className="text-right">Estoque mínimo</TableHead>
            <TableHead className="text-right">Estoque máximo</TableHead>
            <TableHead className="text-right">Cobertura</TableHead>
            <TableHead>Status</TableHead>
            {inventoryMode && canInventory && (
              <TableHead className="text-right">Inventário</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => {
            const status = statusEstoque(item);
            const cobertura = coberturaSemanas(item.saldo, item.consumo28Dias);
            const destacado =
              status === "estoque_baixo" ||
              status === "estoque_critico" ||
              status === "sem_estoque";
            return (
              <TableRow
                key={`${item.tipo}:${item.id}`}
                className={
                  destacado
                    ? status === "estoque_critico" || status === "sem_estoque"
                      ? "bg-destructive/5"
                      : "bg-warning/5"
                    : undefined
                }
              >
                <TableCell>
                  <div className="font-medium">{item.nome}</div>
                  {item.codigo && (
                    <div className="text-xs text-muted-foreground">{item.codigo}</div>
                  )}
                </TableCell>
                <TableCell>{LABEL_TIPO[item.tipo]}</TableCell>
                <TableCell>{item.unidade}</TableCell>
                <TableCell
                  className={`text-right font-semibold ${destacado ? "text-warning-foreground" : ""}`}
                >
                  {formatarQuantidade(item.saldo)}
                </TableCell>
                <TableCell className="text-right">
                  {formatarQuantidade(item.estoqueMinimo)}
                </TableCell>
                <TableCell className="text-right">
                  {item.estoqueMaximo > 0 ? formatarQuantidade(item.estoqueMaximo) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {cobertura == null ? "Sem histórico" : `${formatarQuantidade(cobertura)} sem.`}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={tones[status]}>{LABEL_STATUS[status]}</StatusBadge>
                </TableCell>
                {inventoryMode && canInventory && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => onCount(item)}>
                      <ClipboardCheck className="h-3.5 w-3.5" /> Contar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function MovimentacoesPanel({
  loading,
  error,
  rows,
  from,
  to,
  onFrom,
  onTo,
  query,
  onQuery,
  type,
  onType,
  getItem,
}: {
  loading: boolean;
  error: Error | null;
  rows: MovimentacaoRow[];
  from: string;
  to: string;
  onFrom: (date: string) => void;
  onTo: (date: string) => void;
  query: string;
  onQuery: (text: string) => void;
  type: string;
  onType: (type: string) => void;
  getItem: (row: MovimentacaoRow) => ItemEstoque | undefined;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          De
          <Input type="date" value={from} onChange={(e) => onFrom(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Até
          <Input type="date" value={to} onChange={(e) => onTo(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Tipo
          <select className={selectClass} value={type} onChange={(e) => onType(e.target.value)}>
            <option value="todos">Todos os tipos</option>
            {TIPOS_MOVIMENTACAO.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Buscar item/motivo
          <Input
            placeholder="Nome, código ou motivo..."
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error.message}
        </div>
      )}
      {loading ? (
        <TableSkeleton rows={5} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          compact
          title="Nenhuma movimentação encontrada"
          description="Altere o período ou os filtros, ou registre uma movimentação para começar o histórico."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead>Data</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Origem / motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((mov) => {
                const item = getItem(mov);
                const tipoItem: EstoqueTipo = mov.material_id
                  ? "material"
                  : mov.produto_id
                    ? "produto"
                    : "embalagem";
                const direcao = TIPOS_MOVIMENTACAO.find(
                  (t) => t.value === mov.tipo_movimentacao,
                )?.direcao;
                return (
                  <TableRow key={mov.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(mov.data_movimentacao)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{item?.nome ?? "Item arquivado"}</p>
                      <p className="text-xs text-muted-foreground">
                        {LABEL_TIPO[tipoItem]}
                        {item?.codigo ? ` · ${item.codigo}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>{tipoMovLabel(mov.tipo_movimentacao)}</TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right font-medium ${direcao === "entrada" ? "text-success" : direcao === "saida" ? "text-destructive" : ""}`}
                    >
                      {direcao === "entrada" ? "+" : direcao === "saida" ? "−" : ""}
                      {formatarQuantidade(Number(mov.quantidade))} {mov.unidade_medida}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={mov.motivo ?? "—"}>
                      {mov.motivo || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {rows.length >= 1000 && (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              Exibindo até 1.000 registros no período. Reduza o intervalo para refinar a consulta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
