import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
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
import { notify } from "@/lib/notify";
import { hojeISO } from "@/lib/pedidos";
import { numCompras, totalRecebido, type PedidoCompra } from "@/lib/compras";

type LinhaRecebimento = {
  quantidade: string;
  numero_lote: string;
  data_fabricacao: string;
  validade: string;
  observacoes: string;
};
const quantidade = (v: string) => Number(v.replace(",", "."));

export function RecebimentoCompraForm({
  pedido,
  open,
  onOpenChange,
}: {
  pedido: PedidoCompra;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState(hojeISO());
  const [observacoes, setObservacoes] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [linhas, setLinhas] = useState<Record<string, LinhaRecebimento>>(() =>
    Object.fromEntries(
      pedido.itens_pedido_compra.map((item) => [
        item.id,
        { quantidade: "", numero_lote: "", data_fabricacao: "", validade: "", observacoes: "" },
      ]),
    ),
  );
  const qtdInformada = useMemo(
    () =>
      Object.values(linhas).reduce((s, l) => s + Math.max(0, quantidade(l.quantidade || "0")), 0),
    [linhas],
  );

  const salvar = useMutation({
    mutationFn: async () => {
      const { data: resultado, error } = await supabase.rpc("registrar_recebimento_compra", {
        _pedido_compra_id: pedido.id,
        _data_recebimento: data,
        _observacoes: observacoes.trim() || null,
        _itens: pedido.itens_pedido_compra.map((item) => ({
          item_id: item.id,
          quantidade_recebida: Math.max(0, quantidade(linhas[item.id]?.quantidade || "0")),
          numero_lote: linhas[item.id]?.numero_lote.trim() || null,
          data_fabricacao: linhas[item.id]?.data_fabricacao || null,
          validade: linhas[item.id]?.validade || null,
          observacoes: linhas[item.id]?.observacoes.trim() || null,
        })),
      });
      if (error) throw error;
      return resultado;
    },
    onSuccess: () => {
      notify.success("Recebimento registrado e entrada lançada no estoque");
      qc.invalidateQueries({ queryKey: ["compras"] });
      qc.invalidateQueries({ queryKey: ["compras-recebimentos"] });
      qc.invalidateQueries({ queryKey: ["compras-sugestoes"] });
      qc.invalidateQueries({ queryKey: ["estoque"] });
      qc.invalidateQueries({ queryKey: ["estoque-historico"] });
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error("Não foi possível registrar o recebimento", e.message),
  });

  function validar() {
    const next: Record<string, string> = {};
    if (!data) next["data"] = "Informe a data do recebimento.";
    if (qtdInformada <= 0)
      next["quantidade"] = "Informe uma quantidade recebida maior que zero em pelo menos um item.";
    for (const item of pedido.itens_pedido_compra) {
      const linha = linhas[item.id];
      if (!linha) continue;
      const q = quantidade(linha.quantidade || "0");
      if (!Number.isFinite(q) || q < 0)
        next[`${item.id}.qtd`] = "Informe uma quantidade válida, igual ou maior que zero.";
      if (linha.data_fabricacao && linha.validade && linha.validade < linha.data_fabricacao)
        next[`${item.id}.validade`] = "A validade não pode ser anterior à fabricação.";
    }
    setErros(next);
    return Object.keys(next).length === 0;
  }

  const atualizar = (id: string, campo: keyof LinhaRecebimento, value: string) =>
    setLinhas((current) => ({ ...current, [id]: { ...current[id]!, [campo]: value } }));

  return (
    <Dialog open={open} onOpenChange={(value) => !salvar.isPending && onOpenChange(value)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (validar()) salvar.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle className="font-display">Receber compra {pedido.numero}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3 rounded-lg bg-muted p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Fornecedor</span>
              <br />
              <strong>{pedido.fornecedores?.nome ?? "—"}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Status</span>
              <br />
              <strong>{pedido.status === "parcial" ? "Recebimento parcial" : "Enviado"}</strong>
            </p>
            <FormField id="data-recebimento" label="Data do recebimento *" error={erros["data"]}>
              <Input
                id="data-recebimento"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </FormField>
          </div>
          {erros["quantidade"] && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {erros["quantidade"]}
            </p>
          )}
          <div className="space-y-3">
            {pedido.itens_pedido_compra.map((item) => {
              const linha = linhas[item.id]!;
              const solicitado = Number(item.quantidade_solicitada);
              const jaRecebido = totalRecebido(item);
              const falta = Math.max(0, solicitado - jaRecebido);
              const qtdAtual = Number.isFinite(quantidade(linha.quantidade || "0"))
                ? Math.max(0, quantidade(linha.quantidade || "0"))
                : 0;
              const excedente = qtdAtual > falta;
              return (
                <section
                  key={item.id}
                  className={`space-y-3 rounded-lg border p-3 ${excedente ? "border-warning bg-warning/5" : "bg-card"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">
                        {item.materiais?.codigo} — {item.materiais?.nome ?? "Material"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Pedido: {numCompras(solicitado)}{" "}
                        {item.materiais?.unidades_medida?.sigla ?? "un"} · Recebido antes:{" "}
                        {numCompras(jaRecebido)} · Falta: {numCompras(falta)}
                      </p>
                    </div>
                    {excedente && (
                      <span className="flex items-center gap-1 text-xs font-medium text-warning-foreground">
                        <AlertTriangle className="h-3.5 w-3.5" /> Excedente de{" "}
                        {numCompras(qtdAtual - falta)}
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <FormField
                      id={`qtd-rec-${item.id}`}
                      label={`Quantidade recebida (${item.materiais?.unidades_medida?.sigla ?? "un"})`}
                      error={erros[`${item.id}.qtd`]}
                    >
                      <Input
                        id={`qtd-rec-${item.id}`}
                        inputMode="decimal"
                        value={linha.quantidade}
                        onChange={(e) => atualizar(item.id, "quantidade", e.target.value)}
                        placeholder="0"
                      />
                    </FormField>
                    <FormField id={`lote-${item.id}`} label="Lote do fornecedor">
                      <Input
                        id={`lote-${item.id}`}
                        value={linha.numero_lote}
                        onChange={(e) => atualizar(item.id, "numero_lote", e.target.value)}
                        placeholder="Opcional"
                      />
                    </FormField>
                    <FormField id={`fabricacao-${item.id}`} label="Fabricação">
                      <Input
                        id={`fabricacao-${item.id}`}
                        type="date"
                        value={linha.data_fabricacao}
                        onChange={(e) => atualizar(item.id, "data_fabricacao", e.target.value)}
                      />
                    </FormField>
                    <FormField
                      id={`validade-${item.id}`}
                      label="Validade"
                      error={erros[`${item.id}.validade`]}
                    >
                      <Input
                        id={`validade-${item.id}`}
                        type="date"
                        value={linha.validade}
                        onChange={(e) => atualizar(item.id, "validade", e.target.value)}
                      />
                    </FormField>
                  </div>
                  <FormField id={`obs-linha-${item.id}`} label="Divergência / observação do item">
                    <Input
                      id={`obs-linha-${item.id}`}
                      value={linha.observacoes}
                      onChange={(e) => atualizar(item.id, "observacoes", e.target.value)}
                      placeholder="Ex.: faltaram 2 unidades; embalagem avariada"
                    />
                  </FormField>
                </section>
              );
            })}
          </div>
          <FormField id="obs-recebimento" label="Observações gerais do recebimento">
            <Textarea
              id="obs-recebimento"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Transportadora, nota fiscal, ocorrência ou conferência"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Os itens sem quantidade informada ficam registrados como 0 neste recebimento. Cada
            quantidade positiva cria uma entrada auditável em estoque; o status do pedido é
            recalculado automaticamente.
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
            <Button type="submit" loading={salvar.isPending}>
              Registrar recebimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
