import type { Perfil } from "@/lib/permissoes";

type Base = { nome: string; rotulo: string; obrigatorio?: boolean; unico?: boolean; dica?: string; valorPadrao?: string };
export type Campo = Base &
  (
    | { tipo: "texto" | "textarea" | "email" | "cor"; max?: number }
    | { tipo: "numero"; min?: number }
    | { tipo: "uf" }
    | { tipo: "opcoes"; opcoes: { value: string; label: string }[] }
    | { tipo: "referencia"; tabela: string; rotuloColunas: string[]; filtro?: { coluna: string; valor: string } }
  );

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
  /** Validações entre campos (ex.: máximo ≥ mínimo). Retorna erros por campo. */
  validar?: (dados: Record<string, unknown>) => Record<string, string>;
};

const num = (v: unknown) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 }));

export const TIPOS_TINTA = [
  { value: "acrilica", label: "Acrílica" },
  { value: "latex_pva", label: "Látex PVA" },
  { value: "esmalte", label: "Esmalte" },
  { value: "epoxi", label: "Epóxi" },
  { value: "verniz", label: "Verniz" },
  { value: "textura", label: "Textura" },
  { value: "fundo", label: "Fundo / Primer" },
  { value: "outra", label: "Outra" },
];

export const FAMILIAS_COR = [
  { value: "brancos", label: "Brancos" },
  { value: "neutros", label: "Neutros / Cinzas" },
  { value: "pretos", label: "Pretos" },
  { value: "amarelos", label: "Amarelos" },
  { value: "laranjas", label: "Laranjas" },
  { value: "vermelhos", label: "Vermelhos" },
  { value: "rosas", label: "Rosas" },
  { value: "violetas", label: "Violetas" },
  { value: "azuis", label: "Azuis" },
  { value: "verdes", label: "Verdes" },
  { value: "marrons", label: "Marrons / Terrosos" },
];

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

const pessoa = (
  tabela: string,
  titulo: string,
  singular: string,
  editores: Perfil[],
  extras: { campos?: Campo[]; colunas?: Coluna[] } = {},
): CadastroConfig => ({
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
    ...(extras.campos ?? []),
  ],
  colunas: [
    { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
    { chave: "documento", titulo: "CPF/CNPJ", valor: (r) => t(r.documento) },
    { chave: "telefone", titulo: "Telefone", valor: (r) => t(r.telefone), esconderCelular: true },
    { chave: "cidade", titulo: "Cidade", valor: (r) => (r.cidade ? `${r.cidade}${r.uf ? "/" + r.uf : ""}` : "—") },
    ...(extras.colunas ?? []),
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
      { nome: "tipo_tinta", rotulo: "Tipo de tinta", tipo: "opcoes", obrigatorio: true, opcoes: TIPOS_TINTA },
      { nome: "cor_id", rotulo: "Cor", tipo: "referencia", tabela: "cores", rotuloColunas: ["codigo", "nome"] },
      { nome: "embalagem_id", rotulo: "Embalagem padrão", tipo: "referencia", tabela: "embalagens", rotuloColunas: ["nome"] },
      { ...unidade, obrigatorio: true },
      { nome: "estoque_minimo", rotulo: "Estoque mínimo", tipo: "numero", obrigatorio: true, min: 0 },
      { nome: "estoque_maximo", rotulo: "Estoque máximo", tipo: "numero", obrigatorio: true, min: 0 },
    ],
    validar: (d) =>
      typeof d["estoque_minimo"] === "number" && typeof d["estoque_maximo"] === "number" && d["estoque_maximo"] < d["estoque_minimo"]
        ? { estoque_maximo: "Deve ser maior ou igual ao estoque mínimo" }
        : {},
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "tipo", titulo: "Tipo", valor: (r) => TIPOS_TINTA.find((x) => x.value === r.tipo_tinta)?.label ?? "—" },
      { chave: "cor", titulo: "Cor", valor: (r) => rel(r, "cores") },
      { chave: "emb", titulo: "Embalagem", valor: (r) => rel(r, "embalagens"), esconderCelular: true },
      {
        chave: "est",
        titulo: "Estoque mín./máx.",
        valor: (r) => `${num(r.estoque_minimo)} / ${num(r.estoque_maximo)} ${r.unidades_medida?.sigla ?? ""}`,
        esconderCelular: true,
      },
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
    campos: [
      codigo,
      nome,
      { nome: "familia", rotulo: "Família da cor", tipo: "opcoes", obrigatorio: true, opcoes: FAMILIAS_COR },
      { nome: "hex", rotulo: "Cor de referência", tipo: "cor" },
    ],
    colunas: [
      { chave: "codigo", titulo: "Código", valor: (r) => r.codigo },
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "familia", titulo: "Família", valor: (r) => FAMILIAS_COR.find((x) => x.value === r.familia)?.label ?? "—" },
      { chave: "hex", titulo: "Referência", valor: (r) => t(r.hex), esconderCelular: true },
    ],
  },
  {
    slug: "embalagens",
    tabela: "embalagens",
    titulo: "Embalagens",
    singular: "embalagem",
    select: "*, unidades_medida(sigla)",
    busca: ["nome"],
    ordem: "volume_litros",
    editores: ["producao", "estoque"],
    campos: [
      { ...nome, unico: true },
      { nome: "volume_litros", rotulo: "Volume (litros)", tipo: "numero", obrigatorio: true, min: 0.001, dica: "Ex.: 1, 3,6 ou 18" },
      { ...unidade, obrigatorio: true },
    ],
    colunas: [
      { chave: "nome", titulo: "Nome", valor: (r) => r.nome, principal: true },
      { chave: "vol", titulo: "Volume", valor: (r) => (r.volume_litros != null ? `${num(r.volume_litros)} L` : "—") },
      { chave: "un", titulo: "Unidade", valor: (r) => rel(r, "unidades_medida", "sigla") },
    ],
  },
  pessoa("clientes", "Clientes", "cliente", ["vendas"]),
  pessoa("fornecedores", "Fornecedores", "fornecedor", ["estoque"], {
    campos: [
      {
        nome: "prazo_entrega_dias",
        rotulo: "Prazo médio de entrega (dias)",
        tipo: "numero",
        obrigatorio: true,
        min: 0,
        valorPadrao: "7",
        dica: "Usado para calcular o ponto de reposição sugerido.",
      },
    ],
    colunas: [
      { chave: "prazo", titulo: "Prazo médio", valor: (r) => `${num(r.prazo_entrega_dias ?? 7)} dias`, esconderCelular: true },
    ],
  }),
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
