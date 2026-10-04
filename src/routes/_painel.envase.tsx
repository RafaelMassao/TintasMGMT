import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormModal } from "@/components/shared/FormModal";
import { FormField } from "@/components/shared/FormField";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import { fmtDataHora, fmtNum, podeOperarProducao } from "@/lib/producao";
import {
  type Envase,
  SELECT_ENVASE,
  calcEnvase,
  fmtMin,
  fmtPct,
  lotesParaEnvase,
  opcoesEnvase,
  traduzirErroEnvase,
} from "@/lib/envase";

export const Route = createFileRoute("/_painel/envase")({
  head: () => ({
    meta: [
      { title: "Envase — Tintas Gestão" },
      { name: "description", content: "Registro de envase manual dos lotes de produção." },
      { property: "og:title", content: "Envase — Tintas Gestão" },
      { property: "og:description", content: "Registro de envase manual dos lotes de produção." },
    ],
  }),
  component: EnvasePage,
});

function EnvasePage() {
  const { perfis } = Route.useRouteContext();
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const podeOperar = podeOperarProducao(perfis);

  const envases = useQuery({
    queryKey: ["envases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("envases")
        .select(SELECT_ENVASE)
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Envase[];
    },
  });

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return envases.data ?? [];
    return (envases.data ?? []).filter(
      (e) =>
        e.lotes_producao?.numero_lote?.toLowerCase().includes(t) ||
        e.lotes_producao?.produtos?.nome?.toLowerCase().includes(t) ||
        e.embalagens?.nome?.toLowerCase().includes(t) ||
        e.operador?.nome?.toLowerCase().includes(t),
    );
  }, [envases.data, busca]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Envase"
        description="Registro do envase manual dos lotes."
        actions={
          podeOperar ? (
            <Button onClick={() => setNovo(true)}>
              <Plus className="h-4 w-4" /> Registrar envase
            </Button>
          ) : undefined
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por lote, produto, embalagem ou operador..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {envases.isLoading ? (
        <TableSkeleton rows={5} />
      ) : envases.error ? (
        <EmptyState title="Não foi possível carregar os envases" description={traduzirErroEnvase(envases.error.message)} />
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title={busca ? "Nenhum envase encontrado" : "Nenhum envase registrado"}
          description={busca ? "Tente outra busca." : "Registre o primeiro envase de um lote aguardando envase."}
          action={podeOperar && !busca ? <Button onClick={() => setNovo(true)}>Registrar envase</Button> : undefined}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((e) => {
            const c = calcEnvase(e);
            return (
              <li key={e.id} className="rounded-lg border bg-card p-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display font-semibold">{e.lotes_producao?.numero_lote ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.lotes_producao?.produtos ? `${e.lotes_producao.produtos.codigo} — ${e.lotes_producao.produtos.nome}` : "—"}
                    </p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">{e.embalagens?.nome ?? "—"}</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metrica label="Planejada" valor={fmtNum(e.quantidade_planejada)} />
                  <Metrica label="Aprovada" valor={fmtNum(e.quantidade_aprovada)} />
                  <Metrica label="Rejeitada" valor={fmtNum(e.quantidade_rejeitada)} />
                  <Metrica label="Aproveitamento" valor={fmtPct(c.pctAproveitamento)} destaque="success" />
                  <Metrica label="Rejeição" valor={fmtPct(c.pctRejeicao)} destaque="danger" />
                  <Metrica label="Tempo total" valor={fmtMin(c.minutos)} />
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  {e.operador?.nome ?? "Operador não informado"} · {fmtDataHora(e.inicio_envase ?? e.criado_em)}
                  {c.tempoMedioPorUnidade != null && ` · ${fmtNum(Math.round(c.tempoMedioPorUnidade * 100) / 100)} min/un.`}
                </p>
                {e.observacoes && <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{e.observacoes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {novo && <EnvaseForm open={novo} onOpenChange={setNovo} />}
    </div>
  );
}

function Metrica({ label, valor, destaque }: { label: string; valor: string; destaque?: "success" | "danger" }) {
  return (
    <div className="rounded-md bg-muted/50 px-1 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-semibold ${
          destaque === "success" ? "text-success" : destaque === "danger" ? "text-destructive" : ""
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

type Erros = Partial<Record<"lote" | "embalagem" | "plan" | "aprov" | "rej" | "datas", string>>;

function EnvaseForm({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [loteId, setLoteId] = useState("");
  const [embalagemId, setEmbalagemId] = useState("");
  const [operadorId, setOperadorId] = useState("");
  const [plan, setPlan] = useState("");
  const [aprov, setAprov] = useState("");
  const [rej, setRej] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [obs, setObs] = useState("");
  const [erros, setErros] = useState<Erros>({});

  const lotes = useQuery({ queryKey: ["lotes-envase"], queryFn: lotesParaEnvase });
  const opcoes = useQuery({ queryKey: ["opcoes-envase"], queryFn: opcoesEnvase });

  const salvar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("envases").insert({
        lote_id: loteId,
        embalagem_id: embalagemId,
        quantidade_planejada: Number(plan.replace(",", ".")),
        quantidade_aprovada: aprov ? Number(aprov.replace(",", ".")) : 0,
        quantidade_rejeitada: rej ? Number(rej.replace(",", ".")) : 0,
        inicio_envase: inicio ? new Date(inicio).toISOString() : null,
        fim_envase: fim ? new Date(fim).toISOString() : null,
        operador_id: operadorId || u.user?.id || null,
        observacoes: obs.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Envase registrado");
      qc.invalidateQueries({ queryKey: ["envases"] });
      qc.invalidateQueries({ queryKey: ["lote"] });
      onOpenChange(false);
    },
    onError: (e: Error) => notify.error("Não foi possível registrar o envase", traduzirErroEnvase(e.message)),
  });

  function validar(): { dados: string; ok: boolean } {
    const e: Erros = {};
    const p = Number(plan.replace(",", "."));
    const a = aprov ? Number(aprov.replace(",", ".")) : 0;
    const r = rej ? Number(rej.replace(",", ".")) : 0;
    if (!loteId) e.lote = "Selecione o lote.";
    if (!embalagemId) e.embalagem = "Selecione a embalagem.";
    if (!plan || Number.isNaN(p) || p <= 0) e.plan = "Informe a quantidade planejada (maior que zero).";
    if (Number.isNaN(a) || a < 0) e.aprov = "Não pode ser negativo.";
    if (Number.isNaN(r) || r < 0) e.rej = "Não pode ser negativo.";
    if (!e.plan && a + r > p) e.aprov = "Aprovada + rejeitada não pode passar do planejado.";
    if (inicio && fim && new Date(fim) < new Date(inicio)) e.datas = "O fim não pode ser antes do início.";
    setErros(e);
    const resumo = `Lote ${lotes.data?.find((l) => l.value === loteId)?.label ?? ""} · ${fmtNum(p)} un. planejadas, ${fmtNum(a)} aprovadas, ${fmtNum(r)} rejeitadas.`;
    return { dados: resumo, ok: Object.keys(e).length === 0 };
  }

  const [confirmacao, setConfirmacao] = useState<string | null>(null);

  return (
    <>
      <FormModal
        open={open && confirmacao == null}
        onOpenChange={(o) => !o && onOpenChange(false)}
        title="Registrar envase"
        description="Preencha os dados do envase manual do lote."
        submitLabel="Revisar e salvar"
        onSubmit={() => {
          const v = validar();
          if (v.ok) setConfirmacao(v.dados);
        }}
        submitting={salvar.isPending}
      >
        <FormField id="lote" label="Lote *" error={erros.lote} hint="Somente lotes aguardando envase ou em produção.">
          <select id="lote" className={selectClass} value={loteId} onChange={(e) => setLoteId(e.target.value)}>
            <option value="">Selecione...</option>
            {(lotes.data ?? []).map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </FormField>
        <FormField id="emb" label="Embalagem *" error={erros.embalagem}>
          <select id="emb" className={selectClass} value={embalagemId} onChange={(e) => setEmbalagemId(e.target.value)}>
            <option value="">Selecione...</option>
            {(opcoes.data?.embalagens ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField id="plan" label="Planejada *" error={erros.plan}>
            <Input id="plan" inputMode="numeric" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </FormField>
          <FormField id="aprov" label="Aprovada" error={erros.aprov}>
            <Input id="aprov" inputMode="numeric" value={aprov} onChange={(e) => setAprov(e.target.value)} />
          </FormField>
          <FormField id="rej" label="Rejeitada" error={erros.rej}>
            <Input id="rej" inputMode="numeric" value={rej} onChange={(e) => setRej(e.target.value)} />
          </FormField>
        </div>
        <FormField id="op" label="Operador" hint="Se não escolher, fica com o seu nome.">
          <select id="op" className={selectClass} value={operadorId} onChange={(e) => setOperadorId(e.target.value)}>
            <option value="">Eu mesmo</option>
            {(opcoes.data?.operadores ?? []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField id="ini" label="Início do envase" error={erros.datas}>
            <Input id="ini" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </FormField>
          <FormField id="fim" label="Fim do envase">
            <Input id="fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
          </FormField>
        </div>
        <FormField id="obs" label="Observação">
          <Textarea id="obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Algo importante sobre este envase..." />
        </FormField>
      </FormModal>

      <ConfirmDialog
        open={confirmacao != null}
        onOpenChange={(o) => !o && setConfirmacao(null)}
        title="Confirmar registro do envase?"
        description={confirmacao ?? ""}
        confirmLabel="Salvar envase"
        onConfirm={() => salvar.mutateAsync().then(() => setConfirmacao(null))}
      />
    </>
  );
}
