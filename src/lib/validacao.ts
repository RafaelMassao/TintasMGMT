/** Utilitários de validação compartilhados pelos formulários do aplicativo. */
export function numeroPtBR(valor: string): number | null {
  const bruto = valor.trim().replace(/\s/g, "");
  if (!bruto) return null;
  const normalizado = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

export function dataISOValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  if (!ano || !mes || !dia) return false;
  const data = new Date(Date.UTC(ano!, mes! - 1, dia!));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes! - 1 && data.getUTCDate() === dia
  );
}

export function dataHoraLocalValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(valor)) return false;
  const [data, hora] = valor.split("T");
  if (!dataISOValida(data!)) return false;
  const partes = hora!.split(":").map(Number);
  const h = partes[0] ?? Number.NaN;
  const m = partes[1] ?? Number.NaN;
  const s = partes[2] ?? 0;
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59;
}

/** Converte erros frequentes do PostgreSQL/PostgREST em mensagens acionáveis em português. */
export function mensagemErroValidacao(mensagem: string): string {
  if (/duplicate key|unique constraint|23505/i.test(mensagem))
    return "Já existe um registro com esse código, número ou nome.";
  if (/not-null|not null|23502/i.test(mensagem)) return "Preencha todos os campos obrigatórios.";
  if (/check constraint|23514/i.test(mensagem))
    return "Um ou mais valores não atendem às regras de validação.";
  if (/foreign key|23503/i.test(mensagem))
    return "Selecione um registro relacionado que ainda esteja ativo.";
  if (/row-level security|permission denied|42501/i.test(mensagem))
    return "Seu perfil não tem permissão para esta ação.";
  if (/date\/time field|invalid input syntax for type date|22007|22008/i.test(mensagem))
    return "Informe uma data válida.";
  if (
    /não|informe|selecione|inclua|quantidade|produto|pedido|equipamento|validade|motivo|fornecedor|recebimento|movimentação|parada|lote/i.test(
      mensagem,
    )
  )
    return mensagem;
  return "Não foi possível salvar. Confira os dados e tente novamente.";
}
