import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormField } from "@/components/shared/FormField";
import { FormModal } from "@/components/shared/FormModal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { supabase } from "@/integrations/supabase/client";

type EquipmentKind = "tanque" | "motor" | "bomba" | "envase" | "maquina_pintura";
export type EquipmentOption = { id: string; codigo: string; nome: string; ativo: boolean };
export type EquipmentRecord = EquipmentOption & {
  tipo: EquipmentKind;
  fabricante: string | null;
  modelo: string | null;
  numero_serie: string | null;
  localizacao: string | null;
  periodicidade_revisao_dias: number | null;
  ultima_revisao_em: string | null;
  proxima_revisao_em: string | null;
};

const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
};

function useRefreshMaintenance() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["manutencao-equipamentos"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-agenda"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-historico"] }),
      queryClient.invalidateQueries({ queryKey: ["manutencao-dashboard"] }),
    ]);
  };
}

export function EquipamentoForm({
  open,
  onOpenChange,
  equipamento,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipamento?: EquipmentRecord | null;
}) {
  const refresh = useRefreshMaintenance();
  const [codigo, setCodigo] = useState(equipamento?.codigo ?? "");
  const [nome, setNome] = useState(equipamento?.nome ?? "");
  const [tipo, setTipo] = useState<EquipmentKind>(equipamento?.tipo ?? "motor");
  const [localizacao, setLocalizacao] = useState(equipamento?.localizacao ?? "");
  const [fabricante, setFabricante] = useState(equipamento?.fabricante ?? "");
  const [modelo, setModelo] = useState(equipamento?.modelo ?? "");
  const [numeroSerie, setNumeroSerie] = useState(equipamento?.numero_serie ?? "");
  const [periodo, setPeriodo] = useState(
    equipamento?.periodicidade_revisao_dias ? String(equipamento.periodicidade_revisao_dias) : "",
  );
  const [erro, setErro] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const intervalo = periodo.trim() ? Number(periodo) : null;
      if (!codigo.trim() || !nome.trim()) throw new Error("Informe código e nome do equipamento.");
      if (intervalo !== null && (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 3650))
        throw new Error("A periodicidade deve ser um número inteiro entre 1 e 3.650 dias.");
      const values = {
        codigo: codigo.trim(),
        nome: nome.trim(),
        tipo,
        localizacao: localizacao.trim() || null,
        fabricante: fabricante.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: numeroSerie.trim() || null,
        periodicidade_revisao_dias: intervalo,
        ...(intervalo === null
          ? { proxima_revisao_em: null }
          : equipamento?.ultima_revisao_em
            ? { proxima_revisao_em: addDays(equipamento.ultima_revisao_em, intervalo) }
            : {}),
      };
      const result = equipamento
        ? await supabase.from("equipamentos").update(values).eq("id", equipamento.id)
        : await supabase.from("equipamentos").insert(values);
      if (result.error) throw result.error;
    },
    onSuccess: async () => {
      await refresh();
      if (!equipamento) {
        setCodigo("");
        setNome("");
        setTipo("motor");
        setLocalizacao("");
        setFabricante("");
        setModelo("");
        setNumeroSerie("");
        setPeriodo("");
      }
      onOpenChange(false);
    },
    onError: (error: Error) => setErro(error.message),
  });
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={equipamento ? "Editar equipamento" : "Cadastrar equipamento"}
      description="Informe os dados do ativo e, se aplicável, a periodicidade da revisão em dias."
      submitLabel={equipamento ? "Salvar alterações" : "Cadastrar equipamento"}
      submitting={mutation.isPending}
      onSubmit={() => {
        setErro("");
        mutation.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="equipamento-codigo" label="Código *">
          <Input
            id="equipamento-codigo"
            maxLength={40}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </FormField>
        <FormField id="equipamento-nome" label="Nome *">
          <Input
            id="equipamento-nome"
            maxLength={160}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="equipamento-tipo" label="Tipo *">
          <select
            id="equipamento-tipo"
            className={selectClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as EquipmentKind)}
          >
            <option value="tanque">Tanque</option>
            <option value="motor">Motor</option>
            <option value="bomba">Bomba</option>
            <option value="envase">Envase</option>
            <option value="maquina_pintura">Máquina de pintura</option>
          </select>
        </FormField>
        <FormField id="equipamento-periodicidade" label="Revisão a cada (dias)">
          <Input
            id="equipamento-periodicidade"
            type="number"
            min="1"
            max="3650"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            placeholder="Sem periodicidade definida"
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="equipamento-local" label="Localização">
          <Input
            id="equipamento-local"
            maxLength={120}
            value={localizacao}
            onChange={(e) => setLocalizacao(e.target.value)}
          />
        </FormField>
        <FormField id="equipamento-fabricante" label="Fabricante">
          <Input
            id="equipamento-fabricante"
            maxLength={120}
            value={fabricante}
            onChange={(e) => setFabricante(e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="equipamento-modelo" label="Modelo">
          <Input
            id="equipamento-modelo"
            maxLength={120}
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
          />
        </FormField>
        <FormField id="equipamento-serie" label="Número de série">
          <Input
            id="equipamento-serie"
            maxLength={120}
            value={numeroSerie}
            onChange={(e) => setNumeroSerie(e.target.value)}
          />
        </FormField>
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </FormModal>
  );
}

export function ManutencaoForm({
  open,
  onOpenChange,
  equipamentos,
  responsavelId,
  responsavelNome,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipamentos: EquipmentOption[];
  responsavelId: string | null;
  responsavelNome: string;
}) {
  const refresh = useRefreshMaintenance();
  const [equipamentoId, setEquipamentoId] = useState("");
  const [tipo, setTipo] = useState("preventiva");
  const [dataPrevista, setDataPrevista] = useState(today);
  const [descricao, setDescricao] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!equipamentoId) throw new Error("Selecione um equipamento.");
      if (!dataPrevista || !descricao.trim())
        throw new Error("Informe a data prevista e a descrição.");
      const { error } = await supabase.from("manutencoes").insert({
        equipamento_id: equipamentoId,
        tipo,
        data_prevista: dataPrevista,
        descricao: descricao.trim(),
        observacao: observacao.trim() || null,
        responsavel_id: responsavelId,
        responsavel_nome: responsavelNome,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setDescricao("");
      setObservacao("");
      onOpenChange(false);
    },
    onError: (error: Error) => setErro(error.message),
  });
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Agendar manutenção"
      description="Registre uma revisão preventiva, corretiva ou inspeção."
      submitLabel="Salvar agendamento"
      submitting={mutation.isPending}
      onSubmit={() => {
        setErro("");
        mutation.mutate();
      }}
    >
      <FormField id="manut-equipamento" label="Equipamento *">
        <select
          id="manut-equipamento"
          className={selectClass}
          value={equipamentoId}
          onChange={(e) => setEquipamentoId(e.target.value)}
        >
          <option value="">Selecione...</option>
          {equipamentos
            .filter((item) => item.ativo)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} — {item.nome}
              </option>
            ))}
        </select>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="manut-tipo" label="Tipo *">
          <select
            id="manut-tipo"
            className={selectClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="preventiva">Preventiva</option>
            <option value="corretiva">Corretiva</option>
            <option value="inspecao">Inspeção</option>
          </select>
        </FormField>
        <FormField id="manut-data-prevista" label="Data prevista *">
          <Input
            id="manut-data-prevista"
            type="date"
            value={dataPrevista}
            onChange={(e) => setDataPrevista(e.target.value)}
          />
        </FormField>
      </div>
      <FormField id="manut-descricao" label="Serviço / descrição *">
        <Input
          id="manut-descricao"
          maxLength={500}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: revisão semanal dos rolamentos"
        />
      </FormField>
      <FormField id="manut-observacao" label="Observação">
        <Textarea
          id="manut-observacao"
          rows={3}
          maxLength={2000}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
        />
      </FormField>
      <FormField id="manut-responsavel" label="Responsável">
        <Input id="manut-responsavel" value={responsavelNome} readOnly />
      </FormField>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </FormModal>
  );
}

