import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:border-l-4 group-[.toaster]:shadow-lg group-[.toaster]:rounded-md",
          title: "group-[.toast]:font-semibold",
          description: "group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:border-l-success [&_[data-icon]]:text-success",
          error: "group-[.toaster]:border-l-destructive [&_[data-icon]]:text-destructive",
          warning: "group-[.toaster]:border-l-warning [&_[data-icon]]:text-warning",
          info: "group-[.toaster]:border-l-info [&_[data-icon]]:text-info",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
