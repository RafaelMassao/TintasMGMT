// Traduz mensagens de erro de autenticação do Supabase para pt-BR.
export function traduzirErroAuth(mensagem: string): string {
  const m = mensagem.toLowerCase();

  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (m.includes("user already registered")) return "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha.";
  if (m.includes("password") && m.includes("at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "Informe um e-mail válido.";
  if (m.includes("rate limit") || m.includes("too many requests")) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (m.includes("network") || m.includes("fetch")) return "Sem conexão com o servidor. Verifique sua internet.";
  if (m.includes("same password")) return "A nova senha não pode ser igual à anterior.";
  if (m.includes("session") && m.includes("expired")) return "Sua sessão expirou. Entre novamente.";

  return "Não foi possível concluir. Tente novamente em instantes.";
}