export function ParadaForm({
  open,
  onOpenChange,
  equipamentos,
  responsavelId,
  responsavelNome,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipamentos: EquipmentOption[];
  responsavelId: string | null;
  responsavelNome: string;
}) {
  const refresh = useRefreshMaintenance();
  const [equipamentoId, setEquipamentoId] = useState("");
  const [causa, setCausa] = useState("");
  const [descricao, setDescricao] = useState("");
  const [inicio, setInicio] = useState(() => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  });
  const [erro, setErro] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      if (!equipamentoId || !causa.trim() || !inicio)
        throw new Error("Equipamento, início e causa são obrigatórios.");
      const inicioDate = new Date(inicio);
      if (Number.isNaN(inicioDate.getTime()) || inicioDate.getTime() > Date.now())
        throw new Error("O início da parada não pode estar no futuro.");
      const { error } = await supabase.from("paradas_equipamento").insert({
        equipamento_id: equipamentoId,
        inicio_em: inicioDate.toISOString(),
        causa: causa.trim(),
        descricao: descricao.trim() || null,
        responsavel_id: responsavelId,
        responsavel_nome: responsavelNome,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      setCausa("");
      setDescricao("");
      onOpenChange(false);
    },
    onError: (error: Error) => setErro(error.message),
  });
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar parada"
      description="A parada aberta marcará o equipamento como parado e acumulará o tempo indisponível até o encerramento."
      submitLabel="Registrar parada"
      submitting={mutation.isPending}
      onSubmit={() => {
        setErro("");
        mutation.mutate();
      }}
    >
      <FormField id="parada-equipamento" label="Equipamento *">
        <select
          id="parada-equipamento"
          className={selectClass}
          value={equipamentoId}
          onChange={(e) => setEquipamentoId(e.target.value)}
        >
          <option value="">Selecione...</option>
          {equipamentos
            .filter((item) => item.ativo)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.codigo} — {item.nome}
              </option>
            ))}
        </select>
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="parada-inicio" label="Início *">
          <Input
            id="parada-inicio"
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </FormField>
        <FormField id="parada-causa" label="Causa *">
          <Input
            id="parada-causa"
            maxLength={200}
            value={causa}
            onChange={(e) => setCausa(e.target.value)}
            placeholder="Ex.: falha elétrica"
          />
        </FormField>
      </div>
      <FormField id="parada-descricao" label="Descrição">
        <Textarea
          id="parada-descricao"
          rows={3}
          maxLength={2000}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </FormField>
      <FormField id="parada-responsavel" label="Responsável">
        <Input id="parada-responsavel" value={responsavelNome} readOnly />
      </FormField>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </FormModal>
  );
}
