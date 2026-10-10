import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormField } from "@/components/shared/FormField";
import { FormModal } from "@/components/shared/FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";

export const TIPOS_OCORRENCIA = [
  { value: "atraso_producao", label: "Atraso de produção" },
  { value: "atraso_entrega", label: "Atraso de entrega" },
  { value: "falta_materia_prima", label: "Falta de matéria-prima" },
  { value: "falta_embalagem", label: "Falta de embalagem" },
  { value: "manutencao_maquina", label: "Manutenção de máquina" },
  { value: "retrabalho", label: "Retrabalho" },
  { value: "problema_qualidade", label: "Problema de qualidade" },
  { value: "atraso_fornecedor", label: "Atraso de fornecedor" },
  { value: "falha_programacao", label: "Falha de programação" },
] as const;

export const STATUS_OCORRENCIA = [
  { value: "aberta", label: "Aberta" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "resolvida", label: "Resolvida" },
  { value: "cancelada", label: "Cancelada" },
] as const;

export type ProdutoOpcao = { id: string; codigo: string | null; nome: string };
export type LoteOpcao = {
  id: string;
  numero_lote: string;
  produto_id: string;
  produtos?: { nome: string } | null;
};
export type PedidoOpcao = { id: string; numero: string };

type Valores = {
  tipo: string;
  origem: string;
  vinculo: "nenhum" | "lote" | "pedido";
  lote_id: string;
  pedido_id: string;
  produto_id: string;
  data_prevista: string;
  data_real: string;
  motivo: string;
  descricao: string;
  status: string;
};

function agoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const valoresIniciais = (): Valores => ({
  tipo: "atraso_producao",
  origem: "",
  vinculo: "nenhum",
  lote_id: "",
  pedido_id: "",
  produto_id: "",
  data_prevista: "",
  data_real: "",
  motivo: "",
  descricao: "",
  status: "aberta",
});

