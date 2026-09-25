import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileNav } from "@/components/layout/MobileNav";
import { mockUser, mockNotifications } from "@/lib/mock/dashboard";

export const Route = createFileRoute("/_painel")({
  component: PainelLayout,
});

function PainelLayout() {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader userName={mockUser.name} userRole={mockUser.role} notifications={mockNotifications} />
        <main className="flex-1 space-y-6 p-4 pb-24 lg:p-6 lg:pb-6">
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
