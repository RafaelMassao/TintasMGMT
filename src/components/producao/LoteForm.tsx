import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FormModal } from "@/components/shared/FormModal";
import { FormField } from "@/components/shared/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import { type Lote, opcoesProducao, traduzirErroProducao } from "@/lib/producao";

export const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

type Chave = "numero_lote" | "produto_id" | "tanque_id" | "quantidade_planejada" | "volume_planejado_litros" | "quantidade_produzida" | "volume_produzido_litros" | "data_planejada" | "observacoes";
type Valores = Record<Chave, string>;

export function LoteForm({
  lote,
  open,
  onOpenChange,
  onSalvo,
}: {
  lote: Lote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSalvo?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const opcoes = useQuery({ queryKey: ["opcoes", "producao"], queryFn: opcoesProducao, enabled: open });
  const [v, setV] = useState<Valores>(() => ({
    numero_lote: lote?.numero_lote ?? "",
    produto_id: lote?.produto_id ?? "",
    tanque_id: lote?.tanque_id ?? "",
    quantidade_planejada: lote ? String(lote.quantidade_planejada) : "",
    volume_planejado_litros: lote ? String(lote.volume_planejado_litros) : "",
    quantidade_produzida: lote ? String(lote.quantidade_produzida) : "0",
    volume_produzido_litros: lote ? String(lote.volume_produzido_litros) : "0",
    data_planejada: lote?.data_planejada ?? "",
    observacoes: lote?.observacoes ?? "",
  }));
  const [erros, setErros] = useState<Partial<Valores>>({});
  const set = (k: Chave) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const salvar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => {
      if (lote) {
        const { error } = await supabase.from("lotes_producao").update(dados).eq("id", lote.id);
        if (error) throw error;
        return lote.id;
      }
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("lotes_producao")
        .insert({ ...dados, criado_por: u.user?.id })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      notify.success(lote ? "Lote atualizado" : "Lote criado");
      qc.invalidateQueries({ queryKey: ["lotes"] });
      qc.invalidateQueries({ queryKey: ["lote", id] });
      onOpenChange(false);
      onSalvo?.(id);
    },
    onError: (e: Error) => notify.error("Não foi possível salvar", traduzirErroProducao(e.message)),
  });

  function enviar() {
    const e: Partial<Valores> = {};
    if (!v.numero_lote.trim()) e.numero_lote = "Informe o número do lote.";
    if (!v.produto_id) e.produto_id = "Escolha o produto.";
    const n = (k: Chave, obrig: boolean) => {
      const raw = (v[k] ?? "").replace(",", ".");
      if (!raw) {
        if (obrig) e[k] = "Campo obrigatório.";
        return 0;
      }
      const x = Number(raw);
      if (Number.isNaN(x) || x < 0) e[k] = "Informe um número igual ou maior que zero.";
      return x;
    };
    const qp = n("quantidade_planejada", true);
    const vp = n("volume_planejado_litros", true);
    const qprod = n("quantidade_produzida", false);
    const vprod = n("volume_produzido_litros", false);
    const cap = opcoes.data?.tanques.find((t) => t.value === v.tanque_id)?.capacidade;
    if (cap && vp > cap) e.volume_planejado_litros = `Maior que a capacidade do tanque (${cap} L).`;
    setErros(e);
    if (Object.keys(e).length) return;
    salvar.mutate({
      numero_lote: v.numero_lote.trim(),
      produto_id: v.produto_id,
      tanque_id: v.tanque_id || null,
      quantidade_planejada: qp,
      volume_planejado_litros: vp,
      ...(lote ? { quantidade_produzida: qprod, volume_produzido_litros: vprod } : {}),
      data_planejada: v.data_planejada || null,
      observacoes: v.observacoes.trim() || null,
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={lote ? `Editar lote ${lote.numero_lote}` : "Novo lote"}
      submitLabel={lote ? "Salvar alterações" : "Criar lote"}
      onSubmit={enviar}
      submitting={salvar.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="numero_lote" label="Número do lote *" error={erros.numero_lote}>
          <Input id="numero_lote" value={v.numero_lote} onChange={set("numero_lote")} placeholder="Ex.: L2026-0001" />
        </FormField>
        <FormField id="data_planejada" label="Data planejada">
          <Input id="data_planejada" type="date" value={v.data_planejada} onChange={set("data_planejada")} />
        </FormField>
        <FormField id="produto_id" label="Produto *" error={erros.produto_id}>
          <select id="produto_id" className={selectClass} value={v.produto_id} onChange={set("produto_id")}>
            <option value="">{opcoes.isLoading ? "Carregando..." : "Selecione"}</option>
            {opcoes.data?.produtos.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FormField>
        <FormField id="tanque_id" label="Tanque">
          <select id="tanque_id" className={selectClass} value={v.tanque_id} onChange={set("tanque_id")}>
            <option value="">Sem tanque</option>
            {opcoes.data?.tanques.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FormField>
        <FormField id="quantidade_planejada" label="Quantidade planejada *" error={erros.quantidade_planejada}>
          <Input id="quantidade_planejada" inputMode="decimal" value={v.quantidade_planejada} onChange={set("quantidade_planejada")} />
        </FormField>
        <FormField id="volume_planejado_litros" label="Volume planejado (L) *" error={erros.volume_planejado_litros}>
          <Input id="volume_planejado_litros" inputMode="decimal" value={v.volume_planejado_litros} onChange={set("volume_planejado_litros")} />
        </FormField>
        {lote && (
          <>
            <FormField id="quantidade_produzida" label="Quantidade produzida" error={erros.quantidade_produzida}>
              <Input id="quantidade_produzida" inputMode="decimal" value={v.quantidade_produzida} onChange={set("quantidade_produzida")} />
            </FormField>
            <FormField id="volume_produzido_litros" label="Volume produzido (L)" error={erros.volume_produzido_litros}>
              <Input id="volume_produzido_litros" inputMode="decimal" value={v.volume_produzido_litros} onChange={set("volume_produzido_litros")} />
            </FormField>
          </>
        )}
      </div>
      <FormField id="observacoes" label="Observações gerais">
        <Textarea id="observacoes" rows={3} value={v.observacoes} onChange={set("observacoes")} />
      </FormField>
    </FormModal>
  );
}
