import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import { fmtMoeda, hojeISO } from "@/lib/pedidos";
import { numCompras, type FornecedorOpcao, type MaterialOpcao } from "@/lib/compras";

type Linha = { key: string; material_id: string; quantidade: string; preco: string };
const novaLinha = (): Linha => ({
  key: crypto.randomUUID(),
  material_id: "",
  quantidade: "",
  preco: "0",
});
const numero = (v: string) => Number(v.replace(",", "."));

export function PedidoCompraForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [fornecedorId, setFornecedorId] = useState("");
  const [dataPedido, setDataPedido] = useState(hojeISO());
  const [previsao, setPrevisao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([novaLinha()]);
  const [erros, setErros] = useState<Record<string, string>>({});

  const opcoes = useQuery({
    queryKey: ["compras-opcoes"],
    enabled: open,
    queryFn: async () => {
      const [f, m] = await Promise.all([
        supabase
          .from("fornecedores")
          .select("id,nome,prazo_entrega_dias")
          .eq("ativo", true)
          .order("nome"),
        supabase
          .from("materiais")
          .select("id,codigo,nome,unidade_medida_id,unidades_medida(sigla)")
          .eq("ativo", true)
          .order("nome"),
      ]);
      if (f.error) throw f.error;
      if (m.error) throw m.error;
      const fornecedores = (f.data ?? []) as unknown as (FornecedorOpcao & {
        id: string;
        nome: string;
      })[];
      const materiais = (m.data ?? []) as unknown as {
        id: string;
        codigo: string;
        nome: string;
        unidades_medida: { sigla: string } | null;
      }[];
      return {
        fornecedores,
        materiais: materiais.map((x): MaterialOpcao => ({
          id: x.id,
          codigo: x.codigo,
          nome: x.nome,
          unidade: x.unidades_medida?.sigla ?? "un",
          estoque_minimo: 0,
          fornecedor_padrao_id: null,
        })),
      };
    },
  });

  const materialMap = useMemo(
    () => new Map((opcoes.data?.materiais ?? []).map((m) => [m.id, m])),
    [opcoes.data],
  );
  const total = linhas.reduce((sum, l) => {
    const value = numero(l.quantidade) * numero(l.preco);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  const salvar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("criar_pedido_compra", {
        _fornecedor_id: fornecedorId,
        _data_pedido: dataPedido,
        _previsao_entrega: previsao || null,
        _observacoes: observacoes.trim() || null,
        _itens: linhas.map((l) => ({
          material_id: l.material_id,
          quantidade_solicitada: numero(l.quantidade),
          preco_unitario: numero(l.preco || "0"),
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success("Pedido de compra criado como rascunho");
      qc.invalidateQueries({ queryKey: ["compras"] });
      qc.invalidateQueries({ queryKey: ["compras-sugestoes"] });
      onOpenChange(false);
      setFornecedorId("");
      setDataPedido(hojeISO());
      setPrevisao("");
      setObservacoes("");
      setLinhas([novaLinha()]);
      setErros({});
    },
    onError: (e: Error) => notify.error("Não foi possível criar o pedido", e.message),
  });

  function validar() {
    const next: Record<string, string> = {};
    if (!fornecedorId) next["fornecedor"] = "Selecione um fornecedor.";
    if (!dataPedido) next["data"] = "Informe a data do pedido.";
    if (previsao && previsao < dataPedido)
      next["previsao"] = "A previsão não pode ser anterior à data do pedido.";
    if (!linhas.length) next["itens"] = "Inclua ao menos um material.";
    const selecionados = linhas.map((l) => l.material_id).filter(Boolean);
    if (new Set(selecionados).size !== selecionados.length)
      next["itens"] = "Cada material deve aparecer apenas uma vez no pedido.";
    for (const l of linhas) {
      const q = numero(l.quantidade);
      const p = numero(l.preco || "0");
      if (!l.material_id) next[`${l.key}.material`] = "Selecione o material.";
      if (!l.quantidade || !Number.isFinite(q) || q <= 0)
        next[`${l.key}.qtd`] = "Informe uma quantidade maior que zero.";
      if (!Number.isFinite(p) || p < 0) next[`${l.key}.preco`] = "Informe um preço válido.";
    }
    setErros(next);
    return Object.keys(next).length === 0;
  }

  const atualizar = (key: string, field: "material_id" | "quantidade" | "preco", value: string) =>
    setLinhas((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));

  return (
    <Dialog open={open} onOpenChange={(value) => !salvar.isPending && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (validar()) salvar.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display">Novo pedido de compra</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField id="fornecedor-compra" label="Fornecedor *" error={erros["fornecedor"]}>
              <select
                id="fornecedor-compra"
                className={selectClass}
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
              >
                <option value="">Selecione...</option>
                {opcoes.data?.fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="data-compra" label="Data do pedido *" error={erros["data"]}>
              <Input
                id="data-compra"
                type="date"
                value={dataPedido}
                onChange={(e) => setDataPedido(e.target.value)}
              />
            </FormField>
            <FormField id="previsao-compra" label="Previsão de entrega" error={erros["previsao"]}>
              <Input
                id="previsao-compra"
                type="date"
                value={previsao}
                onChange={(e) => setPrevisao(e.target.value)}
              />
            </FormField>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-semibold">Materiais do pedido</h3>
                {erros["itens"] && <p className="text-xs text-destructive">{erros["itens"]}</p>}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLinhas((rows) => [...rows, novaLinha()])}
              >
                <Plus className="h-4 w-4" /> Adicionar material
              </Button>
            </div>
            {linhas.map((linha, index) => {
              const material = materialMap.get(linha.material_id);
              const subtotal = numero(linha.quantidade) * numero(linha.preco || "0");
              return (
                <div key={linha.key} className="space-y-2 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>Material {index + 1}</span>
                    {linhas.length > 1 && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover material"
                        onClick={() => setLinhas((rows) => rows.filter((r) => r.key !== linha.key))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
                    <FormField
                      id={`material-${linha.key}`}
                      label="Material *"
                      error={erros[`${linha.key}.material`]}
                    >
                      <select
                        id={`material-${linha.key}`}
                        className={selectClass}
                        value={linha.material_id}
                        onChange={(e) => atualizar(linha.key, "material_id", e.target.value)}
                      >
                        <option value="">Selecione...</option>
                        {opcoes.data?.materiais.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.codigo} — {m.nome}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField
                      id={`quantidade-${linha.key}`}
                      label={`Quantidade *${material ? ` (${material.unidade})` : ""}`}
                      error={erros[`${linha.key}.qtd`]}
                    >
                      <Input
                        id={`quantidade-${linha.key}`}
                        inputMode="decimal"
                        value={linha.quantidade}
                        onChange={(e) => atualizar(linha.key, "quantidade", e.target.value)}
                      />
                    </FormField>
                    <FormField
                      id={`preco-${linha.key}`}
                      label="Preço unitário (R$)"
                      error={erros[`${linha.key}.preco`]}
                    >
                      <Input
                        id={`preco-${linha.key}`}
                        inputMode="decimal"
                        value={linha.preco}
                        onChange={(e) => atualizar(linha.key, "preco", e.target.value)}
                      />
                    </FormField>
                  </div>
                  {material && (
                    <p className="text-xs text-muted-foreground">
                      Subtotal estimado:{" "}
                      <strong className="text-foreground">
                        {fmtMoeda(Number.isFinite(subtotal) ? subtotal : 0)}
                      </strong>
                    </p>
                  )}
                </div>
              );
            })}
          </section>
          <FormField id="observacoes-compra" label="Observações">
            <Textarea
              id="observacoes-compra"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Condições, instruções ou referências do fornecedor"
            />
          </FormField>
          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm font-semibold">Total estimado</span>
            <span className="font-display text-lg font-bold">{fmtMoeda(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            O pedido será salvo como rascunho. Marque-o como enviado para habilitar o recebimento.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvar.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={salvar.isPending || opcoes.isLoading}>
              Criar rascunho
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
