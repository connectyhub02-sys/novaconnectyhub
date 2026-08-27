import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientAutomationsCenter } from "@/components/connectyhub-os/client-automations-center";
import { ConnectyShell } from "@/components/connectyhub-os/connecty-shell";
import { getClientAgentsWorkspace } from "@/lib/client-os/agents";
import { listClientCompanies } from "@/lib/client-os/companies";
import { currentOrganizationToClientCompany } from "@/lib/client-os/current-company";
import {
  listClientSalesCatalog,
  listClientSalesCatalogSettings,
  listClientSalesCatalogWhatsappInstances,
} from "@/lib/client-os/sales-catalog";
import { getCurrentWorkspace } from "@/lib/supabase/profile";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Automacoes | ConnectyHub",
  description: "Mensagens automaticas, WhatsApp de envio e ofertas extras do checkout.",
};

export default async function DashboardAutomacoesPage() {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/login?next=%2Fdashboard%2Fautomacoes");
  }

  const client = createServiceClient();
  const [companies, settings, products, whatsappInstances] = await Promise.all([
    listClientCompanies(workspace.user.id, client),
    listClientSalesCatalogSettings({ userId: workspace.user.id, client }),
    listClientSalesCatalog({ userId: workspace.user.id, client }),
    listClientSalesCatalogWhatsappInstances({ userId: workspace.user.id, client }),
  ]);
  const organization = workspace.organization;
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
      activeHref="/dashboard/automacoes"
      isPlatformAdmin={workspace.profile.isPlatformAdmin}
      mode="client"
      userAvatarUrl={workspace.profile.avatarUrl}
      userLabel={workspace.profile.email ?? undefined}
      workspaceName={organization?.name ?? workspace.profile.companyName ?? "Workspace"}
    >
      <ClientAutomationsCenter
        agents={agentWorkspace?.agents ?? []}
        companies={companies}
        initialCompanyId={organizationCompanyId ?? companies[0]?.id ?? null}
        initialSettings={settings}
        products={products}
        whatsappInstances={whatsappInstances}
      />
    </ConnectyShell>
  );
}
