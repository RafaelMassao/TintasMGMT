import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tintas Gestão" },
      { name: "description", content: "Sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Tintas Gestão" },
      { property: "og:description", content: "Sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/login" });
  },
});
