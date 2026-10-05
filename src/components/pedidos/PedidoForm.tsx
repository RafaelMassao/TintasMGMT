import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import { fmtNum } from "@/lib/producao";
import { type Pedido, fmtMoeda, hojeISO, opcoesPedido, traduzirErroPedido } from "@/lib/pedidos";

type Linha = { key: string; id?: string; produto_id: string; quantidade: string; preco: string; entregue: number };
const novaLinha = (): Linha => ({ key: crypto.randomUUID(), produto_id: "", quantidade: "", preco: "", entregue: 0 });
const n = (s: string) => Number(String(s).replace(",", "."));

export function PedidoForm({
  pedido,
  open,
  onOpenChange,
  onSalvo,
}: {
  pedido: Pedido | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const opcoes = useQuery({ queryKey: ["opcoes-pedido"], queryFn: opcoesPedido, enabled: open });
  const [cab, setCab] = useState({
    numero: pedido?.numero ?? `PED-${Date.now().toString().slice(-6)}`,
    cliente_id: pedido?.cliente_id ?? "",
    data_pedido: pedido?.data_pedido ?? hojeISO(),
    prazo_prometido: pedido?.prazo_prometido ?? "",
    observacoes: pedido?.observacoes ?? "",
  });
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    pedido?.itens_pedido?.length
      ? pedido.itens_pedido.map((i) => ({
          key: i.id,
          id: i.id,
          produto_id: i.produto_id,
          quantidade: String(i.quantidade_solicitada),
          preco: String(i.preco_unitario),
          entregue: Number(i.quantidade_entregue),
        }))
      : [novaLinha()],
  );
  const [erros, setErros] = useState<Record<string, string>>({});

  // Quantidade deste pedido já reservada (ao editar, ela volta para o disponível)
  const reservadoAqui = useMemo(() => {
    const m = new Map<string, number>();
    pedido?.itens_pedido?.forEach((i) =>
      m.set(i.produto_id, (m.get(i.produto_id) ?? 0) + Number(i.quantidade_solicitada) - Number(i.quantidade_entregue)),
    );
    return m;
  }, [pedido]);
  const prodMap = useMemo(() => new Map((opcoes.data?.produtos ?? []).map((p) => [p.id, p])), [opcoes.data]);
  const pedidoPorProduto = useMemo(() => {
    const m = new Map<string, number>();
    linhas.forEach((l) => {
      const q = n(l.quantidade);
      if (l.produto_id && q > 0) m.set(l.produto_id, (m.get(l.produto_id) ?? 0) + q - l.entregue);
    });
    return m;
  }, [linhas]);
  const disponivelPara = (produtoId: string) =>
    (prodMap.get(produtoId)?.disponivel ?? 0) + (reservadoAqui.get(produtoId) ?? 0);

  const totalPedido = linhas.reduce((s, l) => {
    const v = n(l.quantidade) * n(l.preco);
    return s + (Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : 0);
  }, 0);

  const setLinha = (key: string, campo: keyof Linha, valor: string) =>
    setLinhas((ls) => ls.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));

  const salvar = useMutation({
    mutationFn: async () => {
      const dados = {
        numero: cab.numero.trim(),
        cliente_id: cab.cliente_id,
        data_pedido: cab.data_pedido,
        prazo_prometido: cab.prazo_prometido || null,
        observacoes: cab.observacoes.trim() || null,
      };
      let id = pedido?.id;
      if (id) {
        const { error } = await supabase.from("pedidos").update(dados).eq("id", id);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("pedidos").insert({ ...dados, criado_por: u.user?.id }).select("id").single();
        if (error) throw error;
        id = data.id as string;
      }
      const manter = new Set(linhas.filter((l) => l.id).map((l) => l.id));
      const remover = (pedido?.itens_pedido ?? []).filter((i) => !manter.has(i.id)).map((i) => i.id);
      if (remover.length) {
        const { error } = await supabase.from("itens_pedido").delete().in("id", remover);
        if (error) throw error;
      }
      for (const l of linhas) {
        const item = { pedido_id: id, produto_id: l.produto_id, quantidade_solicitada: n(l.quantidade), preco_unitario: n(l.preco) };
        const { error } = l.id
          ? await supabase.from("itens_pedido").update(item).eq("id", l.id)
          : await supabase.from("itens_pedido").insert(item);
        if (error) throw error;
      }
      return id;
    },
    onSuccess: (id) => {
      notify.success(pedido ? "Pedido atualizado" : "Pedido criado");
      qc.invalidateQueries({ queryKey: ["pedidos"] });
      qc.invalidateQueries({ queryKey: ["pedido"] });
      qc.invalidateQueries({ queryKey: ["opcoes-pedido"] });
      onOpenChange(false);
      onSalvo?.(id);
    },
    onError: (e: Error) => notify.error("Não foi possível salvar o pedido", traduzirErroPedido(e.message)),
  });

  function validar() {
    const e: Record<string, string> = {};
    if (!cab.numero.trim()) e["numero"] = "Informe o número do pedido.";
    if (!cab.cliente_id) e["cliente_id"] = "Escolha o cliente.";
    if (!cab.data_pedido) e["data_pedido"] = "Informe a data do pedido.";
    if (cab.prazo_prometido && cab.prazo_prometido < cab.data_pedido) e["prazo_prometido"] = "O prazo não pode ser antes da data do pedido.";
    if (linhas.length === 0) e["itens"] = "Inclua pelo menos um item.";
    linhas.forEach((l) => {
      if (!l.produto_id) e[`${l.key}.produto`] = "Escolha o produto.";
      const q = n(l.quantidade);
      if (!l.quantidade || !Number.isFinite(q) || q <= 0) e[`${l.key}.qtd`] = "Quantidade deve ser maior que zero.";
      else if (q < l.entregue) e[`${l.key}.qtd`] = `Já foram entregues ${fmtNum(l.entregue)}.`;
      const p = n(l.preco);
      if (l.preco === "" || !Number.isFinite(p) || p < 0) e[`${l.key}.preco`] = "Preço inválido.";
    });
    setErros(e);
    return Object.keys(e).length === 0;
  }

  const semEstoque = [...pedidoPorProduto.entries()].filter(([pid, q]) => q > disponivelPara(pid));

  return (
    <Dialog open={open} onOpenChange={(o) => !salvar.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (validar()) salvar.mutate();
            else notify.error("Confira os campos destacados");
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display">{pedido ? `Editar pedido ${pedido.numero}` : "Novo pedido"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="numero" label="Número *" error={erros["numero"]}>
              <Input id="numero" value={cab.numero} onChange={(e) => setCab((s) => ({ ...s, numero: e.target.value }))} />
            </FormField>
            <FormField id="cliente" label="Cliente *" error={erros["cliente_id"]}>
              <select id="cliente" className={selectClass} value={cab.cliente_id} onChange={(e) => setCab((s) => ({ ...s, cliente_id: e.target.value }))}>
                <option value="">Selecione...</option>
                {opcoes.data?.clientes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </FormField>
            <FormField id="data" label="Data do pedido *" error={erros["data_pedido"]}>
              <Input id="data" type="date" value={cab.data_pedido} onChange={(e) => setCab((s) => ({ ...s, data_pedido: e.target.value }))} />
            </FormField>
            <FormField id="prazo" label="Prazo prometido" error={erros["prazo_prometido"]}>
              <Input id="prazo" type="date" value={cab.prazo_prometido} onChange={(e) => setCab((s) => ({ ...s, prazo_prometido: e.target.value }))} />
            </FormField>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold">Itens</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>
                <Plus className="h-4 w-4" /> Adicionar item
              </Button>
            </div>
            {erros["itens"] && <p className="text-xs text-destructive">{erros["itens"]}</p>}
            {opcoes.data && !opcoes.data.estoqueOk && (
              <p className="text-xs text-warning-foreground">Consulta de estoque indisponível — rode o arquivo pedidos_tela.sql no Supabase.</p>
            )}
            {linhas.map((l, idx) => {
              const prod = prodMap.get(l.produto_id);
              const disp = l.produto_id ? disponivelPara(l.produto_id) : 0;
              const falta = l.produto_id && (pedidoPorProduto.get(l.produto_id) ?? 0) > disp;
              const valor = n(l.quantidade) * n(l.preco);
              return (
                <div key={l.key} className={`space-y-2 rounded-md border p-3 ${falta ? "border-warning bg-warning/10" : ""}`}>
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>Item {idx + 1}</span>
                    {linhas.length > 1 && l.entregue === 0 && (
                      <Button type="button" size="sm" variant="ghost" aria-label="Remover item" onClick={() => setLinhas((ls) => ls.filter((x) => x.key !== l.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                    <FormField id={`p-${l.key}`} label="Produto *" error={erros[`${l.key}.produto`]}>
                      <select id={`p-${l.key}`} className={selectClass} value={l.produto_id} disabled={l.entregue > 0} onChange={(e) => setLinha(l.key, "produto_id", e.target.value)}>
                        <option value="">Selecione...</option>
                        {opcoes.data?.produtos.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </FormField>
                    <FormField id={`q-${l.key}`} label="Quantidade *" error={erros[`${l.key}.qtd`]}>
                      <Input id={`q-${l.key}`} inputMode="decimal" value={l.quantidade} onChange={(e) => setLinha(l.key, "quantidade", e.target.value)} />
                    </FormField>
                    <FormField id={`r-${l.key}`} label="Preço unitário (R$) *" error={erros[`${l.key}.preco`]}>
                      <Input id={`r-${l.key}`} inputMode="decimal" value={l.preco} onChange={(e) => setLinha(l.key, "preco", e.target.value)} />
                    </FormField>
                  </div>
                  {prod && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Cor: <b className="text-foreground">{prod.cor}</b></span>
                      <span>Embalagem: <b className="text-foreground">{prod.embalagem}</b></span>
                      <span>Disponível: <b className={falta ? "text-destructive" : "text-foreground"}>{fmtNum(disp)}</b></span>
                      <span>Valor do item: <b className="text-foreground">{fmtMoeda(Number.isFinite(valor) ? valor : 0)}</b></span>
                    </div>
                  )}
                  {falta && (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                      <TriangleAlert className="h-3.5 w-3.5" /> Estoque insuficiente para este produto.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <FormField id="obs" label="Observações">
            <Textarea id="obs" value={cab.observacoes} onChange={(e) => setCab((s) => ({ ...s, observacoes: e.target.value }))} />
          </FormField>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-semibold">Total do pedido</span>
            <span className="font-display text-lg font-bold">{fmtMoeda(totalPedido)}</span>
          </div>
          {semEstoque.length > 0 && (
            <p className="text-xs text-warning-foreground">
              {semEstoque.length} produto(s) sem estoque suficiente. O pedido pode ser salvo, mas considere o status "Aguardando estoque".
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvar.isPending}>Cancelar</Button>
            <Button type="submit" loading={salvar.isPending}>Salvar pedido</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
