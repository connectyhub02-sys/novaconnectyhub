import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientReportsConsole } from "@/components/connectyhub-os/client-reports-console";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import { getClientDashboardOverview } from "@/lib/client-os/dashboard-overview";
import { getCurrentWorkspace } from "@/lib/supabase/profile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Relatórios | ConnectyHub",
  description: "Relatórios do painel do usuário com leads, conversas, vendas, créditos e automações.",
};

export default async function DashboardRelatoriosPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Frelatorios");
  }

  if (!workspace.organization && !workspace.profile.isPlatformAdmin) {
    redirect("/dashboard/empresa");
  }

  const profile = workspace.profile;
  const organization = workspace.organization;
  const company = currentOrganizationToClientCompany(organization);
  const overview = await getClientDashboardOverview({
    userId: workspace.user.id,
    organizationId: organization?.id,
    company,
  });

  return (
    <ConnectyShell
      activeHref="/dashboard/relatorios"
      isPlatformAdmin={profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={profile.avatarUrl}
      userLabel={profile.email ?? undefined}
      workspaceName={organization?.name ?? profile.companyName ?? "Workspace"}
    >
      <ClientReportsConsole overview={overview} />
    </ConnectyShell>
  );
}
