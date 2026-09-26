import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mockUser, mockNotifications } from "@/lib/mock/dashboard";

export const Route = createFileRoute("/_painel")({
  component: PainelLayout,
});

function PainelLayout() {
  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader userName={mockUser.name} userRole={mockUser.role} notifications={mockNotifications} />
        <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
    </TooltipProvider>
  );
}
