import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard | ConnectyHub",
  description: "Indicadores do painel do usuário com leads, conversas, vendas, créditos e automações.",
};

export default async function DashboardRelatoriosPage() {
  redirect("/dashboard");
}
