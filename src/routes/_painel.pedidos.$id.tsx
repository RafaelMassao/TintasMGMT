import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Truck, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormModal } from "@/components/shared/FormModal";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/producao/LoteForm";
import { PedidoForm } from "@/components/pedidos/PedidoForm";
import { notify } from "@/lib/notify";
import { fmtData, fmtNum } from "@/lib/producao";
import {
  type Pedido,
  type StatusPedido,
  SELECT_ITENS,
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

export const Route = createFileRoute("/_painel/pedidos/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe do pedido — Tintas Gestão" },
      { name: "description", content: "Itens, estoque, status e entrega do pedido." },
      { property: "og:title", content: "Detalhe do pedido — Tintas Gestão" },
      { property: "og:description", content: "Itens, estoque, status e entrega do pedido." },
    ],
  }),
  component: PedidoDetalhe,
});

function PedidoDetalhe() {
  const { id } = Route.useParams();
  const { perfis } = Route.useRouteContext();
  const qc = useQueryClient();
  const [editar, setEditar] = useState(false);
  const [entrega, setEntrega] = useState(false);

  const q = useQuery({
    queryKey: ["pedido", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select(`${SELECT_PEDIDO}, itens_pedido(${SELECT_ITENS})`)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Pedido | null;
    },
  });
  const estoque = useQuery({
    queryKey: ["pedido", id, "estoque"],
    queryFn: async () => {
      const { data } = await supabase.from("estoque_disponivel").select("produto_id, em_estoque");
      return new Map((data ?? []).map((e: any) => [e.produto_id as string, Number(e.em_estoque)]));
    },
  });

  const atualizar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => {
      const { error } = await supabase.from("pedidos").update(dados).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["pedido", id] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (e: Error) => notify.error("Não foi possível atualizar", traduzirErroPedido(e.message)),
  });

  if (q.isLoading) return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  if (q.error) return <EmptyState title="Erro ao carregar o pedido" description={traduzirErroPedido(q.error.message)} />;
  const p = q.data;
  if (!p) return <EmptyState title="Pedido não encontrado" action={<Button asChild variant="outline"><Link to="/pedidos">Voltar</Link></Button>} />;

  const pode = podeOperarPedidos(perfis);
  const aberto = p.status !== "entregue" && p.status !== "cancelado";
  const s = statusEfetivo(p);
  const atraso = diasAtraso(p);
  const itens = p.itens_pedido ?? [];

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm"><Link to="/pedidos"><ArrowLeft className="h-4 w-4" /> Pedidos</Link></Button>
      <PageHeader
        title={`Pedido ${p.numero}`}
        description={p.clientes?.nome ?? ""}
        actions={
          pode && aberto && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setEditar(true)}><Pencil className="h-4 w-4" /> Editar</Button>
              <Button onClick={() => setEntrega(true)}><Truck className="h-4 w-4" /> Registrar entrega</Button>
            </div>
          )
        }
      />

      {atraso > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <TriangleAlert className="h-4 w-4" /> Pedido atrasado há {atraso} dia{atraso > 1 ? "s" : ""} (prazo era {fmtData(p.prazo_prometido)}).
        </div>
      )}

      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Info label="Status"><StatusBadge tone={STATUS_PEDIDO_INFO[s].tone}>{STATUS_PEDIDO_INFO[s].label}</StatusBadge></Info>
        <Info label="Data do pedido">{fmtData(p.data_pedido)}</Info>
        <Info label="Prazo prometido">{fmtData(p.prazo_prometido)}</Info>
        <Info label="Data de entrega">{fmtData(p.data_entrega)}</Info>
        <Info label="Documento">{p.clientes?.documento ?? "—"}</Info>
        <Info label="Total"><span className="font-display text-lg font-bold">{fmtMoeda(p.valor_total)}</span></Info>
      </section>

      {pode && aberto && (
        <section className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4">
          <FormField id="status" label="Atualizar status">
            <select
              id="status"
              className={selectClass}
              value={p.status}
              disabled={atualizar.isPending}
              onChange={(e) => {
                const novo = e.target.value as StatusPedido;
                if (novo === "entregue") return setEntrega(true);
                atualizar.mutate({ status: novo });
              }}
            >
              {STATUS_PEDIDO.map((st) => <option key={st} value={st}>{STATUS_PEDIDO_INFO[st].label}</option>)}
            </select>
          </FormField>
          <p className="pb-2 text-xs text-muted-foreground">O atraso é identificado sozinho quando o prazo passa.</p>
        </section>
      )}

      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-display text-base font-semibold">Itens</h2>
        {itens.length === 0 ? (
          <EmptyState compact title="Nenhum item" />
        ) : (
          <div className="space-y-2">
            {itens.map((i) => {
              const pendente = Number(i.quantidade_solicitada) - Number(i.quantidade_entregue);
              const emEst = estoque.data?.get(i.produto_id);
              const falta = aberto && emEst !== undefined && pendente > emEst;
              return (
                <div key={i.id} className={`grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-6 ${falta ? "border-warning bg-warning/10" : ""}`}>
                  <div className="sm:col-span-2">
                    <p className="font-semibold">{i.produtos ? `${i.produtos.codigo} — ${i.produtos.nome}` : "—"}</p>
                    <p className="text-xs text-muted-foreground">Cor: {i.produtos?.cores?.nome ?? "—"} · Embalagem: {i.produtos?.embalagens?.nome ?? "—"}</p>
                  </div>
                  <Info label="Solicitada">{fmtNum(i.quantidade_solicitada)}</Info>
                  <Info label="Entregue">{fmtNum(i.quantidade_entregue)}</Info>
                  <Info label="Em estoque">
                    <span className={falta ? "font-semibold text-destructive" : ""}>{emEst === undefined ? "—" : fmtNum(emEst)}</span>
                  </Info>
                  <Info label="Valor">{fmtMoeda(i.preco_unitario)} × → {fmtMoeda(i.valor_total)}</Info>
                  {falta && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground sm:col-span-6">
                      <TriangleAlert className="h-3.5 w-3.5" /> Estoque insuficiente para o que falta entregar.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {p.observacoes && (
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-2 font-display text-base font-semibold">Observações</h2>
          <p className="whitespace-pre-wrap text-sm">{p.observacoes}</p>
        </section>
      )}

      {editar && <PedidoForm pedido={p} open={editar} onOpenChange={setEditar} />}
      {entrega && <EntregaModal pedido={p} onClose={() => setEntrega(false)} />}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
    </div>
  );
}

function EntregaModal({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  const qc = useQueryClient();
  const itens = pedido.itens_pedido ?? [];
  const [data, setData] = useState(hojeISO());
  const [qtds, setQtds] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, String(i.quantidade_solicitada)])),
  );
  const [erro, setErro] = useState<Record<string, string>>({});

  const salvar = useMutation({
    mutationFn: async () => {
      for (const i of itens) {
        const { error } = await supabase.from("itens_pedido").update({ quantidade_entregue: Number(qtds[i.id]) }).eq("id", i.id);
        if (error) throw error;
      }
      const completo = itens.every((i) => Number(qtds[i.id]) >= Number(i.quantidade_solicitada));
      if (completo) {
        const { error } = await supabase.from("pedidos").update({ status: "entregue", data_entrega: data }).eq("id", pedido.id);
        if (error) throw error;
      }
      return completo;
    },
    onSuccess: (completo) => {
      notify.success(completo ? "Pedido entregue" : "Entrega parcial registrada");
      qc.invalidateQueries({ queryKey: ["pedido"] });
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      onClose();
    },
    onError: (e: Error) => notify.error("Não foi possível registrar a entrega", traduzirErroPedido(e.message)),
  });

  function enviar() {
    const e: Record<string, string> = {};
    if (!data) e["data"] = "Informe a data de entrega.";
    else if (data < pedido.data_pedido) e["data"] = "A entrega não pode ser antes da data do pedido.";
    itens.forEach((i) => {
      const v = Number(qtds[i.id]?.replace(",", "."));
      if (!Number.isFinite(v) || v < 0) e[i.id] = "Valor inválido.";
      else if (v > Number(i.quantidade_solicitada)) e[i.id] = "Maior que o solicitado.";
      else qtds[i.id] = String(v);
    });
    setErro(e);
    if (Object.keys(e).length === 0) salvar.mutate();
  }

  return (
    <FormModal open onOpenChange={(o) => !o && onClose()} title="Registrar entrega" submitLabel="Confirmar entrega" onSubmit={enviar} submitting={salvar.isPending}
      description="Se todas as quantidades forem entregues, o pedido fica como Entregue.">
      <FormField id="data-entrega" label="Data de entrega *" error={erro["data"]}>
        <Input id="data-entrega" type="date" value={data} onChange={(e) => setData(e.target.value)} />
      </FormField>
      {itens.map((i) => (
        <FormField key={i.id} id={`e-${i.id}`} label={`${i.produtos?.codigo ?? ""} — entregue (de ${fmtNum(i.quantidade_solicitada)})`} error={erro[i.id]}>
          <Input id={`e-${i.id}`} inputMode="decimal" value={qtds[i.id] ?? ""} onChange={(e) => setQtds((s) => ({ ...s, [i.id]: e.target.value }))} />
        </FormField>
      ))}
    </FormModal>
  );
}
