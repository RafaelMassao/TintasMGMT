import type { Perfil } from "@/lib/permissoes";

export type Campo =
  | { nome: string; rotulo: string; tipo: "texto" | "textarea" | "email" | "cor"; obrigatorio?: boolean; max?: number }
  | { nome: string; rotulo: string; tipo: "numero"; obrigatorio?: boolean; min?: number }
  | { nome: string; rotulo: string; tipo: "uf"; obrigatorio?: boolean }
  | { nome: string; rotulo: string; tipo: "opcoes"; obrigatorio?: boolean; opcoes: { value: string; label: string }[] }
  | {
      nome: string;
      rotulo: string;
      tipo: "referencia";
      obrigatorio?: boolean;
      tabela: string;
      rotuloColunas: string[];
      filtro?: { coluna: string; valor: string };
    };

export type Coluna = { chave: string; titulo: string; valor: (r: any) => string; principal?: boolean; esconderCelular?: boolean };
export type Registro = Record<string, any> & { id: string; ativo: boolean };

export type CadastroConfig = {
  slug: string;
  tabela: string;
  titulo: string;
  singular: string;
  select: string;
  busca: string[];
  ordem: string;
  editores: Perfil[];
  campos: Campo[];
  colunas: Coluna[];
};

export const TIPOS_EQUIPAMENTO = [
  { value: "tanque", label: "Tanque" },
  { value: "motor", label: "Motor" },
  { value: "bomba", label: "Bomba" },
  { value: "envase", label: "Equipamento de envase" },
  { value: "maquina_pintura", label: "Máquina de pintura" },
];

const rel = (r: any, k: string, c = "nome") => (r[k]?.[c] as string | undefined) ?? "—";
const t = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const codigo: Campo = { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, max: 40 };
const nome: Campo = { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, max: 150 };
const unidade: Campo = { nome: "unidade_medida_id", rotulo: "Unidade de medida", tipo: "referencia", tabela: "unidades_medida", rotuloColunas: ["sigla", "nome"] };

