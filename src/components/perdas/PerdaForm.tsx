import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FormField } from "@/components/shared/FormField";
import { FormModal } from "@/components/shared/FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";

export type PerdaItemTipo = "material" | "produto" | "embalagem";
export type ItemOpcao = {
  id: string;
  codigo?: string | null;
  nome: string;
  unidade?: string | null;
  cor_id?: string | null;
  embalagem_id?: string | null;
};
export type OpcaoSimples = {
  id: string;
  nome: string;
  codigo?: string | null;
  unidade?: string | null;
};

export const ETAPAS_PERDA = [
  { value: "materia_prima", label: "Matéria-prima" },
  { value: "mistura", label: "Mistura" },
  { value: "bombeamento", label: "Bombeamento" },
  { value: "envase", label: "Envase" },
  { value: "embalagem", label: "Embalagem" },
  { value: "qualidade", label: "Qualidade" },
  { value: "validade", label: "Validade" },
  { value: "estoque", label: "Estoque" },
  { value: "transporte", label: "Transporte" },
] as const;

const hojeLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export function PerdaForm({
  open,
  onOpenChange,
  materiais,
  produtos,
  embalagens,
  cores,
  responsavel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materiais: ItemOpcao[];
  produtos: ItemOpcao[];
  embalagens: ItemOpcao[];
  cores: OpcaoSimples[];
  responsavel: string;
}) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(hojeLocal);
  const [tipoItem, setTipoItem] = useState<PerdaItemTipo>("produto");
  const [itemId, setItemId] = useState("");
  const [corId, setCorId] = useState("");
  const [embalagemId, setEmbalagemId] = useState("");
  const [lote, setLote] = useState("");
  const [etapa, setEtapa] = useState<(typeof ETAPAS_PERDA)[number]["value"]>("qualidade");
  const [motivo, setMotivo] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("");
  const [valorEstimado, setValorEstimado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [geraBaixa, setGeraBaixa] = useState(false);
  const [erro, setErro] = useState("");

  const itens = useMemo(
    () => (tipoItem === "material" ? materiais : tipoItem === "produto" ? produtos : embalagens),
    [tipoItem, materiais, produtos, embalagens],
  );
  const selecionado = itens.find((item) => item.id === itemId);

  useEffect(() => {
    if (!open) return;
    if (!itens.some((item) => item.id === itemId)) setItemId(itens[0]?.id ?? "");
  }, [open, itens, itemId]);

  useEffect(() => {
    if (!open || !selecionado) return;
    setUnidade(selecionado.unidade ?? "");
    if (tipoItem === "produto") {
      setCorId(selecionado.cor_id ?? "");
      setEmbalagemId(selecionado.embalagem_id ?? "");
    }
  }, [open, selecionado, tipoItem]);

  useEffect(() => {
    if (etapa !== "estoque") setGeraBaixa(false);
  }, [etapa]);

  const salvar = useMutation({
    mutationFn: async () => {
      const qtd = Number(quantidade.replace(",", "."));
      const valor = valorEstimado.trim() ? Number(valorEstimado.replace(",", ".")) : 0;
      if (!data) throw new Error("Informe a data da perda.");
      if (!selecionado) throw new Error("Selecione um produto, material ou embalagem.");
      if (!motivo.trim()) throw new Error("Informe o motivo da perda.");
      if (!Number.isFinite(qtd) || qtd <= 0)
        throw new Error("A quantidade deve ser maior que zero.");
      if (!unidade.trim()) throw new Error("Informe a unidade de medida.");
      if (!Number.isFinite(valor) || valor < 0)
        throw new Error("O valor estimado deve ser zero ou maior.");
      if (geraBaixa && etapa !== "estoque")
        throw new Error("A baixa automática exige a etapa Estoque.");

      const { error } = await supabase.rpc("registrar_perda", {
        _data: data,
        _item_tipo: tipoItem,
        _material_id: tipoItem === "material" ? itemId : null,
        _produto_id: tipoItem === "produto" ? itemId : null,
        _embalagem_id: tipoItem === "embalagem" ? itemId : null,
        _embalagem_referencia_id: embalagemId || null,
        _cor_id: corId || null,
        _lote: lote.trim() || null,
        _etapa: etapa,
        _motivo: motivo.trim(),
        _quantidade: qtd,
        _unidade: unidade.trim(),
        _valor_estimado: valor,
        _observacao: observacao.trim() || null,
        _gera_movimentacao_estoque: geraBaixa,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      notify.success(
        "Perda registrada",
        geraBaixa
          ? "A saída por perda também foi lançada no estoque."
          : "Registro salvo no histórico.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["perdas"] }),
        queryClient.invalidateQueries({ queryKey: ["estoque"] }),
        queryClient.invalidateQueries({ queryKey: ["estoque-historico"] }),
      ]);
      setData(hojeLocal());
      setLote("");
      setMotivo("");
      setQuantidade("");
      setValorEstimado("");
      setObservacao("");
      setGeraBaixa(false);
      onOpenChange(false);
    },
    onError: (e: Error) => setErro(e.message),
  });

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar perda"
      description="O registro fica auditável. A baixa de estoque, quando marcada, é gravada na mesma transação."
      submitLabel="Salvar perda"
      submitting={salvar.isPending}
      onSubmit={() => {
        setErro("");
        salvar.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="perda-data" label="Data *">
          <Input
            id="perda-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </FormField>
        <FormField id="perda-etapa" label="Etapa *">
          <select
            id="perda-etapa"
            className={selectClass}
            value={etapa}
            onChange={(e) => setEtapa(e.target.value as typeof etapa)}
          >
            {ETAPAS_PERDA.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="perda-tipo-item" label="Tipo do item *">
          <select
            id="perda-tipo-item"
            className={selectClass}
            value={tipoItem}
            onChange={(e) => {
              setTipoItem(e.target.value as PerdaItemTipo);
              setItemId("");
            }}
          >
            <option value="produto">Produto</option>
            <option value="material">Matéria-prima/material</option>
            <option value="embalagem">Embalagem</option>
          </select>
        </FormField>
        <FormField id="perda-item" label="Produto ou material *">
          <select
            id="perda-item"
            className={selectClass}
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Selecione...</option>
            {itens.map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo ? `${item.codigo} — ` : ""}
                {item.nome}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="perda-cor" label="Cor">
          <select
            id="perda-cor"
            className={selectClass}
            value={corId}
            onChange={(e) => setCorId(e.target.value)}
          >
            <option value="">Não informada</option>
            {cores.map((cor) => (
              <option key={cor.id} value={cor.id}>
                {cor.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="perda-embalagem" label="Embalagem">
          <select
            id="perda-embalagem"
            className={selectClass}
            value={embalagemId}
            onChange={(e) => setEmbalagemId(e.target.value)}
          >
            <option value="">Não informada</option>
            {embalagens.map((emb) => (
              <option key={emb.id} value={emb.id}>
                {emb.codigo ? `${emb.codigo} — ` : ""}
                {emb.nome}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="perda-lote" label="Lote">
          <Input
            id="perda-lote"
            value={lote}
            maxLength={100}
            onChange={(e) => setLote(e.target.value)}
            placeholder="Número do lote"
          />
        </FormField>
        <FormField id="perda-motivo" label="Motivo *">
          <Input
            id="perda-motivo"
            value={motivo}
            maxLength={200}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: contaminação"
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="perda-qtd" label="Quantidade *">
          <Input
            id="perda-qtd"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex.: 2,5"
          />
        </FormField>
        <FormField id="perda-unidade" label="Unidade *">
          <Input
            id="perda-unidade"
            value={unidade}
            maxLength={20}
            onChange={(e) => setUnidade(e.target.value)}
            placeholder="L, kg, un..."
          />
        </FormField>
        <FormField id="perda-valor" label="Valor estimado (R$)">
          <Input
            id="perda-valor"
            inputMode="decimal"
            value={valorEstimado}
            onChange={(e) => setValorEstimado(e.target.value)}
            placeholder="0,00"
          />
        </FormField>
      </div>
      {etapa === "estoque" && (
        <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={geraBaixa}
            onChange={(e) => setGeraBaixa(e.target.checked)}
          />
          <span>
            <span className="font-medium">Gerar saída por perda no estoque</span>
            <span className="block text-xs text-muted-foreground">
              A baixa será criada junto com a perda, de forma transacional.
            </span>
          </span>
        </label>
      )}
      <FormField id="perda-observacao" label="Observação">
        <Textarea
          id="perda-observacao"
          rows={3}
          value={observacao}
          maxLength={1000}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Detalhes adicionais..."
        />
      </FormField>
      <FormField id="perda-responsavel" label="Responsável">
        <Input id="perda-responsavel" value={responsavel || "Usuário autenticado"} readOnly />
      </FormField>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </FormModal>
  );
}
