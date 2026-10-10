import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, Clock3, Plus, Truck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { selectClass } from "@/components/producao/LoteForm";
import { CadastroCrud } from "@/components/cadastros/CadastroCrud";
import { PedidoCompraForm } from "@/components/compras/PedidoCompraForm";
import { RecebimentoCompraForm } from "@/components/compras/RecebimentoCompraForm";
import { supabase } from "@/integrations/supabase/client";
import { CADASTROS, podeEditarCadastro } from "@/lib/cadastros/config";
import { notify } from "@/lib/notify";
import {
  dataPtBr,
  divergencia,
  numCompras,
  STATUS_PEDIDO_COMPRA_INFO,
  totalRecebido,
  type MaterialOpcao,
  type PedidoCompra,
  type RecebimentoCompra,
  type SugestaoCompra,
} from "@/lib/compras";

export const Route = createFileRoute("/_painel/compras")({
  head: () => ({
    meta: [
      { title: "Compras — Tintas Gestão" },
      {
        name: "description",
        content: "Fornecedores, pedidos, recebimentos e sugestões de compra.",
      },
      { property: "og:title", content: "Compras — Tintas Gestão" },
      {
        property: "og:description",
        content: "Acompanhe pedidos, entradas de material e necessidade de reposição.",
      },
    ],
  }),
  component: ComprasPage,
});

