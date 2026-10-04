import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Confirmação obrigatória antes de ações destrutivas (ex.: excluir).
 * `onConfirm` pode ser assíncrono — o botão mostra carregamento até terminar.
 */
export function ConfirmDialog({
  trigger,
  open: openControlado,
  onOpenChange: onOpenChangeControlado,
  title = "Confirmar exclusão",
  description = "Esta ação não pode ser desfeita.",
  confirmLabel = "Excluir",
  onConfirm,
}: {
  trigger?: ReactNode;
  /** Modo controlado (sem trigger): abre/fecha pelo componente pai. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
}) {
  const [openInterno, setOpenInterno] = useState(false);
  const open = openControlado ?? openInterno;
  const setOpen = (o: boolean) => {
    if (openControlado === undefined) setOpenInterno(o);
    onOpenChangeControlado?.(o);
  };
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !loading && setOpen(o)}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader className="sm:flex-row sm:items-start sm:gap-4 sm:text-left">
          <div className="mx-auto grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive sm:mx-0">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <AlertDialogTitle className="font-display">{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" loading={loading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