export function OcorrenciaForm({
  open,
  onOpenChange,
  produtos,
  lotes,
  pedidos,
  responsavel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  produtos: ProdutoOpcao[];
  lotes: LoteOpcao[];
  pedidos: PedidoOpcao[];
  responsavel: string;
}) {
  const qc = useQueryClient();
  const [v, setV] = useState<Valores>(valoresIniciais);
  const [erros, setErros] = useState<Partial<Record<keyof Valores, string>>>({});
  useEffect(() => {
    if (open) {
      setV(valoresIniciais());
      setErros({});
    }
  }, [open]);
  const set = (k: keyof Valores) => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const salvar = useMutation({
    mutationFn: async () => {
      const dataPrevista = v.data_prevista ? new Date(v.data_prevista).toISOString() : null;
      let dataReal = v.data_real ? new Date(v.data_real).toISOString() : null;
      if (v.status === "resolvida" && !dataReal) dataReal = new Date().toISOString();
      const { data, error } = await supabase.rpc("registrar_ocorrencia", {
        _tipo: v.tipo,
        _origem: v.origem.trim(),
        _lote_id: v.vinculo === "lote" ? v.lote_id || null : null,
        _pedido_id: v.vinculo === "pedido" ? v.pedido_id || null : null,
        _produto_id: v.produto_id || null,
        _data_prevista: dataPrevista,
        _data_real: dataReal,
        _motivo: v.motivo.trim(),
        _descricao: v.descricao.trim(),
        _status: v.status,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success("Ocorrência registrada");
      qc.invalidateQueries({ queryKey: ["ocorrencias"] });
      qc.invalidateQueries({ queryKey: ["dashboard-ocorrencias"] });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      notify.error("Não foi possível registrar a ocorrência", error.message),
  });

  function enviar() {
    const next: Partial<Record<keyof Valores, string>> = {};
    if (!v.origem.trim()) next.origem = "Informe a origem.";
    if (!v.data_prevista) next.data_prevista = "Informe a data prevista.";
    if (!v.motivo.trim()) next.motivo = "Informe o motivo.";
    if (!v.descricao.trim()) next.descricao = "Descreva a ocorrência.";
    if (v.vinculo === "lote" && !v.lote_id) next.lote_id = "Selecione o lote relacionado.";
    if (v.vinculo === "pedido" && !v.pedido_id) next.pedido_id = "Selecione o pedido relacionado.";
    if (v.status === "resolvida" && !v.data_real && !v.data_prevista) {
      next.data_real = "Informe a data real.";
    }
    if (v.data_real && v.status !== "resolvida" && v.status !== "cancelada") {
      next.data_real = "A data real só pode ser informada para ocorrência encerrada.";
    }
    setErros(next);
    if (Object.keys(next).length) return;
    salvar.mutate();
  }

  function selecionarLote(id: string) {
    const lote = lotes.find((x) => x.id === id);
    setV((s) => ({ ...s, lote_id: id, produto_id: lote?.produto_id ?? s.produto_id }));
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar ocorrência"
      submitLabel="Registrar ocorrência"
      onSubmit={enviar}
      submitting={salvar.isPending}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="ocorrencia-tipo" label="Tipo *">
          <select
            id="ocorrencia-tipo"
            className={selectClass}
            value={v.tipo}
            onChange={set("tipo")}
          >
            {TIPOS_OCORRENCIA.map((tipo) => (
              <option key={tipo.value} value={tipo.value}>
                {tipo.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="ocorrencia-origem" label="Origem *" error={erros.origem}>
          <Input
            id="ocorrencia-origem"
            value={v.origem}
            onChange={set("origem")}
            placeholder="Ex.: linha de envase, transportadora, fornecedor"
          />
        </FormField>
        <FormField id="ocorrencia-vinculo" label="Lote ou pedido relacionado">
          <select
            id="ocorrencia-vinculo"
            className={selectClass}
            value={v.vinculo}
            onChange={(e) =>
              setV((s) => ({
                ...s,
                vinculo: e.target.value as Valores["vinculo"],
                lote_id: "",
                pedido_id: "",
                produto_id: "",
              }))
            }
          >
            <option value="nenhum">Sem vínculo</option>
            <option value="lote">Lote de produção</option>
            <option value="pedido">Pedido</option>
          </select>
        </FormField>
        {v.vinculo === "lote" && (
          <FormField id="ocorrencia-lote" label="Lote *" error={erros.lote_id}>
            <select
              id="ocorrencia-lote"
              className={selectClass}
              value={v.lote_id}
              onChange={(e) => selecionarLote(e.target.value)}
            >
              <option value="">Selecione um lote</option>
              {lotes.map((lote) => (
                <option key={lote.id} value={lote.id}>
                  {lote.numero_lote}
                  {lote.produtos?.nome ? ` · ${lote.produtos.nome}` : ""}
                </option>
              ))}
            </select>
          </FormField>
        )}
        {v.vinculo === "pedido" && (
          <FormField id="ocorrencia-pedido" label="Pedido *" error={erros.pedido_id}>
            <select
              id="ocorrencia-pedido"
              className={selectClass}
              value={v.pedido_id}
              onChange={set("pedido_id")}
            >
              <option value="">Selecione um pedido</option>
              {pedidos.map((pedido) => (
                <option key={pedido.id} value={pedido.id}>
                  {pedido.numero}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField id="ocorrencia-produto" label="Produto para filtro">
          <select
            id="ocorrencia-produto"
            className={selectClass}
            value={v.produto_id}
            onChange={set("produto_id")}
          >
            <option value="">Não informado</option>
            {produtos.map((produto) => (
              <option key={produto.id} value={produto.id}>
                {produto.codigo ? `${produto.codigo} · ` : ""}
                {produto.nome}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="ocorrencia-prevista" label="Data prevista *" error={erros.data_prevista}>
          <Input
            id="ocorrencia-prevista"
            type="datetime-local"
            value={v.data_prevista}
            onChange={set("data_prevista")}
          />
        </FormField>
        <FormField id="ocorrencia-status" label="Status">
          <select
            id="ocorrencia-status"
            className={selectClass}
            value={v.status}
            onChange={(e) =>
              setV((s) => ({
                ...s,
                status: e.target.value,
                data_real:
                  e.target.value === "resolvida" && !s.data_real
                    ? agoraLocal()
                    : e.target.value === "aberta" || e.target.value === "em_andamento"
                      ? ""
                      : s.data_real,
              }))
            }
          >
            {STATUS_OCORRENCIA.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="ocorrencia-real" label="Data real / encerramento" error={erros.data_real}>
          <Input
            id="ocorrencia-real"
            type="datetime-local"
            value={v.data_real}
            onChange={set("data_real")}
            disabled={v.status !== "resolvida" && v.status !== "cancelada"}
          />
        </FormField>
        <FormField id="ocorrencia-responsavel" label="Responsável">
          <Input id="ocorrencia-responsavel" value={responsavel} readOnly aria-readonly="true" />
        </FormField>
        <FormField id="ocorrencia-motivo" label="Motivo *" error={erros.motivo}>
          <Input
            id="ocorrencia-motivo"
            value={v.motivo}
            onChange={set("motivo")}
            placeholder="Ex.: indisponibilidade de insumo"
          />
        </FormField>
      </div>
      <FormField id="ocorrencia-descricao" label="Descrição *" error={erros.descricao}>
        <Textarea
          id="ocorrencia-descricao"
          rows={4}
          value={v.descricao}
          onChange={set("descricao")}
          placeholder="Registre o impacto e as ações tomadas."
        />
      </FormField>
    </FormModal>
  );
}
