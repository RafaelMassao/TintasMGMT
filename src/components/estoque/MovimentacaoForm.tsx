import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FormField } from "@/components/shared/FormField";
import { FormModal } from "@/components/shared/FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import {
  LABEL_TIPO,
  TIPOS_MOVIMENTACAO,
  type ItemEstoque,
  type TipoMovimentacao,
} from "@/lib/estoque";

const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function MovimentacaoForm({
  open,
  onOpenChange,
  itens,
  perfis,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itens: ItemEstoque[];
  perfis: string[];
}) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoMovimentacao>("entrada_compra");
  const [itemId, setItemId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [data, setData] = useState(agoraLocal);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");

  const movimentoPermitidos = useMemo(
    () =>
      TIPOS_MOVIMENTACAO.filter((m) => {
        if (
          perfis.includes("administrador") ||
          perfis.includes("gestor") ||
          perfis.includes("estoque")
        )
          return true;
        if (perfis.includes("producao"))
          return ["entrada_producao", "saida_producao", "saida_perda"].includes(m.value);
        if (perfis.includes("vendas")) return m.value === "saida_venda";
        return false;
      }),
    [perfis],
  );

  useEffect(() => {
    if (!open) return;
    if (!movimentoPermitidos.some((m) => m.value === tipo))
      setTipo(movimentoPermitidos[0]?.value ?? "entrada_compra");
    if (!itens.some((item) => item.id === itemId)) setItemId(itens[0]?.id ?? "");
  }, [open, itens, itemId, movimentoPermitidos, tipo]);

  const salvar = useMutation({
    mutationFn: async () => {
      const item = itens.find((i) => i.id === itemId);
      const qtd = Number(quantidade.replace(",", "."));
      if (!item) throw new Error("Selecione um item do estoque.");
      if (!Number.isFinite(qtd) || qtd <= 0)
        throw new Error("A quantidade deve ser maior que zero.");
      if (!motivo.trim()) throw new Error("Informe a origem ou o motivo da movimentação.");
      if (!data) throw new Error("Informe a data da movimentação.");
      if (!movimentoPermitidos.some((m) => m.value === tipo))
        throw new Error("Seu perfil não pode registrar este tipo de movimentação.");

      const { data: auth } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("estoque_movimentacoes").insert({
        material_id: item.tipo === "material" ? item.id : null,
        produto_id: item.tipo === "produto" ? item.id : null,
        embalagem_id: item.tipo === "embalagem" ? item.id : null,
        tipo_movimentacao: tipo,
        quantidade: qtd,
        unidade_medida: item.unidade,
        data_movimentacao: new Date(data).toISOString(),
        motivo: motivo.trim(),
        usuario_id: auth.user?.id ?? null,
      });
      if (insertError) throw insertError;
    },
    onSuccess: async () => {
      notify.success("Movimentação registrada", "O saldo será recalculado a partir do histórico.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["estoque"] }),
        queryClient.invalidateQueries({ queryKey: ["estoque-historico"] }),
        queryClient.invalidateQueries({ queryKey: ["estoque-consumo"] }),
      ]);
      setQuantidade("");
      setMotivo("");
      setData(agoraLocal());
      onOpenChange(false);
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar movimentação"
      description="O saldo não é editado diretamente: cada alteração fica registrada no histórico."
      submitLabel="Registrar movimentação"
      submitting={salvar.isPending}
      onSubmit={() => {
        setErro("");
        salvar.mutate();
      }}
    >
      <FormField
        id="mov-tipo"
        label="Tipo de movimentação *"
        error={erro && !movimentoPermitidos.length ? erro : undefined}
      >
        <select
          className={selectClass}
          id="mov-tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoMovimentacao)}
        >
          {movimentoPermitidos.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="mov-item" label="Item *">
        <select
          className={selectClass}
          id="mov-item"
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
        >
          <option value="">Selecione um item...</option>
          {itens.map((item) => (
            <option key={`${item.tipo}-${item.id}`} value={item.id}>
              {LABEL_TIPO[item.tipo]} · {item.codigo ? `${item.codigo} — ` : ""}
              {item.nome} ({item.unidade})
            </option>
          ))}
        </select>
      </FormField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField
          id="mov-qtd"
          label="Quantidade *"
          error={erro.includes("quantidade") ? erro : undefined}
        >
          <Input
            id="mov-qtd"
            inputMode="decimal"
            placeholder="Ex.: 12,5"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </FormField>
        <FormField id="mov-data" label="Data e hora *">
          <Input
            id="mov-data"
            type="datetime-local"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </FormField>
      </div>
      <FormField
        id="mov-motivo"
        label="Origem ou motivo *"
        error={erro.includes("motivo") || erro.includes("origem") ? erro : undefined}
        hint="Ex.: NF de compra, lote de produção, pedido ou justificativa do ajuste."
      >
        <Textarea
          id="mov-motivo"
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={500}
          placeholder="Descreva a origem ou o motivo..."
        />
      </FormField>
      {tipo === "transferencia" && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
          O cadastro atual não controla depósitos/localizações. A transferência fica registrada no
          histórico, mas não altera o saldo global.
        </p>
      )}
      {erro &&
        !erro.includes("quantidade") &&
        !erro.includes("motivo") &&
        !erro.includes("origem") && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
    </FormModal>
  );
}
