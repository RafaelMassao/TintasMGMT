import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, CheckCircle2, Pencil, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormModal } from "@/components/shared/FormModal";
import { FormField } from "@/components/shared/FormField";
import { TableSkeleton } from "@/components/shared/Skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoteForm, selectClass } from "@/components/producao/LoteForm";
import { notify } from "@/lib/notify";
import {
  type Lote,
  type StatusLote,
  FINALIZADOS,
  SELECT_LOTE,
  STATUS_INFO,
  fmtData,
  fmtDataHora,
  fmtLitros,
  fmtNum,
  nomeTanque,
  podeEditarLote,
  podeOperarProducao,
  traduzirErroProducao,
} from "@/lib/producao";

export const Route = createFileRoute("/_painel/producao/$id")({
  head: () => ({
    meta: [
      { title: "Detalhe do lote — Tintas Gestão" },
      { name: "description", content: "Dados, envases, observações e histórico do lote de produção." },
      { property: "og:title", content: "Detalhe do lote — Tintas Gestão" },
      { property: "og:description", content: "Dados, envases, observações e histórico do lote de produção." },
    ],
  }),
  component: LoteDetalhe,
});

const CAMPO_LABEL: Record<string, string> = {
  numero_lote: "Número do lote",
  produto_id: "Produto",
  tanque_id: "Tanque",
  quantidade_planejada: "Qtd. planejada",
  quantidade_produzida: "Qtd. produzida",
  volume_planejado_litros: "Volume planejado",
  volume_produzido_litros: "Volume produzido",
  data_planejada: "Data planejada",
  inicio_producao: "Início",
  fim_producao: "Fim",
  observacoes: "Observações",
};