const pessoa = (tabela: string, titulo: string, singular: string, editores: Perfil[]): CadastroConfig => ({
  slug: tabela,
  tabela,
  titulo,
  singular,
  select: "*",
  busca: ["nome", "documento", "email", "cidade"],
  ordem: "nome",
  editores,
  campos: [
    nome,
    { nome: "documento", rotulo: "CPF/CNPJ", tipo: "texto", max: 20 },
    { nome: "email", rotulo: "E-mail", tipo: "email", max: 255 },
    { nome: "telefone", rotulo: "Telefone", tipo: "texto", max: 20 },
    { nome: "cidade", rotulo: "Cidade", tipo: "texto", max: 100 },
    { nome: "uf", rotulo: "UF", tipo: "uf" },
  ],
  colunas: [
    { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
    { chave: "documento", titulo: "CPF/CNPJ", valor: (r) => t(r.documento) },
    { chave: "telefone", titulo: "Telefone", valor: (r) => t(r.telefone), esconderCelular: true },
    { chave: "cidade", titulo: "Cidade", valor: (r) => (r.cidade ? `${r.cidade}${r.uf ? "/" + r.uf : ""}` : "—") },
  ],
});

const motivo = (tabela: string, titulo: string, singular: string): CadastroConfig => ({
  slug: tabela,
  tabela,
  titulo,
  singular,
  select: "*",
  busca: ["descricao"],
  ordem: "descricao",
  editores: [],
  campos: [{ nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, max: 150 }],
  colunas: [{ chave: "descricao", titulo: "Descrição", valor: (r) => r.descricao, principal: true }],
});

export const CADASTROS: CadastroConfig[] = [
  {
    slug: "produtos",
    tabela: "produtos",
    titulo: "Produtos",
    singular: "produto",
    select: "*, cores(nome), embalagens(nome), unidades_medida(sigla)",
    busca: ["codigo", "nome"],
    ordem: "nome",
    editores: ["producao", "estoque"],
    campos: [
      codigo,
      nome,
      { nome: "descricao", rotulo: "Descrição", tipo: "textarea", max: 500 },
      { nome: "cor_id", rotulo: "Cor", tipo: "referencia", tabela: "cores", rotuloColunas: ["codigo", "nome"] },
      { nome: "embalagem_id", rotulo: "Embalagem", tipo: "referencia", tabela: "embalagens", rotuloColunas: ["codigo", "nome"] },
      unidade,
    ],
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "cor", titulo: "Cor", valor: (r) => rel(r, "cores") },
      { chave: "emb", titulo: "Embalagem", valor: (r) => rel(r, "embalagens"), esconderCelular: true },
    ],
  },
  {
    slug: "cores",
    tabela: "cores",
    titulo: "Cores",
    singular: "cor",
    select: "*",
    busca: ["codigo", "nome"],
    ordem: "nome",
    editores: ["producao", "estoque"],
    campos: [codigo, nome, { nome: "hex", rotulo: "Cor de referência", tipo: "cor" }],
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "hex", titulo: "Referência", valor: (r) => t(r.hex) },
    ],
  },
  {
    slug: "embalagens",
    tabela: "embalagens",
    titulo: "Embalagens",
    singular: "embalagem",
    select: "*, unidades_medida(sigla)",
    busca: ["codigo", "nome"],
    ordem: "nome",
    editores: ["producao", "estoque"],
    campos: [codigo, nome, { nome: "capacidade", rotulo: "Capacidade", tipo: "numero", min: 0 }, unidade],
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      {
        chave: "cap",
        titulo: "Capacidade",
        valor: (r) => (r.capacidade != null ? `${Number(r.capacidade).toLocaleString("pt-BR")} ${rel(r, "unidades_medida", "sigla")}` : "—"),
      },
    ],
  },
  pessoa("clientes", "Clientes", "cliente", ["vendas"]),
  pessoa("fornecedores", "Fornecedores", "fornecedor", ["estoque"]),
  {
    slug: "materiais",
    tabela: "materiais",
    titulo: "Materiais",
    singular: "material",
    select: "*, fornecedores(nome), unidades_medida(sigla)",
    busca: ["codigo", "nome"],
    ordem: "nome",
    editores: ["estoque"],
    campos: [
      codigo,
      nome,
      unidade,
      { nome: "fornecedor_padrao_id", rotulo: "Fornecedor padrão", tipo: "referencia", tabela: "fornecedores", rotuloColunas: ["nome"] },
      { nome: "estoque_minimo", rotulo: "Estoque mínimo", tipo: "numero", min: 0 },
    ],
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "forn", titulo: "Fornecedor padrão", valor: (r) => rel(r, "fornecedores") },
      {
        chave: "min",
        titulo: "Estoque mínimo",
        valor: (r) => `${Number(r.estoque_minimo ?? 0).toLocaleString("pt-BR")} ${r.unidades_medida?.sigla ?? ""}`,
        esconderCelular: true,
      },
    ],
  },
  {
    slug: "equipamentos",
    tabela: "equipamentos",
    titulo: "Equipamentos",
    singular: "equipamento",
    select: "*",
    busca: ["codigo", "nome", "fabricante", "localizacao"],
    ordem: "nome",
    editores: ["manutencao"],
    campos: [
      codigo,
      nome,
      { nome: "tipo", rotulo: "Tipo", tipo: "opcoes", obrigatorio: true, opcoes: TIPOS_EQUIPAMENTO },
      { nome: "fabricante", rotulo: "Fabricante", tipo: "texto", max: 100 },
      { nome: "modelo", rotulo: "Modelo", tipo: "texto", max: 100 },
      { nome: "numero_serie", rotulo: "Número de série", tipo: "texto", max: 100 },
      { nome: "localizacao", rotulo: "Localização", tipo: "texto", max: 150 },
    ],
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "tipo", titulo: "Tipo", valor: (r) => TIPOS_EQUIPAMENTO.find((x) => x.value === r.tipo)?.label ?? r.tipo },
      { chave: "loc", titulo: "Localização", valor: (r) => t(r.localizacao), esconderCelular: true },
    ],
  },
  {
    slug: "tanques",
    tabela: "tanques",
    titulo: "Tanques",
    singular: "tanque",
    select: "*, equipamentos!inner(codigo, nome)",
    busca: ["material_construcao"],
    ordem: "criado_em",
    editores: ["manutencao"],
    campos: [
      {
        nome: "equipamento_id",
        rotulo: "Equipamento (tipo tanque)",
        tipo: "referencia",
        obrigatorio: true,
        tabela: "equipamentos",
        rotuloColunas: ["codigo", "nome"],
        filtro: { coluna: "tipo", valor: "tanque" },
      },
      { nome: "capacidade_litros", rotulo: "Capacidade (litros)", tipo: "numero", obrigatorio: true, min: 0.01 },
      { nome: "material_construcao", rotulo: "Material de construção", tipo: "texto", max: 100 },
    ],
    colunas: [
      { chave: "eq", titulo: "Equipamento", valor: (r) => `${r.equipamentos?.codigo ?? ""} — ${r.equipamentos?.nome ?? ""}`, principal: true },
      { chave: "cap", titulo: "Capacidade", valor: (r) => `${Number(r.capacidade_litros).toLocaleString("pt-BR")} L` },
      { chave: "mat", titulo: "Material", valor: (r) => t(r.material_construcao) },
    ],
  },
  motivo("motivos_perda", "Motivos de perda", "motivo de perda"),
  motivo("motivos_atraso", "Motivos de atraso", "motivo de atraso"),
];

export const podeEditarCadastro = (perfis: Perfil[], c: CadastroConfig) =>
  perfis.includes("administrador") || perfis.includes("gestor") || perfis.some((p) => c.editores.includes(p));
