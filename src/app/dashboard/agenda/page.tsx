import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientAgendaCenter } from "@/components/connectyhub-os/client-agenda-center";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getClientAgentsWorkspace } from "@/lib/client-os/agents";
import { listClientCompanies } from "@/lib/client-os/companies";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import {
  listClientSalesCatalogSettings,
  listClientSalesCatalogWhatsappInstances,
} from "@/lib/client-os/sales-catalog";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agenda inteligente | ConnectyHub",
  description: "Calendário, serviços e reservas da sua empresa.",
};

export default async function DashboardAgendaPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fagenda");
  }

  const client = createServiceClient();
  const [companies, settings, whatsappInstances] = await Promise.all([
    listClientCompanies(workspace.user.id, client),
    listClientSalesCatalogSettings({ userId: workspace.user.id, client }),
    listClientSalesCatalogWhatsappInstances({ userId: workspace.user.id, client }),
  ]);
  const organization = workspace.organization;
  const requestedCompanyId = (await searchParams).companyId;
  const selectedCompanyId = companies.some(company => company.id === requestedCompanyId) ? requestedCompanyId : null;
  const organizationCompanyId = organization && companies.some((company) => company.id === organization.id)
    ? organization.id
    : null;
  const agentWorkspace = organization
    ? await getClientAgentsWorkspace({
        userId: workspace.user.id,
        organizationId: organization.id,
        company: currentOrganizationToClientCompany(organization),
      })
    : null;

  return (
    <ConnectyShell
      activeHref="/dashboard/agenda"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <ClientAgendaCenter
        agents={agentWorkspace?.agents ?? []}
        companies={companies}
        initialCompanyId={selectedCompanyId ?? organizationCompanyId ?? companies[0]?.id ?? null}
        initialSettings={settings}
        whatsappInstances={whatsappInstances}
      />
    </ConnectyShell>
  );
}