function LoteDetalhe() {
  const { id } = Route.useParams();
  const { perfis } = Route.useRouteContext();
  const qc = useQueryClient();
  const [editar, setEditar] = useState(false);
  const [concluir, setConcluir] = useState(false);

  const lote = useQuery({
    queryKey: ["lote", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("lotes_producao").select(SELECT_LOTE).eq("id", id).maybeSingle();
      if (error) throw error;
      return data as unknown as Lote | null;
    },
  });
  const envases = useQuery({
    queryKey: ["lote", id, "envases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("envases")
        .select("id, quantidade_planejada, quantidade_aprovada, quantidade_rejeitada, inicio_envase, fim_envase, embalagens(nome), operador:profiles!envases_operador_id_fkey(nome)")
        .eq("lote_id", id)
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const obs = useQuery({
    queryKey: ["lote", id, "obs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lote_observacoes").select("*").eq("lote_id", id).order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const hist = useQuery({
    queryKey: ["lote", id, "hist"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lote_historico").select("*").eq("lote_id", id).order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const atualizar = useMutation({
    mutationFn: async ({ dados }: { dados: Record<string, unknown>; msg: string }) => {
      const { error } = await supabase.from("lotes_producao").update(dados).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, { msg }) => {
      notify.success(msg);
      qc.invalidateQueries({ queryKey: ["lote", id] });
      qc.invalidateQueries({ queryKey: ["lotes"] });
    },
    onError: (e: Error) => notify.error("Não foi possível atualizar o lote", traduzirErroProducao(e.message)),
  });

  if (lote.isLoading) return <TableSkeleton rows={6} />;
  if (lote.error)
    return <EmptyState title="Não foi possível abrir o lote" description={traduzirErroProducao(lote.error.message)} />;
  const l = lote.data;
  if (!l)
    return (
      <EmptyState
        title="Lote não encontrado"
        action={<Button asChild variant="outline"><Link to="/producao">Voltar para Produção</Link></Button>}
      />
    );

  const st = STATUS_INFO[l.status];
  const editavel = podeEditarLote(perfis, l.status);
  const operar = podeOperarProducao(perfis) && !FINALIZADOS.includes(l.status);
  const podeIniciar = operar && ["planejado", "em_preparacao", "atrasado"].includes(l.status);
  const podeConcluir = operar && ["em_producao", "aguardando_envase", "atrasado"].includes(l.status);
  const podeAtrasar = operar && l.status !== "atrasado";

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/producao"><ArrowLeft className="h-4 w-4" /> Lotes</Link>
      </Button>
      <PageHeader
        title={`Lote ${l.numero_lote}`}
        description={l.produtos ? `${l.produtos.codigo} — ${l.produtos.nome}` : undefined}
        actions={
          <>
            {podeIniciar && (
              <Button
                loading={atualizar.isPending}
                onClick={() => atualizar.mutate({ dados: { status: "em_producao", inicio_producao: new Date().toISOString() }, msg: "Produção iniciada" })}
              >
                <Play className="h-4 w-4" /> Iniciar produção
              </Button>
            )}
            {podeConcluir && (
              <Button variant="secondary" onClick={() => setConcluir(true)}>
                <CheckCircle2 className="h-4 w-4" /> Concluir produção
              </Button>
            )}
            {podeAtrasar && (
              <ConfirmDialog
                title="Marcar lote como atrasado?"
                description="O lote ficará destacado como atrasado na lista."
                confirmLabel="Marcar como atrasado"
                onConfirm={() => atualizar.mutateAsync({ dados: { status: "atrasado" }, msg: "Lote marcado como atrasado" })}
                trigger={<Button variant="outline"><AlertTriangle className="h-4 w-4" /> Marcar atrasado</Button>}
              />
            )}
            {editavel && (
              <Button variant="outline" onClick={() => setEditar(true)}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            )}
          </>
        }
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-4"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Produto" valor={l.produtos ? `${l.produtos.codigo} — ${l.produtos.nome}` : "—"} />
          <Info label="Cor" valor={l.produtos?.cores?.nome ?? "—"} />
          <Info label="Embalagem padrão" valor={l.produtos?.embalagens?.nome ?? "—"} />
          <Info label="Tanque" valor={nomeTanque(l)} />
          <Info label="Quantidade planejada" valor={fmtNum(l.quantidade_planejada)} />
          <Info label="Quantidade produzida" valor={fmtNum(l.quantidade_produzida)} />
          <Info label="Volume planejado" valor={fmtLitros(l.volume_planejado_litros)} />
          <Info label="Volume produzido" valor={fmtLitros(l.volume_produzido_litros)} />
          <Info label="Data planejada" valor={fmtData(l.data_planejada)} />
          <Info label="Início da produção" valor={fmtDataHora(l.inicio_producao)} />
          <Info label="Fim da produção" valor={fmtDataHora(l.fim_producao)} />
          <Info label="Última alteração" valor={fmtDataHora(l.atualizado_em)} />
        </dl>
        {l.observacoes && <p className="mt-4 whitespace-pre-wrap border-t pt-4 text-sm">{l.observacoes}</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Bloco titulo="Envases relacionados">
          {envases.isLoading ? <TableSkeleton rows={2} columns={3} /> : envases.data?.length ? (
            <ul className="divide-y text-sm">
              {envases.data.map((e) => (
                <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium">{e.embalagens?.nome ?? "—"}</span>
                  <span className="text-muted-foreground">
                    Planej. {fmtNum(e.quantidade_planejada)} · Aprov. {fmtNum(e.quantidade_aprovada)} · Rejeit. {fmtNum(e.quantidade_rejeitada)}
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="Nenhum envase registrado" />}
        </Bloco>
        <Bloco titulo="Perdas relacionadas">
          <EmptyState compact title="Nenhuma perda registrada" description="O registro de perdas será ligado aqui quando o módulo de Perdas estiver pronto." />
        </Bloco>
        <Bloco titulo="Paradas de máquina relacionadas">
          <EmptyState compact title="Nenhuma parada registrada" description="As paradas aparecerão aqui quando o módulo de Manutenção estiver pronto." />
        </Bloco>
        <Observacoes loteId={id} itens={obs.data ?? []} loading={obs.isLoading} podeRegistrar={podeOperarProducao(perfis)} />
      </div>

      <Bloco titulo="Histórico de alterações">
        {hist.isLoading ? <TableSkeleton rows={3} columns={3} /> : hist.data?.length ? (
          <ol className="space-y-3 text-sm">
            {hist.data.map((h) => (
              <li key={h.id} className="border-l-2 border-border pl-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{fmtDataHora(h.criado_em)}</span>
                  <span className="font-medium">{h.usuario_nome ?? "Usuário"}</span>
                  {h.acao === "criado" ? <span>criou o lote</span> : h.acao === "status" ? (
                    <span className="flex items-center gap-1">mudou o status
                      {h.status_anterior && <StatusBadge tone={STATUS_INFO[h.status_anterior as StatusLote].tone}>{STATUS_INFO[h.status_anterior as StatusLote].label}</StatusBadge>}
                      →
                      <StatusBadge tone={STATUS_INFO[h.status_novo as StatusLote].tone}>{STATUS_INFO[h.status_novo as StatusLote].label}</StatusBadge>
                    </span>
                  ) : <span>editou o lote</span>}
                </div>
                {h.alteracoes && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alterou: {Object.keys(h.alteracoes).map((k) => CAMPO_LABEL[k] ?? k).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : <EmptyState compact title="Sem alterações registradas" />}
      </Bloco>

      {editar && <LoteForm lote={l} open={editar} onOpenChange={setEditar} />}
      {concluir && (
        <ConcluirModal
          lote={l}
          onClose={() => setConcluir(false)}
          onConfirm={(dados) => atualizar.mutateAsync({ dados, msg: "Produção concluída" }).then(() => setConcluir(false))}
          enviando={atualizar.isPending}
        />
      )}
    </div>
  );
}

function Info({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{valor}</dd>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 font-display text-base font-semibold">{titulo}</h2>
      {children}
    </section>
  );
}

function ConcluirModal({
  lote,
  onClose,
  onConfirm,
  enviando,
}: {
  lote: Lote;
  onClose: () => void;
  onConfirm: (d: Record<string, unknown>) => Promise<void>;
  enviando: boolean;
}) {
  const [qtd, setQtd] = useState(lote.quantidade_produzida ? String(lote.quantidade_produzida) : "");
  const [vol, setVol] = useState(lote.volume_produzido_litros ? String(lote.volume_produzido_litros) : "");
  const [status, setStatus] = useState<StatusLote>("concluido");
  const [erro, setErro] = useState<{ qtd?: string; vol?: string }>({});

  function enviar() {
    const q = Number(qtd.replace(",", "."));
    const v = vol ? Number(vol.replace(",", ".")) : 0;
    const e: { qtd?: string; vol?: string } = {};
    if (!qtd || Number.isNaN(q) || q <= 0) e.qtd = "Informe a quantidade produzida (maior que zero).";
    if (Number.isNaN(v) || v < 0) e.vol = "Volume inválido.";
    setErro(e);
    if (Object.keys(e).length) return;
    onConfirm({ status, quantidade_produzida: q, volume_produzido_litros: v, fim_producao: new Date().toISOString() }).catch(() => {});
  }

  return (
    <FormModal open onOpenChange={(o) => !o && onClose()} title="Concluir produção" submitLabel="Concluir" onSubmit={enviar} submitting={enviando}>
      <FormField id="qtd" label="Quantidade produzida *" error={erro.qtd}>
        <Input id="qtd" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />
      </FormField>
      <FormField id="vol" label="Volume produzido (L)" error={erro.vol}>
        <Input id="vol" inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} />
      </FormField>
      <FormField id="st" label="Resultado">
        <select id="st" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as StatusLote)}>
          <option value="concluido">Concluído</option>
          <option value="parcialmente_concluido">Parcialmente concluído</option>
          <option value="aguardando_envase">Aguardando envase</option>
        </select>
      </FormField>
    </FormModal>
  );
}

function Observacoes({ loteId, itens, loading, podeRegistrar }: { loteId: string; itens: any[]; loading: boolean; podeRegistrar: boolean }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const salvar = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const nome = (u.user?.user_metadata?.["nome"] as string | undefined) ?? u.user?.email ?? null;
      const { error } = await supabase.from("lote_observacoes").insert({ lote_id: loteId, texto: texto.trim(), autor_id: u.user?.id, autor_nome: nome });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      notify.success("Observação registrada");
      qc.invalidateQueries({ queryKey: ["lote", loteId, "obs"] });
    },
    onError: (e: Error) => notify.error("Não foi possível registrar", traduzirErroProducao(e.message)),
  });

  return (
    <Bloco titulo="Observações">
      {podeRegistrar && (
        <form
          className="mb-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!texto.trim()) { notify.warning("Escreva a observação antes de registrar."); return; }
            salvar.mutate();
          }}
        >
          <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma observação sobre o lote..." />
          <Button type="submit" size="sm" loading={salvar.isPending}>Registrar observação</Button>
        </form>
      )}
      {loading ? <TableSkeleton rows={2} columns={2} /> : itens.length ? (
        <ul className="space-y-3 text-sm">
          {itens.map((o) => (
            <li key={o.id} className="rounded-md bg-muted/50 p-3">
              <p className="whitespace-pre-wrap">{o.texto}</p>
              <p className="mt-1 text-xs text-muted-foreground">{o.autor_nome ?? "Usuário"} · {fmtDataHora(o.criado_em)}</p>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title="Nenhuma observação" />}
    </Bloco>
  );
}
