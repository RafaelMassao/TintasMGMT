import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { CadastroConfig, Campo, Registro } from "@/lib/cadastros/config";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { FilterBar } from "@/components/shared/FilterBar";
import { FormModal } from "@/components/shared/FormModal";
import { FormField } from "@/components/shared/FormField";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";

const POR_PAGINA = 10;
const NENHUM = "__nenhum__";
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function traduzirErro(msg: string) {
  if (/duplicate key|unique/i.test(msg)) return "Já existe um registro com esse código, nome ou documento.";
  if (/row-level security|permission denied/i.test(msg)) return "Você não tem permissão para esta ação.";
  if (/foreign key/i.test(msg)) return "Este registro está ligado a outros dados.";
  return "Tente novamente. Se persistir, contate o suporte.";
}

export function CadastroCrud({ config, podeEditar }: { config: CadastroConfig; podeEditar: boolean }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [status, setStatus] = useState("ativos");
  const [pagina, setPagina] = useState(0);
  const [editando, setEditando] = useState<Registro | null | undefined>(undefined);

  useEffect(() => {
    const id = setTimeout(() => {
      setBuscaAtiva(busca.replace(/[,()%*\\]/g, " ").trim());
      setPagina(0);
    }, 300);
    return () => clearTimeout(id);
  }, [busca]);

  const chave = ["cadastro", config.tabela];
  const lista = useQuery({
    queryKey: [...chave, buscaAtiva, status, pagina],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from(config.tabela).select(config.select, { count: "exact" });
      if (status !== "todos") q = q.eq("ativo", status === "ativos");
      if (buscaAtiva) q = q.or(config.busca.map((c) => `${c}.ilike.%${buscaAtiva}%`).join(","));
      const { data, error, count } = await q
        .order(config.ordem)
        .range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
      if (error) throw error;
      return { linhas: (data ?? []) as unknown as Registro[], total: count ?? 0 };
    },
  });

  useEffect(() => {
    if (lista.error) notify.error("Não foi possível carregar os dados", traduzirErro(lista.error.message));
  }, [lista.error]);

  const alternarAtivo = useMutation({
    mutationFn: async (r: Registro) => {
      const { error } = await supabase.from(config.tabela).update({ ativo: !r.ativo }).eq("id", r.id);
      if (error) throw error;
      return r;
    },
    onSuccess: (r) => {
      notify.success(r.ativo ? "Registro inativado" : "Registro reativado");
      qc.invalidateQueries({ queryKey: ["cadastro"] });
    },
    onError: (e: Error) => notify.error("Não foi possível alterar", traduzirErro(e.message)),
  });

  const total = lista.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const colunas: Column<Registro>[] = [
    ...config.colunas.map((c) => ({
      key: c.chave,
      header: c.titulo,
      cell: (r: Registro) => c.valor(r),
      primary: c.principal,
      hideOnMobile: c.esconderCelular,
    })),
    {
      key: "ativo",
      header: "Situação",
      cell: (r) => <StatusBadge tone={r.ativo ? "success" : "neutral"}>{r.ativo ? "Ativo" : "Inativo"}</StatusBadge>,
    },
  ];

  return (
    <div className="space-y-4">
      <FilterBar
        search={busca}
        onSearchChange={setBusca}
        searchPlaceholder={`Buscar ${config.titulo.toLowerCase()}...`}
        filters={[
          {
            id: "status",
            placeholder: "Situação",
            value: status,
            onChange: (v) => {
              setStatus(v);
              setPagina(0);
            },
            options: [
              { value: "ativos", label: "Somente ativos" },
              { value: "inativos", label: "Somente inativos" },
              { value: "todos", label: "Todos" },
            ],
          },
        ]}
        actions={
          podeEditar && (
            <Button onClick={() => setEditando(null)}>
              <Plus className="h-4 w-4" /> Novo {config.singular}
            </Button>
          )
        }
      />

      <DataTable
        columns={colunas}
        rows={lista.data?.linhas ?? []}
        getRowId={(r) => r.id}
        loading={lista.isLoading}
        emptyTitle={buscaAtiva ? "Nada encontrado" : `Nenhum ${config.singular} cadastrado`}
        emptyDescription={buscaAtiva ? "Tente outra palavra na busca." : podeEditar ? `Clique em "Novo ${config.singular}" para começar.` : undefined}
        rowActions={
          podeEditar
            ? (r) => (
                <div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditando(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {r.ativo ? (
                    <ConfirmDialog
                      title={`Inativar ${config.singular}?`}
                      description="O registro deixa de aparecer nas escolhas do sistema, mas o histórico é mantido. Você pode reativá-lo depois."
                      confirmLabel="Inativar"
                      onConfirm={() => alternarAtivo.mutateAsync(r).then(() => undefined, () => undefined)}
                      trigger={
                        <Button size="icon" variant="ghost" aria-label="Inativar" className="text-destructive">
                          <Power className="h-4 w-4" />
                        </Button>
                      }
                    />
                  ) : (
                    <Button size="icon" variant="ghost" aria-label="Reativar" onClick={() => alternarAtivo.mutate(r)}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )
            : undefined
        }
      />

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} registro{total !== 1 && "s"} · página {pagina + 1} de {paginas}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Próxima <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {editando !== undefined && (
        <Formulario config={config} registro={editando} onClose={() => setEditando(undefined)} />
      )}
    </div>
  );
}

function valorInicial(c: Campo, r: Registro | null) {
  const v = r?.[c.nome];
  return v === null || v === undefined ? "" : String(v);
}

function Formulario({ config, registro, onClose }: { config: CadastroConfig; registro: Registro | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.campos.map((c) => [c.nome, valorInicial(c, registro)])),
  );
  const [erros, setErros] = useState<Record<string, string>>({});

  const salvar = useMutation({
    mutationFn: async (dados: Record<string, unknown>) => {
      const { error } = registro
        ? await supabase.from(config.tabela).update(dados).eq("id", registro.id)
        : await supabase.from(config.tabela).insert(dados);
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success(registro ? "Alterações salvas" : "Cadastro criado");
      qc.invalidateQueries({ queryKey: ["cadastro"] });
      qc.invalidateQueries({ queryKey: ["opcoes"] });
      onClose();
    },
    onError: (e: Error) => notify.error("Não foi possível salvar", traduzirErro(e.message)),
  });

  async function enviar() {
    const novosErros: Record<string, string> = {};
    const dados: Record<string, unknown> = {};
    for (const c of config.campos) {
      const v = (valores[c.nome] ?? "").trim();
      if (!v) {
        if (c.obrigatorio) novosErros[c.nome] = "Campo obrigatório";
        dados[c.nome] = null;
        continue;
      }
      if ("max" in c && c.max && v.length > c.max) novosErros[c.nome] = `Máximo de ${c.max} caracteres`;
      if (c.tipo === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) novosErros[c.nome] = "E-mail inválido";
      if (c.tipo === "numero") {
        const n = Number(v.replace(/\./g, "").replace(",", ".").trim() === "" ? NaN : v.replace(",", "."));
        if (!Number.isFinite(n)) novosErros[c.nome] = "Informe um número válido";
        else if (c.min !== undefined && n < c.min) novosErros[c.nome] = c.min > 0 ? "Deve ser maior que zero" : "Não pode ser negativo";
        dados[c.nome] = n;
      } else dados[c.nome] = c.tipo === "uf" || c.nome === "codigo" ? v.toUpperCase() : v;
    }
    Object.assign(novosErros, config.validar?.(dados) ?? {});

    // Impede duplicados (o banco também bloqueia)
    for (const c of config.campos.filter((x) => x.unico && dados[x.nome] && !novosErros[x.nome])) {
      let q = supabase.from(config.tabela).select("id", { count: "exact", head: true }).ilike(c.nome, String(dados[c.nome]).replace(/[%_\\]/g, "\\$&"));
      if (registro) q = q.neq("id", registro.id);
      const { count } = await q;
      if (count) novosErros[c.nome] = `Já existe ${config.singular === "embalagem" ? "uma embalagem" : "um cadastro"} com este ${c.rotulo.toLowerCase()}`;
    }

    setErros(novosErros);
    if (Object.keys(novosErros).length) {
      notify.warning("Verifique os campos destacados");
      return;
    }
    salvar.mutate(dados);
  }

  const set = (k: string, v: string) => setValores((s) => ({ ...s, [k]: v }));

  return (
    <FormModal
      open
      onOpenChange={(o) => !o && !salvar.isPending && onClose()}
      title={registro ? `Editar ${config.singular}` : `Novo ${config.singular}`}
      description="Campos marcados com * são obrigatórios."
      submitLabel={salvar.isPending ? "Salvando..." : "Salvar"}
      submitting={salvar.isPending}
      onSubmit={enviar}
    >
      {config.campos.map((c) => (
        <FormField key={c.nome} id={c.nome} label={c.rotulo + (c.obrigatorio ? " *" : "")} {...(erros[c.nome] ? { error: erros[c.nome]! } : {})}>
          <CampoInput campo={c} valor={valores[c.nome] ?? ""} onChange={(v) => set(c.nome, v)} />
        </FormField>
      ))}
    </FormModal>
  );
}

