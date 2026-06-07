import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientDashboard } from "@/components/connectyhub-os/client-dashboard";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const metadata: Metadata = {
  title: "Dashboard | ConnectyHub",
  description: "Painel do cliente ConnectyHub para leads, conversas, agentes, links rastreaveis e automacoes.",
};

type DashboardPageProps = {
  searchParams?: Promise<{
    view?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = (await searchParams) ?? {};
  const workspace = await getCurrentWorkspace();

  if (workspace?.profile.isPlatformAdmin && params.view !== "client") {
    redirect("/admin");
  }

  const profile = workspace?.profile;
  const organization = workspace?.organization;

  return (
    <ClientDashboard
      isPlatformAdmin={profile?.isPlatformAdmin ?? false}
      userLabel={profile?.email ?? undefined}
      workspaceName={organization?.name ?? profile?.companyName ?? "Workspace"}
    />
  );
}