const cadastroFornecedores = CADASTROS.find((c) => c.slug === "fornecedores")!;
function ComprasPage() {
  const { perfis } = Route.useRouteContext();
  const qc = useQueryClient();
  const podeEditar = perfis.some((p) => ["administrador", "gestor", "estoque"].includes(p));
  const [aba, setAba] = useState("pedidos");
  const [novoPedido, setNovoPedido] = useState(false);
  const [receber, setReceber] = useState<PedidoCompra | null>(null);
  const [buscaPedidos, setBuscaPedidos] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [buscaSugestoes, setBuscaSugestoes] = useState("");

  const pedidosQuery = useQuery({
    queryKey: ["compras", "pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos_compra")
        .select(
          "id,numero,fornecedor_id,data_pedido,previsao_entrega,status,observacoes,criado_em,fornecedores(nome),itens_pedido_compra(id,material_id,quantidade_solicitada,preco_unitario,materiais(codigo,nome,unidades_medida(sigla)),itens_recebimento_compra(quantidade_recebida,observacoes))",
        )
        .order("criado_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as PedidoCompra[];
    },
    staleTime: 15_000,
  });

  const recebimentosQuery = useQuery({
    queryKey: ["compras-recebimentos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recebimentos_compra")
        .select(
          "id,numero,pedido_compra_id,data_recebimento,observacoes,criado_em,pedidos_compra(numero,fornecedores(nome)),itens_recebimento_compra(id,quantidade_recebida,observacoes,lotes_materiais(numero_lote,validade),itens_pedido_compra(materiais(nome)))",
        )
        .order("data_recebimento", { ascending: false })
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RecebimentoCompra[];
    },
    staleTime: 15_000,
  });

  const sugestoesQuery = useQuery({
    queryKey: ["compras-sugestoes"],
    queryFn: async () => {
      const desde = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const [materiaisResp, saldosResp, consumoResp] = await Promise.all([
        supabase
          .from("materiais")
          .select(
            "id,codigo,nome,estoque_minimo,fornecedor_padrao_id,unidades_medida(sigla),fornecedores(id,nome,prazo_entrega_dias)",
          )
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("v_estoque_saldo")
          .select("item_id,tipo_item,saldo")
          .eq("tipo_item", "material"),
        supabase
          .from("estoque_movimentacoes")
          .select("material_id,quantidade")
          .gte("data_movimentacao", desde)
          .in("tipo_movimentacao", ["saida_producao", "saida_perda"]),
      ]);
      const falha = [materiaisResp, saldosResp, consumoResp].find((r) => r.error);
      if (falha?.error) throw falha.error;
      const materiais = (materiaisResp.data ?? []) as unknown as (Omit<MaterialOpcao, "unidade"> & {
        unidades_medida: { sigla: string } | null;
        fornecedores: { id: string; nome: string; prazo_entrega_dias: number } | null;
      })[];
      const saldos = new Map(
        ((saldosResp.data ?? []) as unknown as { item_id: string; saldo: number | string }[]).map(
          (r) => [r.item_id, Number(r.saldo ?? 0)],
        ),
      );
      const consumos = new Map<string, number>();
      (
        (consumoResp.data ?? []) as unknown as {
          material_id: string | null;
          quantidade: number | string;
        }[]
      ).forEach((row) => {
        if (row.material_id)
          consumos.set(
            row.material_id,
            (consumos.get(row.material_id) ?? 0) + Number(row.quantidade),
          );
      });
      return materiais
        .map((row): SugestaoCompra => {
          const material: MaterialOpcao = {
            id: row.id,
            codigo: row.codigo,
            nome: row.nome,
            unidade: row.unidades_medida?.sigla ?? "un",
            estoque_minimo: Number(row.estoque_minimo ?? 0),
            fornecedor_padrao_id: row.fornecedor_padrao_id,
          };
          const saldo = saldos.get(row.id) ?? 0;
          const consumo90Dias = consumos.get(row.id) ?? 0;
          const consumoMedioDia = consumo90Dias / 90;
          const prazoEntregaDias = Math.max(0, Number(row.fornecedores?.prazo_entrega_dias ?? 7));
          const minimo = material.estoque_minimo;
          const pontoReposicao = minimo + consumoMedioDia * prazoEntregaDias;
          const quantidadeSugerida = Math.max(0, pontoReposicao - saldo);
          return {
            material,
            saldo,
            minimo,
            consumo90Dias,
            consumoMedioDia,
            prazoEntregaDias,
            pontoReposicao,
            quantidadeSugerida,
            fornecedorNome: row.fornecedores?.nome ?? "Sem fornecedor padrão",
          };
        })
        .filter((s) => s.quantidadeSugerida > 0)
        .sort(
          (a, b) =>
            a.saldo - a.minimo - (b.saldo - b.minimo) ||
            b.quantidadeSugerida - a.quantidadeSugerida,
        );
    },
    staleTime: 30_000,
  });

  const pedidos = useMemo(() => pedidosQuery.data ?? [], [pedidosQuery.data]);
  const recebimentos = recebimentosQuery.data ?? [];
  const sugestoes = useMemo(() => sugestoesQuery.data ?? [], [sugestoesQuery.data]);
  const abaixoMinimo = sugestoes.filter((s) => s.saldo < s.minimo).length;
  const abertos = pedidos.filter((p) => ["enviado", "parcial"].includes(p.status)).length;
  const pedidosFiltrados = useMemo(() => {
    const q = buscaPedidos.trim().toLocaleLowerCase("pt-BR");
    return pedidos.filter((p) => {
      const texto = `${p.numero} ${p.fornecedores?.nome ?? ""}`.toLocaleLowerCase("pt-BR");
      return (!q || texto.includes(q)) && (filtroStatus === "todos" || p.status === filtroStatus);
    });
  }, [pedidos, buscaPedidos, filtroStatus]);
  const sugestoesFiltradas = useMemo(() => {
    const q = buscaSugestoes.trim().toLocaleLowerCase("pt-BR");
    return sugestoes.filter((s) =>
      `${s.material.codigo} ${s.material.nome} ${s.fornecedorNome}`
        .toLocaleLowerCase("pt-BR")
        .includes(q),
    );
  }, [sugestoes, buscaSugestoes]);

  const enviarPedido = useMutation({
    mutationFn: async (pedido: PedidoCompra) => {
      if (!pedido.itens_pedido_compra.length) throw new Error("O pedido não possui itens.");
      const { error } = await supabase.rpc("marcar_pedido_compra_enviado", {
        _pedido_compra_id: pedido.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Pedido marcado como enviado ao fornecedor");
      qc.invalidateQueries({ queryKey: ["compras"] });
    },
    onError: (e: Error) => notify.error("Não foi possível atualizar o pedido", e.message),
  });

  const colunasPedidos: Column<PedidoCompra>[] = [
    {
      key: "numero",
      header: "Pedido",
      primary: true,
      cell: (p) => <span className="font-semibold">{p.numero}</span>,
    },
    { key: "fornecedor", header: "Fornecedor", cell: (p) => p.fornecedores?.nome ?? "—" },
    { key: "data", header: "Data", hideOnMobile: true, cell: (p) => dataPtBr(p.data_pedido) },
    { key: "previsao", header: "Previsão", cell: (p) => dataPtBr(p.previsao_entrega) },
    {
      key: "divergencia",
      header: "Divergências",
      hideOnMobile: true,
      cell: (p) => {
        const divergentes = p.itens_pedido_compra.filter(
          (i) => totalRecebido(i) > 0 && Math.abs(divergencia(i)) > 0.0005,
        ).length;
        return divergentes ? (
          <span className="font-medium text-warning-foreground">{divergentes} item(ns)</span>
        ) : p.status === "parcial" ? (
          "A conferir"
        ) : (
          "—"
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => (
        <StatusBadge tone={STATUS_PEDIDO_COMPRA_INFO[p.status].tone}>
          {STATUS_PEDIDO_COMPRA_INFO[p.status].label}
        </StatusBadge>
      ),
    },
  ];

  const colunasRecebimentos: Column<RecebimentoCompra>[] = [
    {
      key: "numero",
      header: "Recebimento",
      primary: true,
      cell: (r) => <span className="font-semibold">{r.numero}</span>,
    },
    { key: "pedido", header: "Pedido", cell: (r) => r.pedidos_compra?.numero ?? "—" },
    {
      key: "fornecedor",
      header: "Fornecedor",
      cell: (r) => r.pedidos_compra?.fornecedores?.nome ?? "—",
    },
    { key: "data", header: "Data", cell: (r) => dataPtBr(r.data_recebimento) },
    {
      key: "itens",
      header: "Itens recebidos",
      hideOnMobile: true,
      cell: (r) =>
        r.itens_recebimento_compra
          .filter((i) => Number(i.quantidade_recebida) > 0)
          .map((i) => {
            const lote = i.lotes_materiais?.numero_lote
              ? ` · lote ${i.lotes_materiais.numero_lote}`
              : "";
            const validade = i.lotes_materiais?.validade
              ? ` · val. ${dataPtBr(i.lotes_materiais.validade)}`
              : "";
            return `${i.itens_pedido_compra?.materiais?.nome ?? "Material"}: ${numCompras(i.quantidade_recebida)}${lote}${validade}`;
          })
          .join(" · ") || "Sem quantidade positiva",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Compras"
        description="Fornecedores, pedidos, recebimentos e reposição de materiais."
        actions={
          podeEditar ? (
            <Button onClick={() => setNovoPedido(true)}>
              <Plus className="h-4 w-4" /> Novo pedido
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5" /> Abaixo do mínimo
          </p>
          <p className="mt-1 font-display text-2xl font-bold text-warning-foreground">
            {sugestoesQuery.isLoading ? "—" : abaixoMinimo}
          </p>
          <p className="text-xs text-muted-foreground">Matérias-primas que precisam de atenção</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Truck className="h-3.5 w-3.5" /> Pedidos em aberto
          </p>
          <p className="mt-1 font-display text-2xl font-bold">
            {pedidosQuery.isLoading ? "—" : abertos}
          </p>
          <p className="text-xs text-muted-foreground">Enviados ou recebidos parcialmente</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <ArrowDownToLine className="h-3.5 w-3.5" /> Recebimentos registrados
          </p>
          <p className="mt-1 font-display text-2xl font-bold">
            {recebimentosQuery.isLoading ? "—" : recebimentos.length}
          </p>
          <p className="text-xs text-muted-foreground">Últimos 100 eventos de recebimento</p>
        </div>
      </div>

      {(pedidosQuery.error || recebimentosQuery.error || sugestoesQuery.error) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-semibold text-destructive">
            Não foi possível carregar todos os dados de Compras.
          </p>
          <p className="mt-1 text-muted-foreground">
            {
              ((pedidosQuery.error || recebimentosQuery.error || sugestoesQuery.error) as Error)
                .message
            }
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Confira se o arquivo supabase/compras.sql foi executado no projeto Supabase conectado.
          </p>
        </div>
      )}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-lg border bg-card p-1 sm:w-auto">
          <TabsTrigger value="pedidos">Pedidos de compra</TabsTrigger>
          <TabsTrigger value="recebimentos">Recebimento de materiais</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        </TabsList>

        <TabsContent value="pedidos" className="mt-4 space-y-5">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-base font-semibold">Sugestões de compra</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ponto de reposição = estoque mínimo + consumo médio diário dos últimos 90 dias ×
                  prazo de entrega.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock3 className="h-4 w-4" /> Prazo conforme cadastro do fornecedor padrão
              </div>
            </div>
            <Input
              value={buscaSugestoes}
              onChange={(e) => setBuscaSugestoes(e.target.value)}
              placeholder="Filtrar material, código ou fornecedor..."
            />
            {sugestoesQuery.isLoading ? (
              <p className="py-4 text-sm text-muted-foreground">Calculando necessidade...</p>
            ) : sugestoesFiltradas.length === 0 ? (
              <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
                Nenhuma necessidade de reposição identificada com os dados atuais.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[780px] text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="p-3">Material</th>
                      <th className="p-3">Saldo / mínimo</th>
                      <th className="p-3">Consumo médio/dia</th>
                      <th className="p-3">Prazo</th>
                      <th className="p-3">Fornecedor padrão</th>
                      <th className="p-3">Comprar (sugestão)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sugestoesFiltradas.map((s) => (
                      <tr key={s.material.id} className="border-t">
                        <td className="p-3">
                          <span className="font-medium">
                            {s.material.codigo} — {s.material.nome}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={s.saldo < s.minimo ? "font-semibold text-destructive" : ""}
                          >
                            {numCompras(s.saldo)} / {numCompras(s.minimo)} {s.material.unidade}
                          </span>
                        </td>
                        <td className="p-3">
                          {numCompras(s.consumoMedioDia)} {s.material.unidade}/dia
                        </td>
                        <td className="p-3">{s.prazoEntregaDias} dias</td>
                        <td className="p-3">{s.fornecedorNome}</td>
                        <td className="p-3 font-semibold">
                          {numCompras(s.quantidadeSugerida)} {s.material.unidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
              <Input
                value={buscaPedidos}
                onChange={(e) => setBuscaPedidos(e.target.value)}
                placeholder="Buscar por número ou fornecedor..."
              />
              <select
                aria-label="Filtrar status do pedido de compra"
                className={selectClass}
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
              >
                <option value="todos">Todos os status</option>
                {Object.entries(STATUS_PEDIDO_COMPRA_INFO).map(([key, item]) => (
                  <option key={key} value={key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <DataTable
              columns={colunasPedidos}
              rows={pedidosFiltrados}
              getRowId={(p) => p.id}
              loading={pedidosQuery.isLoading}
              emptyTitle={
                buscaPedidos || filtroStatus !== "todos"
                  ? "Nenhum pedido encontrado"
                  : "Nenhum pedido de compra"
              }
              emptyDescription="Crie um rascunho com fornecedor e itens, depois marque-o como enviado para iniciar o recebimento."
              rowActions={
                podeEditar
                  ? (pedido) => (
                      <div className="flex flex-wrap justify-end gap-1">
                        {pedido.status === "rascunho" && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={enviarPedido.isPending}
                            onClick={() => enviarPedido.mutate(pedido)}
                          >
                            Marcar enviado
                          </Button>
                        )}
                        {["enviado", "parcial"].includes(pedido.status) && (
                          <Button size="sm" onClick={() => setReceber(pedido)}>
                            Receber
                          </Button>
                        )}
                      </div>
                    )
                  : undefined
              }
            />
          </section>
        </TabsContent>

        <TabsContent value="recebimentos" className="mt-4 space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="font-display text-base font-semibold">Pedidos aguardando recebimento</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Informe o recebido item a item; faltas e excedentes ficam registrados como
              divergência.
            </p>
            <div className="mt-4">
              <DataTable
                columns={colunasPedidos}
                rows={pedidos.filter((p) => ["enviado", "parcial"].includes(p.status))}
                getRowId={(p) => p.id}
                loading={pedidosQuery.isLoading}
                emptyTitle="Nenhum pedido aguardando recebimento"
                emptyDescription="Marque um pedido de compra como enviado para recebê-lo aqui."
                rowActions={
                  podeEditar
                    ? (pedido) => (
                        <Button size="sm" onClick={() => setReceber(pedido)}>
                          Registrar recebimento
                        </Button>
                      )
                    : undefined
                }
              />
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <h2 className="font-display text-base font-semibold">Histórico de recebimentos</h2>
              <p className="text-sm text-muted-foreground">
                Cada evento registra os itens, quantidades, observações e lotes informados.
              </p>
            </div>
            <DataTable
              columns={colunasRecebimentos}
              rows={recebimentos}
              getRowId={(r) => r.id}
              loading={recebimentosQuery.isLoading}
              emptyTitle="Nenhum recebimento registrado"
              emptyDescription="Os recebimentos concluídos aparecerão neste histórico."
            />
          </div>
        </TabsContent>

        <TabsContent value="fornecedores" className="mt-4 space-y-3">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Cadastre dados de contato e prazo médio de entrega. O prazo alimenta o cálculo do ponto
            de reposição; materiais podem apontar um fornecedor padrão no cadastro.
          </div>
          <CadastroCrud
            config={cadastroFornecedores}
            podeEditar={podeEditarCadastro(perfis, cadastroFornecedores)}
          />
        </TabsContent>
      </Tabs>

      {novoPedido && <PedidoCompraForm open={novoPedido} onOpenChange={setNovoPedido} />}
      {receber && (
        <RecebimentoCompraForm
          key={receber.id}
          pedido={receber}
          open
          onOpenChange={(open) => !open && setReceber(null)}
        />
      )}
    </div>
  );
}
