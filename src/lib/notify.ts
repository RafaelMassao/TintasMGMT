import { toast } from "sonner";

/** Mensagens padronizadas de feedback do sistema. */
export const notify = {
  success: (title: string, description?: string) => toast.success(title, { description }),
  error: (title: string, description?: string) =>
    toast.error(title, { description: description ?? "Tente novamente. Se persistir, contate o suporte." }),
  warning: (title: string, description?: string) => toast.warning(title, { description }),
  info: (title: string, description?: string) => toast.info(title, { description }),
};
