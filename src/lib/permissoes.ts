export const PERFIS = ["administrador", "gestor", "producao", "estoque", "vendas", "manutencao"] as const;
export type Perfil = (typeof PERFIS)[number];

export const PERFIL_LABEL: Record<Perfil, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  producao: "Produção",
  estoque: "Estoque",
  vendas: "Vendas",
  manutencao: "Manutenção",
};

/** Quem pode abrir cada página. Administrador e gestor sempre veem tudo (exceto Configurações = só admin). */
const ACESSO: Record<string, Perfil[]> = {
  "/dashboard": [...PERFIS],
  "/producao": ["producao"],
  "/envase": ["producao"], // envase manual dos lotes
  "/perdas": ["producao"],
  "/estoque": ["estoque", "vendas"], // vendas: só consulta
  "/compras": ["estoque"],
  "/pedidos": ["vendas"],
  "/manutencao": ["manutencao"], // equipamentos, manutenções e paradas
  "/cadastros": ["vendas", "manutencao", "estoque", "producao"], // leitura para todos; edição conforme o cadastro
  "/relatorios": [],
  "/configuracoes": [],
};

export function podeAcessar(perfis: Perfil[], caminho: string): boolean {
  if (caminho === "/sem-acesso") return true;
  if (perfis.includes("administrador")) return true;
  const chave = Object.keys(ACESSO).find((k) => caminho === k || caminho.startsWith(k + "/"));
  if (!chave) return false;
  if (perfis.includes("gestor")) return chave !== "/configuracoes";
  return perfis.some((p) => ACESSO[chave]!.includes(p));
}

export const podeAprovar = (perfis: Perfil[]) => perfis.includes("administrador") || perfis.includes("gestor");