function CampoInput({ campo: c, valor, onChange }: { campo: Campo; valor: string; onChange: (v: string) => void }) {
  if (c.tipo === "textarea") return <Textarea id={c.nome} value={valor} onChange={(e) => onChange(e.target.value)} />;
  if (c.tipo === "cor")
    return (
      <div className="flex gap-2">
        <input
          type="color"
          aria-label="Escolher cor"
          value={/^#[0-9a-f]{6}$/i.test(valor) ? valor : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded border bg-card"
        />
        <Input id={c.nome} value={valor} placeholder="#1E3A5F" onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  if (c.tipo === "uf" || c.tipo === "opcoes" || c.tipo === "referencia") {
    const opcoes = c.tipo === "uf" ? UFS.map((u) => ({ value: u, label: u })) : c.tipo === "opcoes" ? c.opcoes : null;
    return opcoes ? (
      <Escolha id={c.nome} valor={valor} onChange={onChange} opcoes={opcoes} opcional={!c.obrigatorio} />
    ) : (
      <Referencia campo={c as Extract<Campo, { tipo: "referencia" }>} valor={valor} onChange={onChange} />
    );
  }
  return (
    <Input
      id={c.nome}
      type={c.tipo === "email" ? "email" : "text"}
      inputMode={c.tipo === "numero" ? "decimal" : undefined}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Escolha({
  id,
  valor,
  onChange,
  opcoes,
  opcional,
  carregando,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  opcoes: { value: string; label: string }[];
  opcional: boolean;
  carregando?: boolean;
}) {
  return (
    <Select value={valor || (opcional ? NENHUM : "")} onValueChange={(v) => onChange(v === NENHUM ? "" : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={carregando ? "Carregando..." : "Selecione"} />
      </SelectTrigger>
      <SelectContent>
        {opcional && <SelectItem value={NENHUM}>— Nenhum —</SelectItem>}
        {opcoes.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Referencia({ campo, valor, onChange }: { campo: Extract<Campo, { tipo: "referencia" }>; valor: string; onChange: (v: string) => void }) {
  const q = useQuery({
    queryKey: ["opcoes", campo.tabela, campo.filtro?.valor],
    queryFn: async () => {
      let consulta = supabase.from(campo.tabela).select(["id", "ativo", ...campo.rotuloColunas].join(",")).eq("ativo", true);
      if (campo.filtro) consulta = consulta.eq(campo.filtro.coluna, campo.filtro.valor);
      const { data, error } = await consulta.order(campo.rotuloColunas[campo.rotuloColunas.length - 1]!);
      if (error) throw error;
      return ((data ?? []) as unknown as Record<string, string>[]).map((r) => ({
        value: r["id"]!,
        label: campo.rotuloColunas.map((k) => r[k]).filter(Boolean).join(" — "),
      }));
    },
  });
  return <Escolha id={campo.nome} valor={valor} onChange={onChange} opcoes={q.data ?? []} opcional={!campo.obrigatorio} carregando={q.isLoading} />;
}
