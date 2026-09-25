import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tintas Gestão" },
      { name: "description", content: "Sistema interno de gestão da fábrica de tintas." },
      { property: "og:title", content: "Tintas Gestão" },
      { property: "og:description", content: "Sistema interno de gestão da fábrica de tintas." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
