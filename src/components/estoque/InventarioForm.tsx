import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FormField } from "@/components/shared/FormField";
import { FormModal } from "@/components/shared/FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import { LABEL_TIPO, formatarQuantidade, type ItemEstoque } from "@/lib/estoque";

export function InventarioForm({
  item,
  onOpenChange,
}: {
  item: ItemEstoque | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [quantidadeContada, setQuantidadeContada] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const aberto = item != null;
  const contado = quantidadeContada === "" ? null : Number(quantidadeContada.replace(",", "."));
  const diferencaPreview =
    item && contado != null && Number.isFinite(contado) ? contado - item.saldo : null;

  const salvar = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Selecione um item para inventariar.");
      if (contado == null || !Number.isFinite(contado) || contado < 0)
        throw new Error("Informe a quantidade física (zero ou maior).");

      const colunaItem =
        item.tipo === "material"
          ? "material_id"
          : item.tipo === "produto"
            ? "produto_id"
            : "embalagem_id";
      const { data: saldoRow, error: saldoError } = await supabase
        .from("v_estoque_saldo")
        .select("saldo")
        .eq(colunaItem, item.id)
        .maybeSingle();
      if (saldoError) throw saldoError;
      const saldoAtual = Number(saldoRow?.saldo ?? 0);
      const diferenca = contado - saldoAtual;
      if (diferenca === 0) return { semAjuste: true };

      const { data: auth } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("estoque_movimentacoes").insert({
        material_id: item.tipo === "material" ? item.id : null,
        produto_id: item.tipo === "produto" ? item.id : null,
        embalagem_id: item.tipo === "embalagem" ? item.id : null,
        tipo_movimentacao: diferenca > 0 ? "ajuste_positivo" : "ajuste_negativo",
        quantidade: Math.abs(diferenca),
        unidade_medida: item.unidade,
        data_movimentacao: new Date().toISOString(),
        motivo: `Inventário físico${observacao.trim() ? ` — ${observacao.trim()}` : ""}`,
        usuario_id: auth.user?.id ?? null,
      });
      if (insertError) throw insertError;
      return { semAjuste: false };
    },
    onSuccess: async (resultado) => {
      if (resultado.semAjuste)
        notify.info(
          "Inventário conferido",
          "A quantidade física coincide com o saldo registrado; nenhum ajuste foi necessário.",
        );
      else
        notify.success(
          "Inventário registrado",
          "A diferença foi lançada como movimentação de ajuste.",
        );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["estoque"] }),
        queryClient.invalidateQueries({ queryKey: ["estoque-historico"] }),
        queryClient.invalidateQueries({ queryKey: ["estoque-consumo"] }),
      ]);
      setQuantidadeContada("");
      setObservacao("");
      setErro("");
      onOpenChange(false);
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <FormModal
      open={aberto}
      onOpenChange={(open) => {
        if (!open) {
          setErro("");
          onOpenChange(false);
        }
      }}
      title="Contagem de inventário"
      description="Informe a quantidade física. O sistema registra somente a diferença como ajuste, sem editar o saldo diretamente."
      submitLabel="Registrar contagem"
      submitting={salvar.isPending}
      onSubmit={() => {
        setErro("");
        salvar.mutate();
      }}
    >
      {item && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            {item.codigo ? `${item.codigo} — ` : ""}
            {item.nome}
          </p>
          <p className="text-xs text-muted-foreground">
            {LABEL_TIPO[item.tipo]} · saldo atual: {formatarQuantidade(item.saldo)} {item.unidade}
          </p>
        </div>
      )}
      <FormField
        id="inventario-qtd"
        label={`Quantidade física *${item ? ` (${item.unidade})` : ""}`}
        error={erro.includes("quantidade") ? erro : undefined}
      >
        <Input
          id="inventario-qtd"
          inputMode="decimal"
          min="0"
          placeholder="Ex.: 0 ou 25,5"
          value={quantidadeContada}
          onChange={(e) => setQuantidadeContada(e.target.value)}
        />
      </FormField>
      {diferencaPreview != null && Number.isFinite(diferencaPreview) && (
        <p
          className={`rounded-md border p-3 text-sm ${diferencaPreview < 0 ? "border-warning/40 bg-warning/10" : diferencaPreview > 0 ? "border-info/40 bg-info/10" : "bg-muted/40"}`}
        >
          Diferença estimada:{" "}
          <strong>
            {diferencaPreview > 0 ? "+" : ""}
            {formatarQuantidade(diferencaPreview)} {item?.unidade}
          </strong>
        </p>
      )}
      <FormField
        id="inventario-obs"
        label="Observação"
        hint="Ajustes serão identificados como inventário físico no histórico."
      >
        <Textarea
          id="inventario-obs"
          rows={2}
          maxLength={400}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Ex.: contagem do corredor 2"
        />
      </FormField>
      {erro && !erro.includes("quantidade") && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </FormModal>
  );
}
